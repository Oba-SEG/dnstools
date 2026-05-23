'use strict';

const express = require('express');
const dns = require('node:dns/promises');
const { normaliseDomain, isPlausibleDomain } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const SUPPORTED_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA'];
const QUERY_TIMEOUT_MS = 5000;

async function resolveType(domain, type) {
  const resolver = new dns.Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 2 });
  // Use a known-good upstream for the synchronous lookup endpoint. Per-resolver
  // queries happen in /propagation.
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  try {
    switch (type) {
      case 'A':     return { type, records: await resolver.resolve4(domain) };
      case 'AAAA':  return { type, records: await resolver.resolve6(domain) };
      case 'CNAME': return { type, records: await resolver.resolveCname(domain) };
      case 'MX':    return { type, records: await resolver.resolveMx(domain) };
      case 'NS':    return { type, records: await resolver.resolveNs(domain) };
      case 'TXT':   return { type, records: (await resolver.resolveTxt(domain)).map(chunks => chunks.join('')) };
      case 'SOA':   return { type, records: [await resolver.resolveSoa(domain)] };
      case 'SRV':   return { type, records: await resolver.resolveSrv(domain) };
      case 'CAA':   return { type, records: await resolver.resolveCaa(domain) };
      default:      return { type, error: 'unsupported-type' };
    }
  } catch (err) {
    return { type, records: [], error: err.code || err.message || 'lookup-failed' };
  }
}

const cachedResolve = memoizeAsync(resolveType, { ttl: 30_000, keyFn: (d, t) => `${d}::${t}` });

router.get('/', async (req, res) => {
  const target = normaliseDomain(req.query.domain || req.query.q);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain via ?domain=example.com' });
  }
  const requestedTypes = String(req.query.types || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
  const types = requestedTypes.length > 0
    ? requestedTypes.filter(t => SUPPORTED_TYPES.includes(t))
    : SUPPORTED_TYPES;

  const started = Date.now();
  const results = await Promise.all(types.map(t => cachedResolve(target, t)));
  res.json({
    domain: target,
    elapsed_ms: Date.now() - started,
    results,
  });
});

module.exports = router;
