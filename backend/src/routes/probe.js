'use strict';

// HTTP probe with timing breakdown — DNS lookup, TCP connect, TLS handshake,
// time-to-first-byte, total. Plus follows the redirect chain (manually) and
// reports the headers + status of every hop.

const express = require('express');
const dns = require('node:dns/promises');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

async function resolveAndGuard(host) {
  const ip = net.isIP(host) !== 0 ? host : (await dns.lookup(host, { family: 4 })).address;
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to fetch ${c.reason || 'private'} target`), { code: 'PRIVATE_TARGET' });
  }
  return ip;
}

async function timedRequest(rawUrl) {
  const url = new URL(rawUrl);
  const isHttps = url.protocol === 'https:';
  if (!isHttps && url.protocol !== 'http:') {
    throw Object.assign(new Error(`Unsupported protocol ${url.protocol}`), { code: 'BAD_PROTOCOL' });
  }
  const port = url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80);

  // SSRF guard
  await resolveAndGuard(url.hostname);

  const dnsStart = process.hrtime.bigint();
  const lookupResult = await dns.lookup(url.hostname, { family: 4 });
  const dnsMs = Number(process.hrtime.bigint() - dnsStart) / 1_000_000;

  return new Promise((resolve, reject) => {
    const lib = isHttps ? https : http;
    const req = lib.request({
      method: 'GET',
      host: url.hostname,
      port,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NexusDNS/1.0; +https://dns.segbytes.co.za)',
        'Accept': '*/*',
      },
      timeout: REQUEST_TIMEOUT_MS,
      // Don't follow redirects automatically — we want each hop visible.
    }, (res) => {
      const ttfb = Number(process.hrtime.bigint() - dnsStart) / 1_000_000;
      let total = ttfb;
      let bytes = 0;
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.on('end', () => {
        total = Number(process.hrtime.bigint() - dnsStart) / 1_000_000;
        resolve({
          url: rawUrl,
          status: res.statusCode,
          status_text: res.statusMessage,
          peer: lookupResult.address,
          headers: res.headers,
          location: res.headers.location || null,
          bytes,
          timing: {
            dns_ms: dnsMs.toFixed(2),
            ttfb_ms: ttfb.toFixed(2),
            total_ms: total.toFixed(2),
          },
        });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function probe(rawUrl) {
  const chain = [];
  let next = rawUrl;
  for (let i = 0; i < MAX_REDIRECTS && next; i++) {
    const hop = await timedRequest(next);
    chain.push(hop);
    if (hop.status >= 300 && hop.status < 400 && hop.location) {
      // Resolve relative redirects
      try {
        next = new URL(hop.location, next).toString();
      } catch {
        next = null;
      }
      // SSRF on each hop
      try {
        await resolveAndGuard(new URL(next).hostname);
      } catch {
        chain[chain.length - 1].redirect_blocked = 'private-target';
        break;
      }
    } else {
      next = null;
    }
  }
  return { initial_url: rawUrl, hops: chain.length, chain };
}

const cached = memoizeAsync(probe, { ttl: 30_000, keyFn: (u) => u });

router.get('/', async (req, res) => {
  let target = String(req.query.url || req.query.q || req.query.host || '').trim();
  if (!target) return res.status(400).json({ error: 'Provide ?url=https://example.com or ?host=example.com' });
  // Allow bare domain: prefer https
  if (!/^https?:\/\//i.test(target)) {
    const domain = normaliseDomain(target);
    if (!domain) return res.status(400).json({ error: 'Invalid target' });
    target = `https://${domain}`;
  }
  try {
    const started = Date.now();
    const result = await cached(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(err.code === 'PRIVATE_TARGET' ? 400 : 502).json({ error: err.code || 'probe-failed', detail: err.message });
  }
});

module.exports = router;
