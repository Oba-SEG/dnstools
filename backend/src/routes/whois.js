'use strict';

const express = require('express');
const whoisJson = require('whois-json');
const { normaliseDomain } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

async function lookupWhois(domain) {
  // whois-json wraps `whois` and is sufficient for the common TLDs.
  const raw = await whoisJson(domain, { follow: 3, timeout: 10000 });
  // Normalise common keys across registrar formats.
  const pick = (...keys) => keys.map(k => raw[k]).find(v => v != null && v !== '');
  return {
    domain,
    registrar: pick('registrar', 'sponsoringRegistrar') || null,
    registrar_url: pick('registrarUrl') || null,
    registrar_iana: pick('registrarIanaId') || null,
    created: pick('creationDate', 'created', 'createdOn', 'registrationDate') || null,
    updated: pick('updatedDate', 'lastUpdatedDate', 'updated') || null,
    expires: pick('registrarRegistrationExpirationDate', 'expirationDate', 'registryExpiryDate', 'expires') || null,
    status: Array.isArray(raw.domainStatus) ? raw.domainStatus : (raw.domainStatus ? [raw.domainStatus] : []),
    nameservers: Array.isArray(raw.nameServer) ? raw.nameServer : (raw.nameServer ? [raw.nameServer] : []),
    dnssec: raw.dnssec || raw.dnsSec || null,
    raw_keys: Object.keys(raw).slice(0, 50),
  };
}

const cached = memoizeAsync(lookupWhois, { ttl: 60 * 60_000, keyFn: (d) => d });

router.get('/', async (req, res) => {
  const target = normaliseDomain(req.query.domain || req.query.q);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain via ?domain=example.com' });
  }
  try {
    const started = Date.now();
    const result = await cached(target);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(422).json({ error: 'WHOIS lookup failed', detail: err.code || err.message });
  }
});

module.exports = router;
