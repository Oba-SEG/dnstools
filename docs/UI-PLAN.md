# UI/UX Re-imagining — Plan (Nov 2026)

Direction: **investigation-first, tool-second.** Nobody wakes up wanting a
WHOIS; they wake up worried about a domain. The public site becomes a
diagnostic *dossier* per domain; Pro becomes a *workspace*. The current dark
mono/terminal aesthetic stays — this is a hierarchy and flow rethink, not a
reskin. No login ever on public.

Constraints:

- Zero backend changes — the public API is untouched; the Overview fans out
  to existing endpoints client-side (server-side caches already soften this).
- Privacy stance intact: recents live in `localStorage` only, nothing about
  them leaves the browser. One line added to /privacy.
- Static export must keep building (Pages). Dynamic routes follow the
  proven `/speedtest/[id]` pattern.

---

## Phase 0 — Foundations (~0.5 day)

- `frontend/lib/verdicts.ts` — pure functions turning each endpoint payload
  into `{ level: ok|warn|bad|info, headline, detail? }` verdicts:
  - registration: registrar present, expiry in ≤0/30/90d bands, DNSSEC via
    dnssec endpoint
  - email: SPF present (+lookup overflow flag), DKIM selectors found,
    DMARC present + `p=` policy enforced/monitor/absent
  - tls: valid/not-yet-valid/expired, days remaining, issuer, SANs
  - blacklist: listed count across engines
  - headers: grade + top missing headers
  - dns quick: A/AAAA/MX/NS presence summary
- `frontend/components/verdict.tsx` — `VerdictChip` + `VerdictCard` shared
  components (chip colors: emerald/amber/red/slate, consistent with site).
- Update `scripts/sync-base.sh` pro exclusions: `ui/lib/verdicts.ts`,
  `ui/app/d/`, `ui/components/verdict*` are pro-owned after the mirror.

## Phase 1 — Domain Overview (public) (~2–3 days) — biggest win

- New route `frontend/app/d/[domain]/page.tsx` (same dynamic-route mechanism
  as `/speedtest/[id]`; deep links `?domain=x` redirect to `/d/x`).
- Page fans out to: `/api/whois`, `/api/email`, `/api/dnssec`, `/api/tls`,
  `/api/blacklist`, `/api/headers`, `/api/lookup` (A/AAAA/MX/NS via
  SUPPORTED_TYPES subset) — with a small in-flight guard and stale-run
  protection (reuse the `runSeq` pattern).
- Render: 7 `VerdictCard`s + per-domain recents strip (`localStorage`,
  max 10, tap to reopen) + "Open as report" CTA (→ Pro, placeholder link to
  segbytes.co.za until the sales page exists).
- Landing behavior change: submitting the main input with no explicit tool
  selected routes to `/d/x`. Existing tabs stay; `?tool=` deep links still
  run a specific tool directly (backward compatible).
- Every card links to its full tool view with the domain prefilled.

## Phase 2 — Verdict bars + ⌘K palette (public) (~1.5–2 days)

- Each tool's result view gains a closing verdict bar: 1–3 plain-language
  lines + next-action chips (related tools, e.g. DMARC fail → "Check
  blacklists →", "See propagation →"). This is where the affiliate slots
  later activate (Phase 5) and where the Pro report CTA lives.
- Command palette (⌘K / Ctrl+K + a visible search button for mobile):
  - type domain → choose verb (whois / propagation / tls / compare …)
  - switch tool keeping current domain; open recent investigations
  - deep-linkable actions only (no server state).

## Phase 3 — Pro workspace (nexus-dns-pro) (~2–3 days)

- `/pro` becomes a sidebar shell (`ui/app/pro/layout.tsx`):
  **Batch · Reports · Monitor · Settings** (+ "Investigate" links back to
  the main app). Brand tokens unchanged.
- **Batch → queue model:** paste (≤100) → run → per-row results → actions
  on the *run*: Export CSV / Generate report. Last 10 runs in localStorage
  with a rerun button.
- **Reports view:** source selector (paste / last batch / monitor list) +
  section toggles → opens the existing `/api/pro/report/batch` in a new tab.
- **Monitor view:** promoted from the bolted-on section — domain grid,
  "diff since last run" as default, history drawer per domain (history
  endpoint already exists).
- **Settings:** license card (licensee/plan/expires), API key field
  (existing localStorage flow), brand.json hint for resellers.

## Phase 4 — Mobile + polish pass (~1–1.5 days)

- Public: 20-tab grid → segmented control / bottom sheet on small screens.
- Overview cards stack; palette reachable via button.
- Hierarchy/spacing tightening, focus-visible states everywhere,
  `prefers-reduced-motion` respected.

## Phase 5 — Funnel wiring (needs owner go-ahead)

- Affiliate slots activate **only on failure verdicts** per the integrity
  rule in the Brand Protection brief (Namecheap for expiring cert/domain;
  DMARC vendors for DMARC findings). Links env-configured, labelled as
  partner offers, never affecting results.
- "Generate client-ready report" CTA on public verdict bars → Pro sales
  page (doesn't exist yet — needs a segbytes.co.za page or landing).

---

## Sequencing & totals

| Phase | Ships | Days |
| --- | --- | --- |
| 0 | verdict tokens/components, sync excludes | 0.5 |
| 1 | Domain Overview (public) | 2–3 |
| 2 | verdict bars + ⌘K | 1.5–2 |
| 3 | Pro workspace | 2–3 |
| 4 | mobile/polish | 1–1.5 |
| 5 | affiliates + CTA (owner decision) | 1 |

≈ 8–10 focused days. Every phase ships behind normal branch→PR flow with
tsc/lint/build green and Pages/Render verification as usual.

## Explicit non-goals

- No accounts, no server-side sessions, no new backend endpoints.
- No marketing-glam redesign; terminal aesthetic stays.
- No inbox-placement-style features (NexusEmail's lane).

## Decisions needed from owner

1. Landing default → Overview (behavior change) — assumed yes.
2. Phase 5 affiliate activation + Pro CTA destination URL.
3. Pro report CTA sales page URL (or defer Phase 5).
