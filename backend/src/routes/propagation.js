'use strict';

const express = require('express');
const dns = require('node:dns/promises');
const { normaliseDomain } = require('../lib/validate');
const { RESOLVERS } = require('../lib/resolvers');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const SUPPORTED_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];
const PER_RESOLVER_TIMEOUT_MS = 4000;

async function queryResolver(domain, type, resolverIp) {
  const r = new dns.Resolver({ timeout: PER_RESOLVER_TIMEOUT_MS, tries: 1 });
  r.setServers([resolverIp]);
  const started = Date.now();
  try {
    let records = [];
    switch (type) {
      case 'A':     records = await r.resolve4(domain); break;
      case 'AAAA':  records = await r.resolve6(domain); break;
      case 'CNAME': records = await r.resolveCname(domain); break;
      case 'MX':    records = (await r.resolveMx(domain)).map(m => `${m.priority} ${m.exchange}`); break;
      case 'NS':    records = await r.resolveNs(domain); break;
      case 'TXT':   records = (await r.resolveTxt(domain)).map(chunks => chunks.join('')); break;
      default:      records = [];
    }
    return { ok: true, records, latency_ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err.code || err.message || 'lookup-failed', latency_ms: Date.now() - started };
  }
}

const cachedQuery = memoizeAsync(queryResolver, {
  ttl: 30_000,
  keyFn: (d, t, r) => `${d}::${t}::${r}`,
});

router.get('/', async (req, res) => {
  const target = normaliseDomain(req.query.domain || req.query.q);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain via ?domain=example.com' });
  }
  const type = String(req.query.type || 'A').toUpperCase();
  if (!SUPPORTED_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unsupported type. Allowed: ${SUPPORTED_TYPES.join(', ')}` });
  }

  const started = Date.now();
  // Fire all resolver queries in parallel. Each has its own per-query
  // timeout (4s), so the whole call returns in ~4s worst case.
  const results = await Promise.all(
    RESOLVERS.map(async (r) => {
      const result = await cachedQuery(target, type, r.ip);
      return { resolver: r, ...result };
    })
  );

  // Determine consensus value(s) for visualisation (which resolvers
  // agree, which disagree).
  const fingerprints = new Map();
  for (const r of results) {
    const fp = r.ok ? JSON.stringify([...new Set(r.records)].sort()) : `error:${r.error}`;
    fingerprints.set(fp, (fingerprints.get(fp) || 0) + 1);
  }
  let dominant = null;
  for (const [fp, count] of fingerprints) {
    if (!dominant || count > dominant.count) dominant = { fingerprint: fp, count };
  }
  for (const r of results) {
    const fp = r.ok ? JSON.stringify([...new Set(r.records)].sort()) : `error:${r.error}`;
    r.consensus = fp === dominant?.fingerprint;
  }

  res.json({
    domain: target,
    type,
    elapsed_ms: Date.now() - started,
    resolvers: results,
    consensus: {
      total: results.length,
      agreeing: results.filter(r => r.consensus).length,
      ok: results.filter(r => r.ok).length,
    },
  });
});

module.exports = router;
