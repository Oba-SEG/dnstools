"use client";

import { useState } from "react";
import Link from "next/link";
import { initializePaddle } from "@paddle/paddle-js";
import { Check, Download, FileText, GitBranch, ListChecks, Lock, Minus, Monitor, X } from "lucide-react";

// Checkout: Paddle.js overlay (public client-side token — no secrets here).
// After payment, Paddle redirects to /pro/redeem (successUrl, resolved
// relative to this page so it works under any host/base path) and appends
// ?_ptxn=<transaction id> for the redemption page to pick up.
const PADDLE_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";
const PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID || "pri_01m77gfvpjg1c6c1yjcdqs359f";
const PRICE = "$79";

let paddleInit: ReturnType<typeof initializePaddle> | null = null;
function openCheckout(): Promise<void> {
  if (!paddleInit) paddleInit = initializePaddle({ token: PADDLE_TOKEN });
  return paddleInit.then(paddle => {
    if (!paddle) throw new Error("checkout init failed");
    paddle.Checkout.open({
      items: [{ priceId: PRICE_ID, quantity: 1 }],
      settings: {
        displayMode: "overlay",
        theme: "dark",
        successUrl: new URL("pro/redeem", window.location.href).href,
      },
    });
  });
}

const FEATURES = [
  { icon: ListChecks, title: "Batch audits", desc: "Fan out up to 100 domains per run — WHOIS facts or full DNS records — with a live results table." },
  { icon: Download, title: "CSV / JSON exports", desc: "Every batch downloads as a clean spreadsheet for your client deliverables." },
  { icon: FileText, title: "Client-ready reports", desc: "Generate a stamped HTML report per batch — print to PDF, hand it to your client." },
  { icon: Monitor, title: "Change monitoring", desc: "Scheduled snapshots of expiry, DNSSEC, SPF/DMARC and A records, with diffs against the last run." },
  { icon: Lock, title: "Offline license", desc: "Signed ed25519 license — no activation server, no phone-home. Works air-gapped." },
  { icon: GitBranch, title: "Self-hosted bundle", desc: "One docker compose up: API, UI, Prometheus, Grafana dashboards included." },
];

const COMPARE: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: "All 17 lookup tools", free: true, pro: true },
  { label: "Domain overview dossier", free: true, pro: true },
  { label: "Batch size", free: "10 domains", pro: "100 domains" },
  { label: "CSV / JSON exports", free: false, pro: true },
  { label: "Client-ready PDF reports", free: false, pro: true },
  { label: "Change monitoring + diffs", free: false, pro: true },
  { label: "Grafana dashboards", free: false, pro: true },
  { label: "Accounts and cookies", free: false, pro: false },
  { label: "Privacy-friendly aggregate analytics", free: true, pro: true },
];

export default function ProSalesPage() {
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyErr, setBuyErr] = useState("");

  async function buy() {
    setBuyBusy(true);
    setBuyErr("");
    try {
      if (!PADDLE_TOKEN) {
        setBuyErr("Checkout is being set up — try again shortly.");
        return;
      }
      await openCheckout();
    } catch {
      setBuyErr("Checkout failed to open — check your connection and try again.");
    } finally {
      setBuyBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#060810]">
      <header className="border-b border-white/[0.04] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3.5 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="ndns-mark w-8 h-8 text-[12px]">N</div>
            <h1 className="text-[14px] font-display font-bold tracking-tight text-foreground/90">Nexus DNS</h1>
          </Link>
          <span className="text-[9px] uppercase tracking-widest text-orange-400/80 border border-orange-500/20 rounded-full px-2 py-0.5">Pro</span>
          <Link href="/" className="ml-auto text-[11px] text-muted-foreground hover:text-orange-300 transition-colors">← Free tools</Link>
        </div>
      </header>

      <section className="container mx-auto px-6 pt-16 pb-10 text-center max-w-2xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.2em] text-orange-400/80 font-bold mb-3">The auditor edition · self-hosted</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tighter leading-tight mb-4">
          Everything above,<br />plus the parts you bill for.
        </h2>
        <p className="text-[13px] text-muted-foreground leading-relaxed max-w-md mx-auto">
          One-time license, no subscription. Runs on your own hardware — your clients&apos;
          domains never touch a third-party SaaS.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={buy}
            disabled={buyBusy}
            className="btn-primary px-8 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          >
            {buyBusy ? "Opening checkout…" : `Buy Nexus Pro — ${PRICE} one-time`}
          </button>
          <a href="mailto:obakengsegoatlhe@gmail.com?subject=Nexus%20Pro%20enquiry" className="text-xs text-muted-foreground hover:text-orange-300 transition-colors underline">
            Questions? Email us
          </a>
        </div>
        {buyErr && (
          <p className="mt-4 text-[12px] text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded-lg p-3 max-w-md mx-auto leading-relaxed">{buyErr}</p>
        )}
      </section>

      <section className="container mx-auto px-6 pb-16 max-w-4xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="premium-surface premium-card rounded-xl p-4">
                <Icon className="w-4 h-4 text-orange-400 mb-2.5" />
                <p className="font-display font-bold text-xs tracking-tight mb-1">{f.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-6 pb-16 max-w-2xl mx-auto">
        <h3 className="font-display text-xl font-bold tracking-tight text-center mb-6">Free vs Pro</h3>
        <div className="premium-surface rounded-2xl p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground/60">
                <th className="pb-3 pr-4">Capability</th>
                <th className="pb-3 pr-4">Free</th>
                <th className="pb-3 text-orange-400">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {COMPARE.map(row => (
                <tr key={row.label}>
                  <td className="py-2.5 pr-4">{row.label}</td>
                  <td className="py-2.5 pr-4">
                    {row.free === true ? (<><Check aria-hidden="true" className="w-4 h-4 text-emerald-400" /><span className="sr-only">Yes</span></>) :
                     row.free === false ? (<><Minus aria-hidden="true" className="w-4 h-4 text-muted-foreground/40" /><span className="sr-only">No</span></>) :
                     <span className="text-[12px] text-muted-foreground">{row.free}</span>}
                  </td>
                  <td className="py-2.5">
                    {row.pro === true ? (<><Check aria-hidden="true" className="w-4 h-4 text-orange-400" /><span className="sr-only">Yes</span></>) :
                     row.pro === false ? (<><X aria-hidden="true" className="w-4 h-4 text-muted-foreground/40" /><span className="sr-only">No</span></>) :
                     <span className="text-[12px] text-orange-300">{row.pro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 text-center leading-relaxed">
          {PRICE} one-time · perpetual license · one deployment per license · the free public tools
          stay free and anonymous, always. Sales handled by our merchant of record (Paddle);
          taxes included at checkout. Right after payment, Paddle hands you off to the
          {" "}<Link href="/pro/redeem" className="text-orange-300 underline hover:text-orange-200">redemption page</Link>,
          where your license key appears instantly — no waiting on email.
        </p>
      </section>

      <footer className="border-t border-white/[0.04]">
        <div className="container mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Nexus DNS · Free · No login · No data stored</p>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            <Link href="/privacy" className="hover:text-orange-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-300 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
