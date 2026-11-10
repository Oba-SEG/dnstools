"use client";

// Cloudflare Turnstile token provider for the heavy API endpoints.
//
// Design:
// - The script loads lazily on the first gated call (zero cost otherwise).
// - One managed widget (execution:'execute', interaction-only appearance)
//   is rendered once into a visible bottom-center container.
// - Each gated call mints a fresh token by executing the widget; tokens
//   are single-use server-side, so nothing is cached.
// - Executes are serialized through a promise chain — one token at a time.
// - The container is shown while a challenge is pending and hidden when
//   done — if Cloudflare decides this session needs an interactive check,
//   the checkbox is fully visible and clickable (never clipped).
// - Any failure (script load, widget error, grace timeout) resolves null;
//   the caller then sends the request without the header and the
//   backend's clear 400 message surfaces in the UI.
// - If NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev / LAN backend),
//   protection is off: resolve null immediately.

const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const GRACE_TIMEOUT_MS = 20_000;

interface TurnstileApi {
  ready?: (cb: () => void) => void;
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id?: string) => void;
  remove: (id: string) => void;
  getResponse: (id: string) => string;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __tsOnload?: () => void;
  }
}

let widgetId: string | null = null;
let containerEl: HTMLElement | null = null;
let loading: Promise<TurnstileApi> | null = null;
let chain: Promise<string | null> = Promise.resolve(null);
// Resolver for the mint currently in flight. Executes are serialized, so
// at most one is ever pending.
let pendingResolve: ((t: string | null) => void) | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const w = window;
    if (w.turnstile) return resolve(w.turnstile);
    w.__tsOnload = () => {
      if (!w.turnstile) { reject(new Error("turnstile: api loaded but object missing")); return; }
      resolve(w.turnstile);
    };
    const s = document.createElement("script");
    s.src = `${SCRIPT_SRC}?onload=__tsOnload`;
    s.async = true;
    s.onerror = () => reject(new Error("turnstile: failed to load script"));
    document.head.appendChild(s);
  });
  return loading;
}

function ensureContainer(): HTMLElement {
  if (containerEl && document.documentElement.contains(containerEl)) return containerEl;
  containerEl = document.createElement("div");
  containerEl.setAttribute("data-ndns-turnstile", "");
  // Never clipped: if the challenge needs a click, it must be fully
  // visible and clickable. Hidden by default; shown while minting.
  containerEl.style.cssText =
    "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);" +
    "z-index:2147483000;background:#0b0e17;border:1px solid rgba(255,255,255,.12);" +
    "border-radius:14px;padding:10px;box-shadow:0 10px 40px rgba(0,0,0,.55);" +
    "display:none;";
  document.body.appendChild(containerEl);
  return containerEl;
}

function renderWidget(ts: TurnstileApi): string {
  containerEl = ensureContainer();
  widgetId = ts.render(containerEl, {
    sitekey: SITEKEY,
    appearance: "interaction-only",
    execution: "execute",
    callback: (token: string) => {
      const r = pendingResolve; pendingResolve = null;
      if (r) r(token);
    },
    "error-callback": () => {
      const r = pendingResolve; pendingResolve = null;
      if (r) r(null);
      if (widgetId !== null) { try { ts.reset(widgetId); } catch { /* noop */ } }
    },
    "expired-callback": () => {
      if (widgetId !== null) { try { ts.reset(widgetId); } catch { /* noop */ } }
    },
  });
  return widgetId;
}

// Mint exactly one token. Serialized via `chain`.
function mintOnce(): Promise<string | null> {
  if (!SITEKEY) return Promise.resolve(null);

  const next = chain.then(() =>
    new Promise<string | null>((resolve) => {
      let settled = false;
      const hide = () => { if (widgetId !== null) ensureContainer().style.display = "none"; };
      const done = (t: string | null) => {
        if (!settled) { settled = true; resolve(t); }
        hide();
      };
      const grace = setTimeout(() => done(null), GRACE_TIMEOUT_MS);

      loadScript()
        .then((ts) => {
          // Commit to showing the container BEFORE any challenge starts,
          // so an interaction-required flow can never stay invisible.
          containerEl = ensureContainer();
          containerEl.style.display = "flex";
          if (widgetId === null) renderWidget(ts);
          pendingResolve = (t) => {
            clearTimeout(grace);
            done(t);
          };
          try {
            ts.execute(widgetId as string);
          } catch {
            pendingResolve = null;
            clearTimeout(grace);
            done(null);
          }
        })
        .catch(() => { clearTimeout(grace); done(null); });
    })
  );
  // Keep the chain moving even if a call fails.
  chain = next.then(() => null, () => null);
  return next;
}

export async function getTurnstileToken(): Promise<string | null> {
  return mintOnce();
}
