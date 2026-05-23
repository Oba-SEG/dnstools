'use strict';

// DNSBL (DNS-based Blocklist) check. Reverses the target IP and queries
// each blocklist as a DNS A record. If the lookup returns a positive
// answer, the IP is listed.

const express = require('express');
const dns = require('node:dns/promises');
const net = require('node:net');
const { classifyIp, normaliseDomain } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const BLOCKLISTS = [
  { id: 'spamhaus-zen', host: 'zen.spamhaus.org', name: 'Spamhaus ZEN' },
  { id: 'spamhaus-sbl', host: 'sbl.spamhaus.org', name: 'Spamhaus SBL' },
  { id: 'spamhaus-css', host: 'css.spamhaus.org', name: 'Spamhaus CSS' },
  { id: 'sorbs',        host: 'dnsbl.sorbs.net', name: 'SORBS' },
  { id: 'spamcop',      host: 'bl.spamcop.net', name: 'SpamCop' },
  { id: 'barracuda',    host: 'b.barracudacentral.org', name: 'Barracuda' },
  { id: 'mailspike',    host: 'bl.mailspike.net', name: 'Mailspike' },
  { id: 'cbl',          host: 'cbl.abuseat.org', name: 'CBL Abuseat' },
  { id: 'uceprotect-1', host: 'dnsbl-1.uceprotect.net', name: 'UCEPROTECT L1' },
  { id: 'uceprotect-2', host: 'dnsbl-2.uceprotect.net', name: 'UCEPROTECT L2' },
];

const QUERY_TIMEOUT_MS = 4000;

function reverseIp4(ip) { return ip.split('.').reverse().join('.'); }

async function checkOne(reversedIp, list) {
  const r = new dns.Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });
  r.setServers(['1.1.1.1', '8.8.8.8']);
  const queryHost = `${reversedIp}.${list.host}`;
  try {
    const records = await r.resolve4(queryHost);
    return { ...list, listed: true, response: records };
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { ...list, listed: false };
    }
    return { ...list, listed: null, error: err.code || 'lookup-failed' };
  }
}

async function lookupBlacklists(ip) {
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to check ${c.reason || 'invalid'} IP`), { code: 'INVALID_IP' });
  }
  // Most DNSBLs are IPv4-only; IPv6 support is patchy across providers.
  if (c.family !== 4) {
    throw Object.assign(new Error('IPv6 DNSBL queries are not supported'), { code: 'V6_UNSUPPORTED' });
  }
  const reversed = reverseIp4(ip);
  const results = await Promise.all(BLOCKLISTS.map(l => checkOne(reversed, l)));
  return {
    ip,
    listed_count: results.filter(r => r.listed).length,
    total_checked: results.length,
    results,
  };
}

const cached = memoizeAsync(lookupBlacklists, { ttl: 5 * 60_000, keyFn: (ip) => ip });

router.get('/', async (req, res) => {
  let target = String(req.query.ip || req.query.q || '').trim();

  // If they passed a domain, resolve to A records and check each.
  if (target && !net.isIP(target)) {
    const domain = normaliseDomain(target);
    if (!domain) return res.status(400).json({ error: 'Provide a valid IP or domain' });
    try {
      const r = new dns.Resolver({ timeout: 5000, tries: 2 });
      r.setServers(['1.1.1.1', '8.8.8.8']);
      const ips = await r.resolve4(domain);
      if (ips.length === 0) return res.status(404).json({ error: 'Domain has no A records' });
      const started = Date.now();
      const perIp = await Promise.all(ips.slice(0, 4).map(ip => cached(ip)));
      return res.json({ domain, results_per_ip: perIp, elapsed_ms: Date.now() - started });
    } catch (err) {
      return res.status(422).json({ error: 'Domain resolution failed', detail: err.code || err.message });
    }
  }

  if (!net.isIP(target)) return res.status(400).json({ error: 'Provide a valid IPv4 address via ?ip=...' });
  try {
    const started = Date.now();
    const result = await cached(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(err.code === 'INVALID_IP' || err.code === 'V6_UNSUPPORTED' ? 400 : 502).json({
      error: err.code || 'blacklist-check-failed',
      detail: err.message,
    });
  }
});

module.exports = router;
