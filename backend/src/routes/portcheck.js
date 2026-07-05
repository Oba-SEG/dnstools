'use strict';

// TCP port reachability check. Test if a target is accepting connections
// on a list of well-known ports. Same SSRF posture as the rest of the
// service — we resolve and reject private addresses before any connect.

const express = require('express');
const net = require('node:net');
const dns = require('node:dns/promises');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

const PER_PORT_TIMEOUT_MS = 2500;

const COMMON_PORTS = [
  { port: 21,    name: 'FTP' },
  { port: 22,    name: 'SSH' },
  { port: 25,    name: 'SMTP' },
  { port: 53,    name: 'DNS' },
  { port: 80,    name: 'HTTP' },
  { port: 110,   name: 'POP3' },
  { port: 143,   name: 'IMAP' },
  { port: 443,   name: 'HTTPS' },
  { port: 465,   name: 'SMTPS' },
  { port: 587,   name: 'Submission' },
  { port: 993,   name: 'IMAPS' },
  { port: 995,   name: 'POP3S' },
  { port: 3306,  name: 'MySQL' },
  { port: 5432,  name: 'Postgres' },
  { port: 6379,  name: 'Redis' },
  { port: 8080,  name: 'HTTP-alt' },
  { port: 8443,  name: 'HTTPS-alt' },
  { port: 27017, name: 'MongoDB' },
];

const ALLOWED_PORTS = new Set(COMMON_PORTS.map(p => p.port));

function tcpProbe(ip, port) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = new net.Socket();
    let done = false;
    const finish = (status, error) => {
      if (done) return;
      done = true;
      socket.destroy();
      const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;
      resolve({ status, ms: elapsed.toFixed(2), error: error || null });
    };
    socket.setTimeout(PER_PORT_TIMEOUT_MS);
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('filtered', 'timeout'));
    socket.once('error', (err) => {
      const code = err.code || err.message || 'error';
      finish(code === 'ECONNREFUSED' ? 'closed' : 'error', code);
    });
    socket.connect(port, ip);
  });
}

async function checkPorts(target, ports) {
  const isIp = net.isIP(target) !== 0;
  const ip = isIp ? target : (await dns.lookup(target, { family: 4 })).address;
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to scan ${c.reason || 'private'} address`), { code: 'PRIVATE_TARGET' });
  }
  const portMeta = COMMON_PORTS.filter(p => ports.includes(p.port));
  const results = await Promise.all(portMeta.map(async (p) => {
    const probe = await tcpProbe(ip, p.port);
    return { ...p, ...probe };
  }));
  return { target, ip, results };
}

const cached = memoizeAsync(checkPorts, { ttl: 30_000, keyFn: (t, ports) => `${t}::${ports.join(',')}` });

router.get('/', asyncHandler(async (req, res) => {
  const target = normaliseDomain(req.query.host || req.query.q) || (net.isIP(String(req.query.host || '').trim()) ? String(req.query.host).trim() : null);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid host via ?host=example.com' });
  }
  const requestedPorts = String(req.query.ports || '')
    .split(',').map(s => parseInt(s.trim(), 10))
    .filter(p => Number.isFinite(p) && ALLOWED_PORTS.has(p));
  const ports = requestedPorts.length > 0 ? requestedPorts : COMMON_PORTS.map(p => p.port);

  try {
    const started = Date.now();
    const result = await cached(target, ports);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(err.code === 'PRIVATE_TARGET' ? 400 : 502).json({ error: err.code || 'portcheck-failed', detail: err.message });
  }
}));

module.exports = router;
