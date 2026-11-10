# Nexus DNS

A free, public, ungated DNS / email / TLS / WHOIS / blacklist / headers checker.
No login. No payment. No tracking. Built as the public counterpart to
[Nexus Brand Protection](https://brandprotection.segbytes.co.za) and the
[Segbytes](https://segbytes.co.za) commercial platform.

**Live:** [https://oba-seg.github.io/dnstools](https://oba-seg.github.io/dnstools) · API on Render free

---

## What it checks

| Tool | Endpoint | What it does |
|---|---|---|
| **DNS records** | `/api/lookup?domain=…&types=A,AAAA,…` | Resolves A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, CAA |
| **Propagation** | `/api/propagation?domain=…&type=A` | Queries 15 global resolvers (Cloudflare, Google, Quad9, Verisign, OpenDNS, AliDNS, DNSPod, Yandex, Hetzner, …) and reports per-resolver consensus. Visualised on a dark world map. |
| **Email auth** | `/api/email?domain=…` | SPF (with RFC 7208 lookup-budget check), DMARC, DKIM (20 common selectors), MTA-STS, TLS-RPT, BIMI, MX |
| **TLS / SSL** | `/api/tls?domain=…&port=443` | Full chain inspection: subject, issuer, expiry, days-to-expiry, SANs, cipher, protocol, ALPN |
| **WHOIS** | `/api/whois?domain=…` | Registrar, IANA ID, creation, expiry, status flags, name servers, DNSSEC bit |
| **HTTP headers** | `/api/headers?domain=…` | Grades HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, COEP, CORP. Returns a letter grade. |
| **DNSBL** | `/api/blacklist?ip=…` or `?domain=…` | Checks against 10 major blocklists (Spamhaus ZEN/SBL/CSS, SORBS, SpamCop, Barracuda, Mailspike, CBL, UCEPROTECT L1/L2) |
| **DNSSEC** | `/api/dnssec?domain=…` | DNSKEY at apex + DS at parent zone |
| **Reverse DNS** | `/api/reverse?ip=…` | PTR lookup |

---

## Architecture

```
┌──────────────────────┐      ┌─────────────────────────┐
│  Frontend (Next.js)  │ ───► │ Backend (Express + DNS) │
│  Port 3001           │      │ Port 4001               │
└──────────────────────┘      └─────────────────────────┘
        │                              │
   Premium dark UI                Helmet · CORS · rate-limited
   World map (SVG)                LRU cache · SSRF guard
```

**Why two processes?** Public-facing service must have a hard security
boundary. The backend never persists user data, never authenticates,
and never reads anything outside its own per-target output cache.

---

## Security stance

This is a public, ungated service. Security was a primary design constraint:

1. **No authentication, no DB, no PII.** Nothing to leak, nothing to log out of, nothing to compromise.
2. **SSRF protection.** Every endpoint that resolves a user-supplied target rejects RFC 1918, loopback (`127.0.0.0/8`, `::1`), link-local (`169.254/16`, `fe80::/10`), CGNAT (`100.64/10`), unique-local IPv6 (`fc00::/7`), and multicast / reserved ranges before opening any socket. See `backend/src/lib/validate.js`.
3. **Strict input validation.** Domains parsed with a single anchored RFC 1123 regex. IPs validated by `net.isIP` + private-range filter. URLs / ports / userinfo stripped before the regex check.
4. **Aggressive rate limiting.** Per-IP global limit of 120 req/min, per-endpoint limits of 10–30 req/min. `express-rate-limit` with draft-7 RFC headers.
5. **Output caching.** Identical lookups in a 30s–60min window are served from an in-process LRU. Avoids amplifying load on upstream resolvers / WHOIS servers / target hosts.
6. **Helmet for HTTP headers, restrictive CORS, no cookies, 1 KB request body limit.** Endpoints accept only `GET` with query strings; bodies are pointless and rejected.
7. **No request logging.** No client IP, query, or response body is persisted to disk. Errors log only the message.
8. **Catch-all 500 handler** never leaks stack traces.

The full SSRF-guard behaviour (private ranges blocked) applies uniformly to:
- DNS lookups (we always query through public resolvers, never the host's own resolver)
- TLS connect (`/api/tls`)
- HTTP fetch (`/api/headers`)
- Reverse DNS (`/api/reverse`)

---

## Run locally

### Backend

```bash
cd backend
npm install
node --env-file=.env src/index.js   # or just `npm start` (uses 4001)
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local    # if you have one
npm install
npm run dev                         # localhost:3001
```

The frontend reads `NEXT_PUBLIC_API_URL` at build time (default
`http://localhost:4001/api`).

---

## Deploy

### Backend on Render (free)

One-click blueprint deploy of the Dockerised API to a free Render web
service (`*.onrender.com`, spins down after 15 min idle ~ 1 min wake):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Oba-SEG/dnstools)

After the deploy completes, set `NEXT_PUBLIC_API_URL` under the repo's
GitHub → Settings → Secrets and variables → Actions → Variables to
`https://<service-name>.onrender.com/api`, then rerun the
`deploy-pages.yml` workflow to rebuild the frontend.

For local development, docker compose brings up api + web + prometheus:

```bash
docker compose up -d --build
# api → :4001, web → :3002, prometheus → :9090
```

The reference deployment runs both processes on the same VM behind nginx
with PM2. `dns.segbytes.co.za` proxies `/api/*` to the backend (port 4001)
and everything else to the Next.js frontend (port 3001).

```nginx
# /etc/nginx/sites-enabled/dns.segbytes.co.za
server {
  listen 443 ssl http2;
  server_name dns.segbytes.co.za;
  # ... SSL cert config

  location /api/ {
    proxy_pass http://127.0.0.1:4001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
  }
}
```

PM2 ecosystem (run from project root):

```js
// ecosystem.config.js
module.exports = {
  apps: [
    { name: "ndns-api", cwd: "./backend", script: "src/index.js",
      env: { PORT: 4001, ALLOWED_ORIGINS: "https://dns.segbytes.co.za" } },
    { name: "ndns-web", cwd: "./frontend", script: "node_modules/next/dist/bin/next",
      args: "start", env: { PORT: 3001 } },
  ],
};
```

---

## License

MIT — use it, fork it, run it. Attribution to Segbytes is appreciated but not required.
