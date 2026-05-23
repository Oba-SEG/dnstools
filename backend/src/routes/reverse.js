'use strict';

const express = require('express');
const dns = require('node:dns/promises');
const net = require('node:net');
const { classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

async function reverseLookup(ip) {
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to reverse-lookup ${c.reason || 'invalid'} address`), { code: 'INVALID_IP' });
  }
  const resolver = new dns.Resolver({ timeout: 5000, tries: 2 });
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  const hostnames = await resolver.reverse(ip);
  return { ip, family: c.family, hostnames };
}

const cached = memoizeAsync(reverseLookup, { ttl: 60_000, keyFn: (ip) => ip });

router.get('/', async (req, res) => {
  const ip = String(req.query.ip || req.query.q || '').trim();
  if (!net.isIP(ip)) {
    return res.status(400).json({ error: 'Provide a valid IPv4 or IPv6 address via ?ip=...' });
  }
  try {
    const started = Date.now();
    const result = await cached(ip);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(err.code === 'INVALID_IP' ? 400 : 502).json({
      error: err.code || 'reverse-lookup-failed',
      detail: err.message,
    });
  }
});

module.exports = router;
