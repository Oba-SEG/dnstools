'use strict';

const express = require('express');
const tls = require('node:tls');
const dns = require('node:dns/promises');
const { normaliseDomain, classifyIp } = require('../lib/validate');
const { memoizeAsync } = require('../lib/cache');

const router = express.Router();

const TLS_TIMEOUT_MS = 8000;
const ALLOWED_PORTS = new Set([443, 8443, 4443, 9443]);

async function inspectTls(domain, port) {
  // SSRF guard: resolve the domain first and reject any private IP family.
  const addrs = await dns.lookup(domain, { all: true }).catch(() => []);
  if (addrs.length === 0) {
    throw Object.assign(new Error('Could not resolve target'), { code: 'DNS_FAIL' });
  }
  for (const a of addrs) {
    const c = classifyIp(a.address);
    if (!c.valid) {
      throw Object.assign(new Error(`Refusing to connect to ${c.reason || 'private'} address ${a.address}`), { code: 'PRIVATE_TARGET' });
    }
  }

  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: domain,
      port,
      servername: domain,
      // Don't reject on cert problems — we want to surface them to the user.
      rejectUnauthorized: false,
      timeout: TLS_TIMEOUT_MS,
      ALPNProtocols: ['h2', 'http/1.1'],
    }, () => {
      const cert = socket.getPeerCertificate(true);
      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      const peerAddr = socket.remoteAddress;
      const alpn = socket.alpnProtocol;

      // Walk the chain.
      const chain = [];
      let current = cert;
      const seen = new Set();
      while (current && !seen.has(current.fingerprint)) {
        seen.add(current.fingerprint);
        chain.push({
          subject: current.subject,
          issuer: current.issuer,
          valid_from: current.valid_from,
          valid_to: current.valid_to,
          serial: current.serialNumber,
          fingerprint_sha256: current.fingerprint256,
          subject_alt_names: current.subjectaltname || null,
          ca: !!current.ca,
        });
        if (current.issuerCertificate && current.issuerCertificate.fingerprint !== current.fingerprint) {
          current = current.issuerCertificate;
        } else {
          break;
        }
      }

      const validTo = new Date(cert.valid_to);
      const validFrom = new Date(cert.valid_from);
      const daysToExpiry = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      socket.end();
      resolve({
        host: domain,
        port,
        peer_address: peerAddr,
        protocol,
        cipher: cipher ? { name: cipher.name, version: cipher.version, bits: cipher.bits } : null,
        alpn,
        authorized: socket.authorized,
        authorization_error: socket.authorizationError ? String(socket.authorizationError) : null,
        certificate: {
          subject: cert.subject,
          issuer: cert.issuer,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          subject_alt_names: cert.subjectaltname || null,
          serial: cert.serialNumber,
          fingerprint_sha256: cert.fingerprint256,
          expired: validTo.getTime() < Date.now(),
          not_yet_valid: validFrom.getTime() > Date.now(),
          days_to_expiry: daysToExpiry,
        },
        chain_length: chain.length,
        chain,
      });
    });
    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      socket.destroy();
      reject(Object.assign(new Error('TLS handshake timeout'), { code: 'TIMEOUT' }));
    });
    socket.on('error', (err) => {
      reject(err);
    });
  });
}

const cachedInspect = memoizeAsync(inspectTls, { ttl: 5 * 60_000, keyFn: (d, p) => `${d}::${p}` });

router.get('/', async (req, res) => {
  const target = normaliseDomain(req.query.domain || req.query.q);
  const port = parseInt(req.query.port || '443', 10);
  if (!target) {
    return res.status(400).json({ error: 'Provide a valid domain via ?domain=example.com' });
  }
  if (!ALLOWED_PORTS.has(port)) {
    return res.status(400).json({ error: `Port ${port} not allowed. Allowed: ${[...ALLOWED_PORTS].join(', ')}` });
  }
  try {
    const started = Date.now();
    const result = await cachedInspect(target, port);
    res.json({ ...result, elapsed_ms: Date.now() - started });
  } catch (err) {
    res.status(502).json({
      host: target,
      port,
      error: err.code || err.message || 'TLS_FAILED',
      detail: err.message,
    });
  }
});

module.exports = router;
