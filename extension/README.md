# Nexus DNS Lookup — browser extension

Quick domain checks straight from the toolbar or a right-click, powered by the
free Nexus Domain Tools API (`ndns-api.onrender.com`).

## What it does

- **Popup**: type a domain → live DNS records (A/AAAA/MX/NS/TXT…), DNSSEC
  status, email auth (SPF/DMARC) status, plus a link to the full report on the
  site. Opening the popup on any normal website auto-fills that site's domain.
- **Right-click**: select a domain on any page → "Look up `%s` on Nexus DNS"
  → opens the full report with the domain pre-filled.

## Install (Chrome / Edge / Brave)

1. Download / clone this repo.
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.

## Notes

- No analytics, no tracking, no storage. The extension only calls the public API.
- Uses the ungated endpoints only (`lookup`, `dnssec`, `email`) — the heavy
  endpoints have bot protection that a bare extension can't satisfy by design.
