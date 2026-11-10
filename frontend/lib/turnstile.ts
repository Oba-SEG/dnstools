"use client";

// Cloudflare Turnstile token provider for the heavy API endpoints.
//
// Design:
// - The script loads lazily on the first gated call (zero cost otherwise).
// - One managed widget (interaction-only appearance) is rendered once into
//   a fixed container; each gated call executes it to mint a fresh token.
//   Tokens are single-use server-side, so nothing is cached.
// - Executes are serialized through a promise chain — the widget can only
//   mint one token at a time.
// - Any failure (script load, widget error, expiry timeout) resolves null;
//   caller then sends the request without the header and the backend's
//   clear 400 message surfaces in the UI.
// - If NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev / LAN backend),
//   protection is off: resolve null immediately.

const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const GRACE_TIMEOUT_MS = 15_000;

interface TurnstileApi {
  ready: (cb: () => void) => void;
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  remove: (id: string) => void;
  getResponse: (id: string) => string;
  reset: (id?: string) => void;
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

function loadScript(): Promise<TurnstileApi> {
  const w = window;
  const existing = w.turnstile && containerEl ? Promise.resolve(w.turnstile) : null;
  if (existing) return existing;
  if (loading) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    if (w.turnstile) return resolve(w.turnstile);
    w.__tsOnload = () => {
      if (!w.turnstile) { reject(new Error("turnstile: api loaded but object missing")); return; }
      resolve(w.turnstile);
    };
    const s = document.createElement("script");
    s.src = `${SCRIPT_SRC}?onload=__tsOnload&render=explicit`;
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
  containerEl.style.cssText =
    "position:fixed;left:50%;bottom:10px;transform:translateX(-50%);width:300px;max-height:65px;overflow:hidden;z-index:2147483000;";
  document.body.appendChild(containerEl);
  return containerEl;
}

function renderWidget(ts: TurnstileApi, onToken: (t: string) => void, onError: (e: string) => void): string {
  widgetId = ts.render(ensureContainer(), {
    sitekey: SITEKEY,
    appearance: "interaction-only",
    callback: onToken,
    "error-callback": (code: string) => onError(code),
    "expired-callback": () => onError("expired"),
  });
  return widgetId;
}

// Mint exactly one token. Serialized via `chain`.
function mintOnce(): Promise<string | null> {
  if (!SITEKEY) return Promise.resolve(null);

  const next = chain.then(() =>
    new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (t: string | null) => {
        if (!settled) { settled = true; resolve(t); }
      };
      const grace = setTimeout(() => done(null), GRACE_TIMEOUT_MS);

      loadScript()
        .then((ts) => {
          const id = widgetId ?? renderWidget(ts, (tok) => { clearTimeout(grace); done(tok); }, () => { clearTimeout(grace); done(null); });
          if (id === null) { clearTimeout(grace); done(null); return; }
          // Re-executing an already-rendered widget mints a fresh token.
          try {
            ts.execute(id);
          } catch {
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
