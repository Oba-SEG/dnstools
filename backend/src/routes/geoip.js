'use strict';

// GeoIP / ASN lookup using the bundled geoip-lite database. No external
// API calls — keeps latency low and avoids leaking user queries to a
// third-party service. Database refresh is a manual operation
// (`npm run -w backend update-db` against geoip-lite's update script).

const express = require('express');
const net = require('node:net');
const dns = require('node:dns/promises');
const geoip = require('geoip-lite');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

async function lookup(target) {
  const ip = net.isIP(target) !== 0 ? target : (await dns.lookup(target, { family: 4 })).address;
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to look up ${c.reason || 'private'} address`), { code: 'PRIVATE_TARGET' });
  }
  const geo = geoip.lookup(ip);
  if (!geo) {
    return { target, ip, country: null, region: null, city: null, ll: null, range: null, timezone: null };
  }
  return {
    target,
    ip,
    country: geo.country || null,
    country_name: geo.country ? new Intl.DisplayNames(['en'], { type: 'region' }).of(geo.country) : null,
    region: geo.region || null,
    city: geo.city || null,
    coords: geo.ll ? { lat: geo.ll[0], lon: geo.ll[1] } : null,
    range: geo.range || null,
    timezone: geo.timezone || null,
    eu: geo.eu === '1',
    metro: geo.metro || null,
    area: geo.area || null,
  };
}

const cached = memoizeAsync(lookup, { ttl: 60 * 60_000, keyFn: (t) => t });

router.get('/', async (req, res) => {
  const target = String(req.query.q || req.query.host || req.query.ip || '').trim();
  if (!target) return res.status(400).json({ error: 'Provide ?q=<ip-or-domain>' });
  let cleanTarget = target;
  if (!net.isIP(target)) {
    cleanTarget = normaliseDomain(target);
    if (!cleanTarget) return res.status(400).json({ error: 'Invalid target' });
  }
  try {
    const started = Date.now();
    const result = await cached(cleanTarget);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(err.code === 'PRIVATE_TARGET' ? 400 : 502).json({ error: err.code || 'geoip-failed', detail: err.message });
  }
});

module.exports = router;
