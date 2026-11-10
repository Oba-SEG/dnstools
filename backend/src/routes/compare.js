'use strict';

const express = require('express');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { asyncHandler } = require('../lib/asyncHandler');
const lookup = require('./lookup');
const whoisRoute = require('./whois');

const router = express.Router();

const COMPARE_TYPES = ['A', 'AAAA', 'CNAME', 'NS', 'MX', 'TXT', 'SOA', 'CAA'];

const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const normRecords = (list) => Array.from(new Set(
  list.map(r => typeof r === 'string' ? r : (r && typeof r === 'object' ? JSON.stringify(r) : String(r)))
)).sort();

function diffSet(a, b) {
  const A = new Set(a), B = new Set(b);
  const only_a = a.filter(x => !B.has(x));
  const only_b = b.filter(x => !A.has(x));
  return { same: only_a.length === 0 && only_b.length === 0, a, b, only_a, only_b };
}

function diffScalar(a, b) {
  const an = a == null ? '' : String(a);
  const bn = b == null ? '' : String(b);
  return { same: an === bn, a: an, b: bn };
}

async function whoisOne(target) {
  try {
    const w = await whoisRoute.cachedWhois(target);
    const { raw: _omitRaw, elapsed_ms: _omitElapsed, ...core } = w;
    return { ok: true, whois: core };
  } catch (err) {
    return { ok: false, error: err.code || err.message || 'whois-failed' };
  }
}

async function dnsOne(target) {
  try {
    const results = await Promise.all(COMPARE_TYPES.map(t => lookup.cachedResolve(target, t)));
    return { ok: true, dns: results };
  } catch (err) {
    return { ok: false, error: err.code || err.message || 'dns-failed' };
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const validTarget = (input) => {
    const trimmed = String(input || '').trim();
    if (classifyIp(trimmed).valid) return trimmed;
    return normaliseDomain(trimmed);
  };
  const d1 = validTarget(req.query.domain1);
  const d2 = validTarget(req.query.domain2);
  if (!d1 || !d2 || d1 === d2) {
    return res.status(400).json({ error: 'Provide two different domains via ?domain1=a.com&domain2=b.com' });
  }

  const aspect = req.query.aspect === 'dns' || req.query.aspect === 'whois' ? req.query.aspect : 'all';
  const started = Date.now();

  const [resA, resB] = await Promise.all([
    (async () => ({
      whois: aspect !== 'dns' ? await whoisOne(d1) : null,
      dns: aspect !== 'whois' ? await dnsOne(d1) : null,
    }))(),
    (async () => ({
      whois: aspect !== 'dns' ? await whoisOne(d2) : null,
      dns: aspect !== 'whois' ? await dnsOne(d2) : null,
    }))(),
  ]);

  const diff = { whois: {}, dns: {} };

  if (resA.whois || resB.whois) {
    const a = resA.whois && resA.whois.ok ? resA.whois.whois : null;
    const b = resB.whois && resB.whois.ok ? resB.whois.whois : null;
    diff.whois.registrar = diffScalar(a && a.registrar, b && b.registrar);
    diff.whois.created = diffScalar(a && a.created, b && b.created);
    diff.whois.expires = diffScalar(a && a.expires, b && b.expires);
    diff.whois.dnssec = diffScalar(a && a.dnssec, b && b.dnssec);
    diff.whois.status = diffSet(normRecords(a && a.status || []), normRecords(b && b.status || []));
    diff.whois.nameservers = diffSet(normRecords(a && a.nameservers || []), normRecords(b && b.nameservers || []));
  }
  if (resA.dns || resB.dns) {
    const indexDns = (side) => {
      const map = {};
      if (side && side.ok) {
        for (const r of side.dns) map[r.type] = normRecords(r.records || []);
      }
      return map;
    };
    const aMap = indexDns(resA.dns);
    const bMap = indexDns(resB.dns);
    const types = COMPARE_TYPES.filter(t => (aMap[t] && aMap[t].length) || (bMap[t] && bMap[t].length));
    for (const t of types) {
      const d = diffSet(aMap[t] || [], bMap[t] || []);
      if (!d.same) diff.dns[t] = d;
    }
  }

  res.json({
    a: { domain: d1, lookup: resA },
    b: { domain: d2, lookup: resB },
    diff,
    elapsed_ms: Date.now() - started,
  });
}));

module.exports = router;
