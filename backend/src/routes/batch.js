'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { normaliseDomain } = require('../lib/validate');
const { asyncHandler } = require('../lib/asyncHandler');
const lookup = require('./lookup');
const whoisRoute = require('./whois');

const router = express.Router();

const MAX_DOMAINS = 10;

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 4,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Batch limit exceeded (4/min); try again in a minute.' },
});
router.use(batchLimiter);

function parseDomains(input) {
  return String(input || '')
    .split(/[\s,;]+/)
    .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0])
    .filter(Boolean)
    .slice(0, MAX_DOMAINS);
}

router.get('/', asyncHandler(async (req, res) => {
  const mode = req.query.mode === 'dns' ? 'dns' : 'whois';
  const raw = parseDomains(req.query.domains);
  if (raw.length === 0) {
    return res.status(400).json({ error: 'Provide up to 10 comma-separated domains via ?domains=a.com,b.com&mode=whois|dns' });
  }

  const valid = [];
  const skipped = [];
  for (const d of raw) {
    const target = normaliseDomain(d);
    if (target) valid.push(target); else skipped.push(d);
  }
  if (valid.length === 0) {
    return res.status(400).json({ error: 'No valid domains in the batch.' });
  }

  const started = Date.now();

  const runOne = async (d) => {
    if (mode === 'whois') {
      try {
        const w = await whoisRoute.cachedWhois(d);
        const { raw: _omitRaw, elapsed_ms: _omitElapsed, ...core } = w;
        return { domain: d, ok: true, whois: core };
      } catch (err) {
        return { domain: d, ok: false, error: err.code || err.message || 'whois-failed' };
      }
    }
    try {
      const results = await Promise.all(lookup.SUPPORTED_TYPES.map(t => lookup.cachedResolve(d, t)));
      return { domain: d, ok: true, dns: results };
    } catch (err) {
      return { domain: d, ok: false, error: err.code || err.message || 'dns-failed' };
    }
  };

  const results = await Promise.all(valid.map(runOne));

  res.json({
    mode,
    count: results.length,
    skipped_invalid: skipped,
    elapsed_ms: Date.now() - started,
    results,
  });
}));

module.exports = router;
module.exports.MAX_DOMAINS = MAX_DOMAINS;
