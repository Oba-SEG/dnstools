'use strict';

// HTTP security headers analyzer. Fetches a target URL with strict SSRF
// guarding and grades the security headers it returns.

const express = require('express');
const dns = require('node:dns/promises');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

const FETCH_TIMEOUT_MS = 8000;
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

async function safelyFetch(domain) {
  // Resolve target, refuse private IPs.
  const addrs = await dns.lookup(domain, { all: true }).catch(() => []);
  if (addrs.length === 0) {
    throw Object.assign(new Error('Could not resolve target'), { code: 'DNS_FAIL' });
  }
  const resolvedIp = addrs[0].address;
  for (const a of addrs) {
    const c = classifyIp(a.address);
    if (!c.valid) {
      throw Object.assign(new Error(`Refusing to fetch ${c.reason || 'private'} target`), { code: 'PRIVATE_TARGET' });
    }
  }

  // TOCTOU fix: connect to resolved IP, set Host header to domain.
  // Native fetch() resolves DNS internally and can't be overridden, so we
  // use http/https modules which allow passing a resolved IP as hostname
  // while keeping the correct Host header for virtual hosting.
  const http = require('node:http');
  const https = require('node:https');

  function doFetch(protocol, ip) {
    return new Promise((resolve, reject) => {
      const lib = protocol === 'https:' ? https : http;
      const req = lib.get({
        hostname: ip,
        port: protocol === 'https:' ? 443 : 80,
        path: '/',
        headers: {
          'Host': domain,
          'User-Agent': 'Mozilla/5.0 (compatible; NexusDNS/1.0; +https://dns.segbytes.co.za)',
        },
        rejectUnauthorized: false,
        timeout: FETCH_TIMEOUT_MS,
      }, (res) => {
        // Consume response body to free socket
        res.resume();
        resolve(res);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response;
    try {
      response = await doFetch('https:', resolvedIp);
    } catch {
      response = await doFetch('http:', resolvedIp);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

const SECURITY_HEADERS = [
  { name: 'strict-transport-security', label: 'HSTS', importance: 'critical' },
  { name: 'content-security-policy', label: 'CSP', importance: 'critical' },
  { name: 'x-frame-options', label: 'X-Frame-Options', importance: 'high' },
  { name: 'x-content-type-options', label: 'X-Content-Type-Options', importance: 'high' },
  { name: 'referrer-policy', label: 'Referrer-Policy', importance: 'high' },
  { name: 'permissions-policy', label: 'Permissions-Policy', importance: 'medium' },
  { name: 'cross-origin-opener-policy', label: 'COOP', importance: 'medium' },
  { name: 'cross-origin-embedder-policy', label: 'COEP', importance: 'medium' },
  { name: 'cross-origin-resource-policy', label: 'CORP', importance: 'medium' },
];

async function analyseHeaders(domain) {
  const res = await safelyFetch(domain);
  const headersFound = {};
  // node:http headers are plain objects; node:fetch Headers have .forEach().
  if (typeof res.headers.forEach === 'function') {
    res.headers.forEach((value, key) => { headersFound[key.toLowerCase()] = value; });
  } else {
    for (const [key, value] of Object.entries(res.headers)) {
      headersFound[key.toLowerCase()] = value;
    }
  }

  const checks = SECURITY_HEADERS.map(h => ({
    name: h.label,
    header: h.name,
    importance: h.importance,
    present: headersFound[h.name] != null,
    value: headersFound[h.name] || null,
  }));

  // Compute a simple grade: critical missing = -25, high = -10, medium = -5
  let score = 100;
  for (const c of checks) {
    if (!c.present) {
      score -= c.importance === 'critical' ? 25 : c.importance === 'high' ? 10 : 5;
    }
  }
  score = Math.max(0, score);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  return {
    domain,
    status: res.status,
    server: headersFound['server'] || null,
    powered_by: headersFound['x-powered-by'] || null,
    score,
    grade,
    checks,
  };
}

const cached = memoizeAsync(analyseHeaders, { ttl: 5 * 60_000, keyFn: (d) => d });

router.get('/', asyncHandler(async (req, res) => {
  const target = normaliseDomain(req.query.domain || req.query.q);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain via ?domain=example.com' });
  }
  try {
    const started = Date.now();
    const result = await cached(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(422).json({ error: 'Header analysis failed', detail: err.code || err.message });
  }
}));

module.exports = router;
