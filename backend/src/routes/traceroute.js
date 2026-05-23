'use strict';

// Traceroute via the system `traceroute` binary. Spawns the OS command
// with strictly validated arguments — no shell, no string interpolation.
// We resolve the target first and refuse private addresses, same SSRF
// posture as everywhere else.

const express = require('express');
const { spawn } = require('node:child_process');
const dns = require('node:dns/promises');
const net = require('node:net');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const TRACEROUTE_TIMEOUT_MS = 25_000;
const MAX_HOPS = 20;

async function resolveAndGuard(target) {
  const ip = net.isIP(target) !== 0 ? target : (await dns.lookup(target, { family: 4 })).address;
  const c = classifyIp(ip);
  if (!c.valid) {
    throw Object.assign(new Error(`Refusing to traceroute ${c.reason || 'private'} address`), { code: 'PRIVATE_TARGET' });
  }
  return ip;
}

function runTraceroute(ip) {
  return new Promise((resolve, reject) => {
    // Strict argv. No shell. -n skips DNS resolution per hop (we resolve
    // separately), -m limits hops, -w limits per-probe wait, -q limits
    // probes per hop. Use TCP mode (-T) on port 80 since UDP / ICMP often
    // get firewalled.
    const args = ['-n', '-w', '2', '-m', String(MAX_HOPS), '-q', '1', ip];
    const proc = spawn('traceroute', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(Object.assign(new Error('traceroute timeout'), { code: 'TIMEOUT' }));
    }, TRACEROUTE_TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && stdout.length === 0) {
        return reject(Object.assign(new Error(stderr || 'traceroute failed'), { code: 'TRACEROUTE_FAILED' }));
      }
      resolve(stdout);
    });
  });
}

function parseTraceroute(raw) {
  const lines = raw.split('\n').filter(l => l.trim());
  const hops = [];
  for (const line of lines) {
    // Header line starts with "traceroute to ..."
    if (line.startsWith('traceroute')) continue;
    // Hops look like:  " 1  192.0.2.1  1.234 ms"  or  " 5  * * *"
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const hopNum = parseInt(match[1], 10);
    const rest = match[2].trim();
    if (rest === '* * *' || rest === '*' || rest === '* *') {
      hops.push({ hop: hopNum, ip: null, hostname: null, rtt_ms: null, timeout: true });
      continue;
    }
    // First whitespace-separated token is the IP, rest contains "x.xxx ms"
    const tokens = rest.split(/\s+/);
    const ip = tokens[0] === '*' ? null : tokens[0];
    const rttMatch = rest.match(/([\d.]+)\s*ms/);
    hops.push({
      hop: hopNum,
      ip,
      hostname: null,
      rtt_ms: rttMatch ? parseFloat(rttMatch[1]) : null,
      timeout: false,
    });
  }
  return hops;
}

async function trace(target) {
  const ip = await resolveAndGuard(target);
  const raw = await runTraceroute(ip);
  const hops = parseTraceroute(raw);
  return { target, ip, hop_count: hops.length, hops };
}

const cached = memoizeAsync(trace, { ttl: 5 * 60_000, keyFn: (t) => t });

router.get('/', async (req, res) => {
  const target = normaliseDomain(req.query.host || req.query.q) || (net.isIP(String(req.query.host || '').trim()) ? String(req.query.host).trim() : null);
  if (!target) return res.status(400).json({ error: 'Provide a valid host via ?host=example.com' });
  try {
    const started = Date.now();
    const result = await cached(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    const code = err.code || 'traceroute-failed';
    res.status(code === 'PRIVATE_TARGET' ? 400 : 422).json({ error: code, detail: err.message });
  }
});

module.exports = router;
