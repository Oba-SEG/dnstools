'use strict';

// TCP RTT ping. Real ICMP ping requires raw sockets (root); instead we
// measure TCP-connect time to a target port, which is the standard
// "TCP ping" used by tools like nmap and tcping. Same SSRF posture as
// every other endpoint that reaches public internet.

const express = require('express');
const net = require('node:net');
const dns = require('node:dns/promises');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const SAMPLES = 5;
const SAMPLE_TIMEOUT_MS = 3000;
const ALLOWED_PORTS = new Set([22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 8080, 8443, 3306, 5432, 6379, 27017]);

async function resolveAndGuard(target) {
  const isIp = net.isIP(target) !== 0;
  const ip = isIp ? target : (await dns.lookup(target, { family: 4 })).address;
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to ping ${c.reason || 'private'} address`), { code: 'PRIVATE_TARGET' });
  }
  return ip;
}

function tcpConnectTimed(ip, port) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, error) => {
      if (done) return;
      done = true;
      socket.destroy();
      const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;
      resolve({ ok, ms: elapsed.toFixed(2), error: error || null });
    };
    socket.setTimeout(SAMPLE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err) => finish(false, err.code || err.message || 'error'));
    socket.connect(port, ip);
  });
}

async function pingTarget(target, port) {
  const ip = await resolveAndGuard(target);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    samples.push(await tcpConnectTimed(ip, port));
  }
  const successful = samples.filter(s => s.ok).map(s => parseFloat(s.ms));
  const stats = successful.length > 0 ? {
    min: Math.min(...successful).toFixed(2),
    max: Math.max(...successful).toFixed(2),
    avg: (successful.reduce((a, b) => a + b, 0) / successful.length).toFixed(2),
    loss_pct: Math.round(((SAMPLES - successful.length) / SAMPLES) * 100),
  } : { loss_pct: 100 };
  return { target, ip, port, samples, stats };
}

const cached = memoizeAsync(pingTarget, { ttl: 30_000, keyFn: (t, p) => `${t}::${p}` });

router.get('/', async (req, res) => {
  const target = normaliseDomain(req.query.host || req.query.q) || (net.isIP(String(req.query.host || '').trim()) ? String(req.query.host).trim() : null);
  const port = parseInt(req.query.port || '443', 10);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid host via ?host=example.com' });
  }
  if (!ALLOWED_PORTS.has(port)) {
    return res.status(400).json({ error: `Port ${port} not allowed for ping. Allowed: ${[...ALLOWED_PORTS].sort((a, b) => a - b).join(', ')}` });
  }
  try {
    const started = Date.now();
    const result = await cached(target, port);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(err.code === 'PRIVATE_TARGET' ? 400 : 502).json({ error: err.code || 'ping-failed', detail: err.message });
  }
});

module.exports = router;
