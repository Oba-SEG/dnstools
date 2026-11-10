'use strict';

const express = require('express');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');
const { asyncHandler } = require('../lib/asyncHandler');

const execFileAsync = promisify(execFile);
const router = express.Router();

async function lookupWhois(target) {
  const { stdout } = await execFileAsync('whois', [target], { timeout: 15000 });
  const lines = stdout.split('\n');
  const data = {};
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const val = match[2].trim();
      if (data[key]) {
        if (Array.isArray(data[key])) data[key].push(val);
        else data[key] = [data[key], val];
      } else {
        data[key] = val;
      }
    }
  }

  const pick = (...keys) => {
    for (const k of keys) { if (data[k]) return Array.isArray(data[k]) ? data[k][0] : data[k]; }
    return null;
  };
  const toArray = (v) => v == null ? [] : Array.isArray(v) ? v : [v];

  return {
    domain: target,
    registrar: pick('registrar', 'sponsoring_registrar', 'registrant') || null,
    registrar_url: pick('registrar_url') || null,
    registrar_iana: pick('registrar_iana_id') || null,
    created: pick('creation_date', 'created', 'created_on', 'registration_date') || null,
    updated: pick('updated_date', 'last_updated_date', 'updated', 'last-modified') || null,
    expires: pick('registrar_registration_expiration_date', 'expiration_date', 'registry_expiry_date', 'expires', 'expire_date') || null,
    status: toArray(data.domain_status || data.status),
    nameservers: toArray(data.name_server || data.nserver),
    dnssec: pick('dnssec') || null,
    raw: stdout,
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Upstream WHOIS servers occasionally reject a burst with an empty
// error (observed code 1). Retry once after a short backoff before
// surfacing failure.
async function lookupWhoisWithRetry(target) {
  try {
    return await lookupWhois(target);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.killed)) throw err;
    await sleep(1500);
    return lookupWhois(target);
  }
}

const cached = memoizeAsync(lookupWhoisWithRetry, { ttl: 60 * 60_000, keyFn: (d) => d });

router.get('/', asyncHandler(async (req, res) => {
  const input = (req.query.domain || req.query.q || '').trim();
  // Accept domain or IP
  const ipCheck = classifyIp(input);
  const target = ipCheck.valid ? input : normaliseDomain(input);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain or IP via ?domain=example.com' });
  }
  try {
    const started = Date.now();
    const result = await cached(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(422).json({ error: 'WHOIS lookup failed', detail: err.code || err.message });
  }
}));

module.exports = router;
