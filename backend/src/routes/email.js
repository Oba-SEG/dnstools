'use strict';

const express = require('express');
const dns = require('node:dns/promises');
const { normaliseDomain } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

const TIMEOUT_MS = 5000;

function makeResolver() {
  const r = new dns.Resolver({ timeout: TIMEOUT_MS, tries: 2 });
  r.setServers(['1.1.1.1', '8.8.8.8']);
  return r;
}

// Reasonable default DKIM selector list — covers the major ESPs. We try
// each and report which (if any) returned a record.
const COMMON_DKIM_SELECTORS = [
  'default', 'google', 'k1', 'k2', 'mail', 'selector1', 'selector2',
  'mxvault', 'dkim', 'sendgrid', 'mandrill', 's1', 's2', '20210112',
  'protonmail', 'protonmail2', 'protonmail3', 'fm1', 'fm2', 'fm3',
];

async function txtRecords(resolver, name) {
  try {
    const records = await resolver.resolveTxt(name);
    return records.map(chunks => chunks.join(''));
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    throw err;
  }
}

function parseSpf(records) {
  const spfRecord = records.find(r => r.toLowerCase().startsWith('v=spf1'));
  if (!spfRecord) return { present: false };
  const tokens = spfRecord.split(/\s+/);
  const mechanisms = tokens.slice(1).filter(t => !t.toLowerCase().startsWith('redirect') && t !== '');
  const all = mechanisms.find(m => /^[+\-~?]?all$/i.test(m)) || null;
  const includeCount = mechanisms.filter(m => m.toLowerCase().startsWith('include:')).length;
  // RFC 7208: max 10 DNS lookups (include / a / mx / ptr / exists / redirect)
  const lookupMechanisms = ['include:', 'a', 'mx', 'ptr', 'exists:', 'redirect='];
  const lookupCount = mechanisms.filter(m => lookupMechanisms.some(p => m.toLowerCase().startsWith(p))).length;
  return {
    present: true,
    record: spfRecord,
    mechanisms,
    all_qualifier: all,
    includes: includeCount,
    dns_lookups: lookupCount,
    rfc7208_lookup_overflow: lookupCount > 10,
  };
}

function parseDmarc(records) {
  const rec = records.find(r => r.toLowerCase().startsWith('v=dmarc1'));
  if (!rec) return { present: false };
  const tags = {};
  rec.split(';').slice(1).forEach(part => {
    const [k, v] = part.split('=').map(s => s && s.trim());
    if (k && v) tags[k.toLowerCase()] = v;
  });
  return {
    present: true,
    record: rec,
    policy: tags.p || 'none',
    subdomain_policy: tags.sp || tags.p || 'none',
    pct: tags.pct ? parseInt(tags.pct, 10) : 100,
    rua: tags.rua || null,
    ruf: tags.ruf || null,
    aspf: tags.aspf || 'r',
    adkim: tags.adkim || 'r',
    enforced: ['quarantine', 'reject'].includes((tags.p || '').toLowerCase()),
  };
}

function parseMtaSts(records) {
  const rec = records.find(r => r.toLowerCase().startsWith('v=stsv1'));
  if (!rec) return { present: false };
  const tags = {};
  rec.split(';').slice(1).forEach(part => {
    const [k, v] = part.split('=').map(s => s && s.trim());
    if (k && v) tags[k.toLowerCase()] = v;
  });
  return { present: true, record: rec, id: tags.id || null };
}

function parseTlsRpt(records) {
  const rec = records.find(r => r.toLowerCase().startsWith('v=tlsrptv1'));
  if (!rec) return { present: false };
  const ruaMatch = rec.match(/rua=([^;]+)/i);
  return { present: true, record: rec, rua: ruaMatch ? ruaMatch[1].trim() : null };
}

function parseBimi(records) {
  const rec = records.find(r => r.toLowerCase().startsWith('v=bimi1'));
  if (!rec) return { present: false };
  const tags = {};
  rec.split(';').slice(1).forEach(part => {
    const [k, v] = part.split('=').map(s => s && s.trim());
    if (k && v) tags[k.toLowerCase()] = v;
  });
  return { present: true, record: rec, l: tags.l || null, a: tags.a || null };
}

async function inspectEmail(domain) {
  const resolver = makeResolver();

  const [
    spfRecords,
    dmarcRecords,
    mtaStsRecords,
    tlsRptRecords,
    bimiRecords,
    mxRecords,
  ] = await Promise.all([
    txtRecords(resolver, domain),
    txtRecords(resolver, `_dmarc.${domain}`),
    txtRecords(resolver, `_mta-sts.${domain}`),
    txtRecords(resolver, `_smtp._tls.${domain}`),
    txtRecords(resolver, `default._bimi.${domain}`),
    resolver.resolveMx(domain).catch(() => []),
  ]);

  // DKIM: try each well-known selector, report which exist.
  const dkimChecks = await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (sel) => {
      const recs = await txtRecords(resolver, `${sel}._domainkey.${domain}`);
      const valid = recs.find(r => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='));
      return valid ? { selector: sel, record: valid } : null;
    })
  );

  return {
    domain,
    spf: parseSpf(spfRecords),
    dmarc: parseDmarc(dmarcRecords),
    mta_sts: parseMtaSts(mtaStsRecords),
    tls_rpt: parseTlsRpt(tlsRptRecords),
    bimi: parseBimi(bimiRecords),
    mx: {
      present: mxRecords.length > 0,
      records: mxRecords.map(m => ({ priority: m.priority, exchange: m.exchange })).sort((a, b) => a.priority - b.priority),
    },
    dkim: {
      selectors_checked: COMMON_DKIM_SELECTORS,
      found: dkimChecks.filter(Boolean),
    },
  };
}

const cachedInspect = memoizeAsync(inspectEmail, { ttl: 60_000, keyFn: (d) => d });

router.get('/', asyncHandler(async (req, res) => {
  const target = normaliseDomain(req.query.domain || req.query.q);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain via ?domain=example.com' });
  }
  const started = Date.now();
  try {
    const result = await cachedInspect(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(422).json({ error: 'Email inspection failed', detail: err.code || err.message });
  }
}));

module.exports = router;
