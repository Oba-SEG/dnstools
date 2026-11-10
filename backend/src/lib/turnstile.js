'use strict';

// Cloudflare Turnstile verification — bot/abuse gate for heavy endpoints.
//
// Activation model: fully inert until TURNSTILE_SECRET_KEY is set in env.
// When set, requests to gated endpoints must carry a valid Turnstile token
// in the `x-turnstile-token` header. Tokens are single-use, short-lived,
// and verified server-side against the Cloudflare siteverify endpoint.
//
// For the browser side the widget is bound to the site key exposed via
// NEXT_PUBLIC_TURNSTILE_SITE_KEY at frontend build time.
//
// Policy on verification transport errors: fail OPEN (proceed without the
// token) but log loudly — an availability incident at Cloudflare should not
// take the tooling offline; per-IP rate limits remain in force regardless.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const MAX_TOKEN_LEN = 4096;
const VERIFY_TIMEOUT_MS = 8000;

// Small in-process replay guard: siteverify already treats a token as
// single-use, but identical duplicate submissions from the same client
// within a few seconds (double-click, proxied retries) are cheap to drop.
const seen = new Map();
const SEEN_TTL_MS = 60_000;
const SEEN_MAX = 5000;

function pruneSeen(now) {
  if (seen.size <= SEEN_MAX) {
    for (const [k, t] of seen) {
      if (now - t > SEEN_TTL_MS) seen.delete(k);
      else break;
    }
  }
}

let fetchThroughCache;

async function verifyToken(token, remoteip, req) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // gate disabled
  if (!token || typeof token !== 'string' || token.length > MAX_TOKEN_LEN) return false;

  const key = token;
  const now = Date.now();
  const firstSeen = seen.get(key);
  if (firstSeen && now - firstSeen < SEEN_TTL_MS) return false;
  pruneSeen(now);
  seen.set(key, now);

  if (!fetchThroughCache) fetchThroughCache = globalThis.fetch.bind(globalThis);

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);

  try {
    const res = await fetchThroughCache(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[turnstile] siteverify HTTP ${res.status} — failing open`);
      return true;
    }
    const data = await res.json();
    if (data.success === true) return true;
    // Surface Cloudflare's error-codes so failures diagnose themselves
    // instead of a generic "bot check failed".
    req.turnstileCodes = data['error-codes'] || ['unknown'];
    return false;
  } catch (err) {
    console.error('[turnstile] siteverify unreachable — failing open:', err.message);
    return true;
  }
}

// Express middleware factory: gate only when the secret is configured.
function requireTurnstile() {
  return async (req, res, next) => {
    if (!process.env.TURNSTILE_SECRET_KEY) return next();

    const token = req.get('x-turnstile-token') || req.query.turnstile || '';
    const ok = await verifyToken(String(token).trim(), req.ip, req);
    if (ok) return next();

    res.status(400).json({
      error: `Bot check failed (${(req.turnstileCodes || ['missing-token']).join(', ')}). Reload the page and retry.`,
    });
  };
}

module.exports = { requireTurnstile, verifyToken };
