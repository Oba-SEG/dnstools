"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, FileSearch, Globe, Lock, Mail, Network, ShieldCheck,
} from "lucide-react";
import {
  VerdictCard, pushRecent, RecentsStrip,
} from "@/components/verdict";
import {
  blacklistVerdict, cleanDomain, dnsVerdict, dnssecVerdict, emailVerdict,
  headersVerdict, isDomainish, tlsVerdict, whoisVerdict,
  type Verdict,
} from "@/lib/verdicts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api";
const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const BASE = STATIC_EXPORT ? "/dnstools" : "";

type CardKey = "whois" | "dns" | "dnssec" | "email" | "tls" | "headers" | "blacklist";

interface CardState {
  status: "loading" | "done";
  data?: any;
  error?: string;
}

const CARD_META: Record<CardKey, { label: string; icon: ReactNode; tool?: string }> = {
  whois:    { label: "Registration", icon: <FileSearch className="w-4 h-4 text-orange-400" />, tool: "whois" },
  dns:      { label: "DNS",          icon: <Globe className="w-4 h-4 text-orange-400" />, tool: "lookup" },
  dnssec:   { label: "DNSSEC",       icon: <Network className="w-4 h-4 text-orange-400" />, tool: "dnssec" },
  email:    { label: "Email",        icon: <Mail className="w-4 h-4 text-orange-400" />, tool: "email" },
  tls:      { label: "TLS / SSL",    icon: <Lock className="w-4 h-4 text-orange-400" />, tool: "tls" },
  headers:  { label: "HTTP headers", icon: <ShieldCheck className="w-4 h-4 text-orange-400" />, tool: "headers" },
  blacklist:{ label: "Blacklists",   icon: <AlertTriangle className="w-4 h-4 text-orange-400" />, tool: "blacklist" },
};

const INITIAL: Record<CardKey, CardState> = {
  whois: { status: "loading" },
  dns: { status: "loading" },
  dnssec: { status: "loading" },
  email: { status: "loading" },
  tls: { status: "loading" },
  headers: { status: "loading" },
  blacklist: { status: "loading" },
};

const VERDICTS: Record<CardKey, (d: any) => Verdict> = {
  whois: whoisVerdict,
  dns: dnsVerdict,
  dnssec: dnssecVerdict,
  email: emailVerdict,
  tls: tlsVerdict,
  headers: headersVerdict,
  blacklist: blacklistVerdict,
};

function cardHref(tool: string | undefined, domain: string): string | undefined {
  if (!tool) return undefined;
  return `${BASE}/?tool=${tool}&domain=${encodeURIComponent(domain)}`;
}

export default function DomainOverviewClient({ pathDomain }: { pathDomain?: string }) {
  const params = useParams();
  const routeDomain = params?.domain as string | undefined;

  const [domain] = useState<string | null>(() => {
    if (pathDomain && pathDomain !== "_" && pathDomain !== "index") return cleanDomain(pathDomain);
    if (typeof window === "undefined") return null;
    const fromQuery = new URLSearchParams(window.location.search).get("domain");
    if (fromQuery) {
      const cleaned = cleanDomain(fromQuery);
      return isDomainish(cleaned) ? cleaned : null;
    }
    return routeDomain && routeDomain !== "_" ? cleanDomain(routeDomain) : null;
  });

  const [cards, setCards] = useState<Record<CardKey, CardState>>(INITIAL);

  const setCard = (key: CardKey, patch: Partial<CardState>) => {
    setCards(prev => ({ ...prev, [key]: { ...prev[key], ...patch, status: patch.status ?? "done" } }));
  };

  useEffect(() => {
    if (!domain) return;
    pushRecent(domain);

    const fetchCard = async (key: CardKey, url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || (res.status === 429 ? "Rate limited — retry shortly" : `HTTP ${res.status}`));
        }
        const data = await res.json();
        setCard(key, { status: "done", data, error: undefined });
        return data;
      } catch (e: any) {
        setCard(key, { status: "done", data: undefined, error: e?.message || "Request failed" });
        return null;
      }
    };

    const light: [CardKey, string][] = [
      ["whois", `${API}/whois?domain=${encodeURIComponent(domain)}`],
      ["email", `${API}/email?domain=${encodeURIComponent(domain)}`],
      ["dnssec", `${API}/dnssec?domain=${encodeURIComponent(domain)}`],
      ["tls", `${API}/tls?domain=${encodeURIComponent(domain)}`],
      ["headers", `${API}/headers?domain=${encodeURIComponent(domain)}`],
    ];
    for (const [key, url] of light) fetchCard(key, url);

    (async () => {
      const dnsData = await fetchCard("dns", `${API}/lookup?domain=${encodeURIComponent(domain)}&types=A,AAAA,MX,NS`);
      const aRecord = dnsData?.results?.find((r: any) => r.type === "A" && !r.error)?.records?.[0];
      if (!aRecord) {
        setCard("blacklist", { status: "done", data: null });
        return;
      }
      await fetchCard("blacklist", `${API}/blacklist?ip=${encodeURIComponent(aRecord)}`);
    })();
  }, [domain]);

  const invalid = !domain;

  return (
    <main className="min-h-screen bg-[#060810]">
      <header className="border-b border-white/[0.04] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3.5 flex items-center gap-2.5">
          <div className="ndns-mark w-8 h-8 text-[12px]">N</div>
          <h1 className="text-[14px] font-display font-bold tracking-tight text-foreground/90">Nexus Domain Tools</h1>
          <a href={`${BASE}/`} className="ml-auto inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors">
            <ArrowLeft className="w-3 h-3" /> All tools
          </a>
        </div>
      </header>

      <section className="container mx-auto px-6 py-12">
        {invalid ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <p className="text-sm text-muted-foreground mb-4">No valid domain in the URL.</p>
            <a href={`${BASE}/`} className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-block">Start from the tools</a>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-[10px] uppercase tracking-[0.2em] text-orange-400/80 font-bold mb-2">Domain overview</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tighter text-foreground break-all">{domain}</h2>
              <p className="text-[12px] text-muted-foreground mt-2">Live checks · nothing stored · tap a card for the full tool</p>
              <RecentsStrip exclude={domain ?? undefined} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {(Object.keys(CARD_META) as CardKey[]).map(key => {
                const meta = CARD_META[key];
                const st = cards[key];
                let verdict: Verdict | null = null;
                if (st.status === "done" && !st.error) {
                  verdict = key === "blacklist" && st.data === null
                    ? { level: "info", headline: "No IPv4 address to check" }
                    : VERDICTS[key](st.data);
                }
                return (
                  <VerdictCard
                    key={key}
                    icon={meta.icon}
                    title={meta.label}
                    verdict={verdict}
                    loading={st.status === "loading"}
                    error={st.error ?? null}
                    href={cardHref(meta.tool, domain)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>

      <footer className="border-t border-white/[0.04] mt-16">
        <div className="container mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Nexus DNS · Free · No login · No data stored</p>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            <a href={`${BASE}/privacy`} className="hover:text-orange-300 transition-colors">Privacy</a>
            <a href={`${BASE}/terms`} className="hover:text-orange-300 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
