"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, KeyRound } from "lucide-react";

// Production API — override with NEXT_PUBLIC_API_URL for local dev.
const API = process.env.NEXT_PUBLIC_API_URL || "https://ndns-api.onrender.com/api";

// Buyers often paste the whole receipt URL; pull the order UUID out of it.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function extractUuid(raw: string): string {
  const m = UUID_RE.exec(raw);
  return m ? m[0] : raw.trim();
}

export default function RedeemPage() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = extractUuid(params.get("order_id") || "");
    const em = params.get("email") || "";
    setOrderId(oid);
    setEmail(em);
    if (UUID_RE.test(oid) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      fetchLicense(oid, em);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLicense(oidRaw: string, em: string) {
    const oid = extractUuid(oidRaw);
    setBusy(true);
    setError("");
    setLicense("");
    try {
      const r = await fetch(`${API}/pro/redeem?order_id=${encodeURIComponent(oid)}&email=${encodeURIComponent(em)}`);
      if (r.ok) {
        setLicense((await r.text()).trim());
      } else {
        const j = await r.json().catch(() => ({}));
        setError(j.error || "Could not issue a license for this order.");
      }
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([license + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-pro-license.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="min-h-screen bg-[#060810]">
      <header className="border-b border-white/[0.04]">
        <div className="container mx-auto px-6 py-3.5 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="ndns-mark w-8 h-8 text-[12px]">N</div>
            <h1 className="text-[14px] font-display font-bold tracking-tight text-foreground/90">Nexus DNS</h1>
          </Link>
          <span className="text-[9px] uppercase tracking-widest text-orange-400/80 border border-orange-500/20 rounded-full px-2 py-0.5">Pro</span>
          <Link href="/" className="ml-auto text-[11px] text-muted-foreground hover:text-orange-300 transition-colors">← Free tools</Link>
        </div>
      </header>

      <section className="container mx-auto px-6 pt-14 pb-10 max-w-xl mx-auto">
        <div className="text-center mb-8">
          <KeyRound className="w-6 h-6 text-orange-400 mx-auto mb-3" />
          <h2 className="font-display text-2xl font-bold tracking-tight mb-2">Claim your license</h2>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Your order details were filled in from the checkout redirect. Press the button and
            your license key appears instantly — nothing is stored, no account needed.
          </p>
        </div>

        <div className="premium-surface rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block mb-1.5">Order ID</label>
            <input
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full h-11 px-3.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[12px]"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">
              In your Lemon Squeezy receipt email, open the receipt link — the order ID is the long code
              after <code className="text-orange-300">/orders/</code> in that URL. Pasting the whole URL works too.
            </p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block mb-1.5">Purchase email</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full h-11 px-3.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[13px]"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">The email you paid with, from your Lemon Squeezy receipt.</p>
          </div>

          <button
            onClick={() => fetchLicense(orderId.trim(), email.trim())}
            disabled={busy || !orderId.trim() || !email.trim()}
            className="btn-primary w-full h-11 rounded-lg text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Checking your order…" : "Get my license"}
          </button>

          {error && (
            <p className="text-[12px] text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded-lg p-3 leading-relaxed">{error}</p>
          )}

          {license && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Your license key</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(license); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="premium-surface rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5 hover:text-orange-300 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={download}
                    className="premium-surface rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5 hover:text-orange-300 transition-colors"
                  >
                    <Download className="w-3 h-3" /> .txt
                  </button>
                </div>
              </div>
              <pre className="bg-black/40 border border-white/[0.06] rounded-lg p-3 font-mono text-[10px] leading-relaxed break-all whitespace-pre-wrap select-all">{license}</pre>
              <div className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
                <p className="font-bold text-foreground/80 mb-1">Activate on your server:</p>
                <p>Set <code className="text-orange-300">LICENSE_KEY</code> to this value in your <code className="text-orange-300">.env</code>, then restart the stack. See the README&rsquo;s licensing section for one-command setup.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
