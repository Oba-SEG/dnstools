'use strict';

// Domain / hostname / IP validation. Public-internet only — refuse any
// private, link-local, loopback, multicast, or otherwise sensitive target
// so this service can't be used for SSRF probing of internal infra.

const net = require('node:net');

// RFC 1123 hostname / domain. ASCII labels only (callers must IDN-encode
// internationalised inputs before reaching here).
const DOMAIN_RX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

// Single-label hostname (lookup of `localhost`, `mail`, etc) — we explicitly
// reject these because they have no public-internet meaning and just leak
// internal state.
function isPlausibleDomain(input) {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.length > 253) return false;
  return DOMAIN_RX.test(trimmed);
}

// IPv4 / IPv6 with private-range filtering.
function classifyIp(input) {
  if (typeof input !== 'string') return { valid: false };
  const trimmed = input.trim();
  const family = net.isIP(trimmed);
  if (family === 0) return { valid: false };

  if (family === 4) {
    const [a, b] = trimmed.split('.').map(Number);
    // Private + reserved IPv4 ranges
    if (a === 0)                           return { valid: false, reason: 'reserved' };
    if (a === 10)                          return { valid: false, reason: 'rfc1918' };
    if (a === 127)                         return { valid: false, reason: 'loopback' };
    if (a === 169 && b === 254)            return { valid: false, reason: 'link-local' };
    if (a === 172 && b >= 16 && b <= 31)   return { valid: false, reason: 'rfc1918' };
    if (a === 192 && b === 168)            return { valid: false, reason: 'rfc1918' };
    if (a === 100 && b >= 64 && b <= 127)  return { valid: false, reason: 'cgnat' };
    if (a >= 224 && a <= 239)              return { valid: false, reason: 'multicast' };
    if (a >= 240)                          return { valid: false, reason: 'reserved' };
    return { valid: true, family: 4 };
  }

  // IPv6: refuse common private ranges
  const lower = trimmed.toLowerCase();
  if (lower === '::1')                      return { valid: false, reason: 'loopback' };
  if (lower.startsWith('fe80:'))            return { valid: false, reason: 'link-local' };
  if (lower.startsWith('fc') || lower.startsWith('fd')) return { valid: false, reason: 'unique-local' };
  if (lower.startsWith('ff'))               return { valid: false, reason: 'multicast' };
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    return classifyIp(v4); // IPv4-mapped — re-classify
  }
  return { valid: true, family: 6 };
}

// Normalise a user-supplied target. Accepts a domain, a URL with a domain,
// or a bare IP. Returns the cleaned domain or null.
function normaliseDomain(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // Strip URL scheme
  s = s.replace(/^[a-z]+:\/\//, '');
  // Strip path / query / fragment
  s = s.split('/')[0];
  s = s.split('?')[0];
  s = s.split('#')[0];
  // Strip user:pass@
  s = s.replace(/^.*@/, '');
  // Strip port
  s = s.replace(/:\d+$/, '');
  // Final validity check
  if (isPlausibleDomain(s)) return s;
  return null;
}

module.exports = { isPlausibleDomain, classifyIp, normaliseDomain };
