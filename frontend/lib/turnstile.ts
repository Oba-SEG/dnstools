"use client";

// Cloudflare Turnstile token provider for the heavy API endpoints.
//
// - Script (challenges.cloudflare.com) loads lazily on the first gated call.
// - One managed widget, execution:'execute', is rendered once into a
//   visible bottom-center container (never clipped — if Cloudflare decides
//   an interactive check is needed, the checkbox stays clickable).
// - Each gated call executes the widget for a fresh single-use token.
//   Executes are serialized: one mint at a time.
// - Failures never throw: { token: null, reason } so the UI can explain.
// - With NEXT_PUBLIC_TURNSTILE_SITE_KEY unset (local dev / LAN) the gate
//   is off: { token: null, reason: 'no-sitekey' }.

const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const GRACE_TIMEOUT_MS = 20_000;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __tsOnload?: () => void;
  }
}

export interface TurnstileResult {
  token: string | null;
  reason: string;
}

let widgetId: string | null = null;
let containerEl: HTMLElement | null = null;
let scriptLoading: Promise<TurnstileApi> | null = null;
let chain: Promise<TurnstileResult> = Promise.resolve({ token: null, reason: "no-sitekey" });
let pendingResolve: ((t: string | null, reason?: string) => void) | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<TurnstileApi>((resolve, reject) => {
    const w = window;
    if (w.turnstile) return resolve(w.turnstile);
    w.__tsOnload = () => {
      if (w.turnstile) resolve(w.turnstile);
      else reject(new Error("loaded-but-missing"));
    };
    const s = document.createElement("script");
    s.src = `${SCRIPT_SRC}?onload=__tsOnload&render=explicit`;
    s.async = true;
    s.onerror = () => reject(new Error("script-load-failed"));
    document.head.appendChild(s);
    setTimeout(() => {
      if (!w.turnstile) reject(new Error("script-open-timeout"));
    }, 8000);
  });
  return scriptLoading;
}

function ensureContainer(): HTMLElement {
  if (containerEl && document.documentElement.contains(containerEl)) return containerEl;
  containerEl = document.createElement("div");
  containerEl.setAttribute("data-ndns-turnstile", "");
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
    "error-callback": (code?: string) => {
      const r = pendingResolve; pendingResolve = null;
      if (r) r(null, `widget-error-${code || "unknown"}`);
      if (widgetId !== null) { try { ts.reset(widgetId); } catch { /* noop */ } }
    },
    "expired-callback": () => {
      if (widgetId !== null) { try { ts.reset(widgetId); } catch { /* noop */ } }
    },
  });
  return widgetId;
}

function mintOnce(): Promise<TurnstileResult> {
  const next = chain.then(() => new Promise<TurnstileResult>((resolve) => {
    let settled = false;
    const hide = () => { if (widgetId !== null) ensureContainer().style.display = "none"; };
    const done = (token: string | null, reason: string) => {
      if (!settled) { settled = true; resolve({ token, reason }); }
      hide();
    };
    if (!SITEKEY) { done(null, "no-sitekey"); return; }

    const grace = setTimeout(() => done(null, "no-solve-timeout"), GRACE_TIMEOUT_MS);

    loadScript()
      .then((ts) => {
        containerEl = ensureContainer();
        containerEl.style.display = "flex";
        if (widgetId === null) renderWidget(ts);
        // Turnstile widgets are one-shot: an already-solved widget ignores
        // a bare execute(). Reset it so every mint gets a fresh challenge.
        try { ts.reset(widgetId as string); } catch { /* first run: nothing to reset */ }
        pendingResolve = (t, reason) => {
          clearTimeout(grace);
          if (t) done(t, "ok");
          else done(null, reason || "widget-no-solve");
        };
        try {
          ts.execute(widgetId as string);
        } catch {
          pendingResolve = null;
          clearTimeout(grace);
          done(null, "execute-threw");
        }
      })
      .catch((e: Error) => { clearTimeout(grace); done(null, `script-${e.message}`); });
  }));
  chain = next.then(() => ({ token: null, reason: "idle" }));
  return next;
}

export async function getTurnstileToken(): Promise<TurnstileResult> {
  return mintOnce();
}
