'use strict';

// Tiny in-process LRU + per-IP rate limiter wrapper. We cache DNS / WHOIS /
// TLS responses for a short TTL because users routinely re-run the same
// lookup five times in a row, and we don't want to amplify load on
// upstream resolvers / WHOIS servers / target hosts.

const { LRUCache } = require('lru-cache');

function makeCache({ max = 5000, ttl = 60_000 } = {}) {
  return new LRUCache({ max, ttl });
}

// Wrap an async function so identical arg-tuples return the cached promise.
function memoizeAsync(fn, { keyFn = (...a) => JSON.stringify(a), ttl = 60_000, max = 5000 } = {}) {
  const cache = makeCache({ max, ttl });
  return async (...args) => {
    const key = keyFn(...args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}

module.exports = { makeCache, memoizeAsync };
