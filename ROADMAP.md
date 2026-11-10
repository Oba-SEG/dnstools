# Roadmap

Status legend: `idea` → `accepted` → `in progress` → `shipped`.

Scope rule: this repo is the public, free tool. Paid / commercial features
(watchlists, provider-specific fix recipes, outreach tooling) live in their
own products — see "Out of scope" at the bottom.

## Shipped

- **Public API free of charge** — DNS, email-auth (SPF/DKIM/DMARC/BIMI), TLS,
  WHOIS, reverse, headers, blacklists, DNSSEC, ping, portcheck, probe,
  traceroute, geoip, MHA parser, speedtest.
- **Static web UI** on GitHub Pages (`/dnstools`).
- **Browser extension** (MV3): popup quick-check + right-click lookup,
  deep-links back to the site (`?domain=<d>&tool=<t>`).
- **Batch mode** — auditor fan-out: up to 10 domains per request, WHOIS facts
  or full DNS records (`/api/batch`), Turnstile-gated, 4/min/IP.
- **Compare mode** — diff two domains on WHOIS facts + DNS record sets
  (`/api/compare`), Turnstile-gated.
- **Deep links**: `?domain=x.com&tool=whois` auto-runs the right check —
  used by the extension and shareable.
- **Metrics + Grafana dashboard** (uptime, req/s, error rate, p95, RSS).
- **Alerting** to a monitored mailbox: downtime, 5xx rate, p95 breach, restarts,
  memory ceiling, bot pressure.
- **Abuse controls**: per-IP rate limits, SSRF guards, Cloudflare Turnstile on
  heavy endpoints + batch/compare, noindex + ai.txt crawler opt-outs.
- **Feedback loop**: issue forms for features/bugs, in-site suggestion button,
  Discussions enabled.

## Accepted (next)

- `accepted` — Deployed-on-custom-domain support (DNS audit + email ops story
  improves with a proper domain on Grafana/CF: WAF + origin hiding).
- `accepted` — OTLP traces from the backend to Grafana Cloud Tempo so Asserts
  anomaly detection can actually watch `ndns-api`.

## Ideas (not started — vote with 👍)

- `idea` — Provider-aware propagation hints: when a record disagrees across
  resolvers, link to the relevant registrar/CF docs page.
- `idea` — Blacklist delisting guide per DNSBL.

## Out of scope (owned by other products — do NOT build here)

- **Domain change watchlists / monitoring** → Brand Protection
  (brandprotection.segbytes.co.za) — paid service, separate project.
- **DNS provider "misconfig recipes" + provider integrations** → also
  Brand Protection.
- **Contextual affiliate / partner offers inside results** → Brand Protection.
- **Prospect / lead-gen workflows on top of checks** → Nexus Prospects.
- **DMARC aggregate-report monitoring + industry data reports** → Nullapart
  (DMARC feature).
