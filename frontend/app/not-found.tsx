"use client";

import { useEffect } from "react";

// GitHub Pages has no dynamic-path fallback for the static export: only
// /d/_/ and /speedtest/_/ shells exist as real files. Unknown paths are
// served from 404.html — so the not-found page rewrites pretty URLs into
// their shell+query form. Docker/nginx builds serve the pretty paths
// directly (200) and never reach this page, so the rewrite is harmless.
export default function NotFound() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const base = "/dnstools";
    let p = window.location.pathname;
    if (p.startsWith(base)) p = p.slice(base.length) || "/";
    let m = /^\/d\/([^/]+)/.exec(p);
    if (m && m[1] !== "_") {
      window.location.replace(`${base}/d/_/?domain=${encodeURIComponent(m[1])}`);
      return;
    }
    m = /^\/speedtest\/([^/]+)/.exec(p);
    if (m && m[1] !== "_") {
      window.location.replace(`${base}/speedtest/_/?id=${encodeURIComponent(m[1])}`);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#060810] flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-orange-400/80 font-bold mb-3">404</p>
        <h1 className="font-display text-2xl font-bold tracking-tighter mb-3">Page not found</h1>
        <p className="text-[13px] text-muted-foreground mb-6">That URL doesn&apos;t exist on this site.</p>
        <a href="/dnstools/" className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-block">Back to the tools</a>
      </div>
    </main>
  );
}
