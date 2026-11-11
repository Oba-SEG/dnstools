"use client";

import { useEffect, useState } from "react";
import { Check, Download, FileText, GitBranch, ListChecks, Lock, Minus, Monitor, X } from "lucide-react";

// Swap these when the LemonSqueezy product goes live; leave BUY_URL empty
// to show the "sales open soon" state.
const BUY_URL = "";
const PRICE = "$79";

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
  { label: "Accounts, cookies, tracking", free: false, pro: false },
];

export default function ProSalesPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 0); return () => clearTimeout(id); }, []);

  return (
    <main className="min-h-screen bg-[#060810]">
      <header className="border-b border-white/[0.04] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3.5 flex items-center gap-2.5">
          <a href="/dnstools/" className="flex items-center gap-2.5 group">
            <div className="ndns-mark w-8 h-8 text-[12px]">N</div>
            <h1 className="text-[14px] font-display font-bold tracking-tight text-foreground/90">Nexus DNS</h1>
          </a>
          <span className="text-[9px] uppercase tracking-widest text-orange-400/80 border border-orange-500/20 rounded-full px-2 py-0.5">Pro</span>
          <a href="/dnstools/" className="ml-auto text-[11px] text-muted-foreground hover:text-orange-300 transition-colors">← Free tools</a>
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
          {BUY_URL ? (
            <a
              href={BUY_URL}
              className="btn-primary px-8 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2"
            >
              Buy Nexus Pro — {PRICE} one-time
            </a>
          ) : (
            <span className="px-8 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] text-muted-foreground cursor-not-allowed">
              Sales open soon — {PRICE} one-time
            </span>
          )}
          <a href="mailto:obakengsegoatlhe@gmail.com?subject=Nexus%20Pro%20enquiry" className="text-xs text-muted-foreground hover:text-orange-300 transition-colors underline">
            Questions? Email us
          </a>
        </div>
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
                    {row.free === true ? <Check className="w-4 h-4 text-emerald-400" /> :
                     row.free === false ? <Minus className="w-4 h-4 text-muted-foreground/40" /> :
                     <span className="text-[12px] text-muted-foreground">{row.free}</span>}
                  </td>
                  <td className="py-2.5">
                    {row.pro === true ? <Check className="w-4 h-4 text-orange-400" /> :
                     row.pro === false ? <X className="w-4 h-4 text-muted-foreground/40" /> :
                     <span className="text-[12px] text-orange-300">{row.pro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 text-center leading-relaxed">
          {PRICE} one-time · perpetual license · one deployment per license · the free public tools
          stay free and anonymous, always. Sales handled by our merchant of record; taxes included at checkout.
        </p>
      </section>

      <footer className="border-t border-white/[0.04]">
        <div className="container mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Nexus DNS · Free · No login · No data stored</p>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            <a href="/dnstools/privacy" className="hover:text-orange-300 transition-colors">Privacy</a>
            <a href="/dnstools/terms" className="hover:text-orange-300 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
