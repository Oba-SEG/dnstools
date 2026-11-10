'use strict';

// Nexus DNS — public ungated DNS / email / TLS / WHOIS checker.
// Security stance:
//   - No authentication, no DB, no PII storage.
//   - Aggressive rate limiting per IP and per endpoint.
//   - SSRF protection: every endpoint that resolves user-supplied targets
//     refuses RFC 1918 / loopback / link-local / multicast / CGNAT addresses.
//   - Strict input validation: domains parsed with a single regex,
//     IPs validated by node:net.isIP + private-range filter.
//   - Helmet for HTTP headers, restrictive CORS, no cookies.
//   - Per-target output caching to avoid amplifying load on upstreams
//     (DNS resolvers, WHOIS servers, target hosts).
//
// Configure via env (no dotenv dependency — start with
// `node --env-file=.env src/index.js` or set env vars in PM2 / systemd).

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const metrics = require('./lib/metrics');
const { requireTurnstile } = require('./lib/turnstile');

const app = express();
app.set('trust proxy', 1); // we sit behind nginx in production

// --- Security middleware ---
app.use(helmet({
  contentSecurityPolicy: false, // CSP is set on the frontend layer (nginx + Next.js)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
}));

// CORS: allow the frontend origin and a small list of dev origins.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001,http://localhost:3002,http://localhost:3003').split(',').map(s => s.trim()).filter(Boolean);
// On Render, the platform injects the service URL — self-allow it too.
if (process.env.RENDER_EXTERNAL_URL) ALLOWED_ORIGINS.push(process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ''));
// Browser extensions send a chrome-extension://… / moz-extension://… origin
// (opaque-ish but stable per install) — public endpoints stay public to them.
const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension|extension):\/\//i;
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl / direct API
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*') || EXTENSION_ORIGIN.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// Tiny body limit — none of these endpoints accept request bodies, only
// query strings. Anything bigger is suspicious. MHA is the exception.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/mha')) return next();
  express.json({ limit: '1kb' })(req, res, next);
});

// --- Rate limiting ---
// Coarse global limit per IP; specific lookups have their own (tighter)
// limiter on top of this.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests; slow down.' },
});
app.use(globalLimiter);

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Lookup rate limit exceeded; try again in a minute.' },
});

const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limit exceeded for this endpoint; try again in a minute.' },
});

// Speed test needs many requests per run (10 pings + 6 downloads + 5 uploads + 1 save = 22).
// Allow ~5 complete tests per minute.
const speedtestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Speed test rate limit exceeded; try again in a minute.' },
});

// --- Routes ---
app.use(metrics.middleware);

// --- Crawler / AI guidance ---
// This is an interactive API, not a content site: disallow all crawlers on
// the API plus a machine-readable opt-out for AI/LLM scrapers (ai.txt).
// Heavy endpoints are additionally protected by Turnstile (inert until
// TURNSTILE_SECRET_KEY is configured).
app.use('/api', (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nDisallow: /\n'
  );
});
app.get('/ai.txt', (req, res) => {
  res.type('text/plain').send(
    '# ai.txt - machine-readable permissions for AI/LLM crawlers\n' +
    'User-agent: *\nExt: none\nPermission: deny-all\n\n' +
    '# This host provides an interactive diagnostics API. Automated bulk\n' +
    '# collection and the use of this service\'s output for training or\n' +
    '# dataset construction are not permitted.\n'
  );
});
app.get('/health', (req, res) => res.json({ ok: true, service: 'nexus-dns', uptime_s: Math.round(process.uptime()) }));
app.get('/metrics', (req, res) => { res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8'); res.send(metrics.metricsText()); });

app.use('/api/lookup', lookupLimiter, require('./routes/lookup'));
app.use('/api/propagation', heavyLimiter, requireTurnstile(), require('./routes/propagation'));
app.use('/api/email', lookupLimiter, require('./routes/email'));
app.use('/api/tls', heavyLimiter, requireTurnstile(), require('./routes/tls'));
app.use('/api/whois', heavyLimiter, requireTurnstile(), require('./routes/whois'));
app.use('/api/reverse', lookupLimiter, require('./routes/reverse'));
app.use('/api/headers', heavyLimiter, requireTurnstile(), require('./routes/headers'));
app.use('/api/blacklist', heavyLimiter, requireTurnstile(), require('./routes/blacklist'));
app.use('/api/dnssec', lookupLimiter, require('./routes/dnssec'));
// T2 — ping.pe-style network diagnostics
app.use('/api/ping', heavyLimiter, requireTurnstile(), require('./routes/ping'));
app.use('/api/portcheck', heavyLimiter, requireTurnstile(), require('./routes/portcheck'));
app.use('/api/probe', heavyLimiter, requireTurnstile(), require('./routes/probe'));
app.use('/api/traceroute', heavyLimiter, requireTurnstile(), require('./routes/traceroute'));
app.use('/api/geoip', lookupLimiter, require('./routes/geoip'));
app.use('/api/mha', lookupLimiter, express.json({ limit: '256kb' }), require('./routes/mha'));
// T3 — speed test diagnostics (higher limit: ~22 requests per test run)
app.use('/api/speedtest', speedtestLimiter, require('./routes/speedtest'));
// Auditor tools — batch fans one request out over N targets, so it gets its
// own tighter limiter and rides the heavy-endpoint Turnstile gate.
app.use('/api/batch', requireTurnstile(), require('./routes/batch'));
app.use('/api/compare', heavyLimiter, requireTurnstile(), require('./routes/compare'));

// 404 for anything else
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Catch-all error handler — never leak stack traces to the client.
app.use((err, req, res, next) => {
  console.error('[nexus-dns] error:', err.message);
  res.status(500).json({ error: 'Server error' });
});

const PORT = parseInt(process.env.PORT || '4001', 10);
app.listen(PORT, () => {
  console.log(`Nexus DNS API listening on :${PORT}`);
});
