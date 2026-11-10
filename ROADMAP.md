# Roadmap

Status legend: `idea` → `accepted` → `in progress` → `shipped`.

## Shipped

- **Public API free of charge** — DNS, email-auth (SPF/DKIM/DMARC/BIMI), TLS, WHOIS,
  reverse, headers, blacklists, DNSSEC, ping, portcheck, probe, traceroute, geoip,
  MHA parser, speedtest.
- **Static web UI** on GitHub Pages (`/dnstools`).
- **Metrics + Grafana dashboard** (uptime, req/s, error rate, p95, RSS).
- **Alerting** to a monitored mailbox: downtime, 5xx rate, p95 breach, restarts,
  memory ceiling, bot pressure.
- **Abuse controls**: per-IP rate limits, SSRF guards, Cloudflare Turnstile on
  heavy endpoints, noindex + ai.txt crawler opt-outs.
- **Feedback plumbing**: issue forms for features/bugs, in-site footer button.

## Accepted (next)

- `accepted` — Deployed-on-custom-domain support (DNS audit + email ops story
  improves with a proper domain on Grafana/CF: WAF + origin hiding).
- `accepted` — OTLP traces from the backend to Grafana Cloud Tempo so Asserts
  anomaly detection can actually watch `ndns-api`.

## Ideas (not started — vote with 👍)

- `idea` — Domain watchlists: get an email when a domain's TTL/records/cert
  change (rate-limited, anonymous).
- `idea` — DNS provider "misconfig recipes": auto-generated fix instructions
  per provider (Cloudflare/Route53/GoDaddy).
- `idea` — Browser extension: hover any domain anywhere → quick lookup panel.
- `idea` — Batch mode: check up to 10 domains per request for auditors.
- `idea` — Compare mode: diff two domains side by side.

> Want something here? Open a feature request via the in-site
> **Suggest an improvement** button or the repo's issue templates.
