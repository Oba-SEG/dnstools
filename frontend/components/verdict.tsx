"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Verdict } from "@/lib/verdicts";

const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const BASE = STATIC_EXPORT ? "/dnstools" : "";

const LEVEL_COLOR: Record<string, string> = {
  ok: "#10b981",
  warn: "#eab308",
  bad: "#ef4444",
  info: "#71717a",
};

const LEVEL_LABEL: Record<string, string> = {
  ok: "OK",
  warn: "Warning",
  bad: "Issue",
  info: "—",
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: LEVEL_COLOR[verdict.level] }} />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{LEVEL_LABEL[verdict.level]}</span>
    </span>
  );
}

export function VerdictCard({
  icon,
  title,
  verdict,
  loading,
  error,
  href,
}: {
  icon: ReactNode;
  title: string;
  verdict: Verdict | null;
  loading?: boolean;
  error?: string | null;
  href?: string;
}) {
  const inner = (
    <div className="premium-surface premium-card rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="font-display font-bold text-xs tracking-tight">{title}</span>
        {verdict && <span className="ml-auto"><VerdictChip verdict={verdict} /></span>}
      </div>
      {loading && (
        <div className="space-y-2 mt-1">
          <div className="h-3 w-3/4 bg-white/[0.06] rounded animate-pulse" />
          <div className="h-2.5 w-1/2 bg-white/[0.04] rounded animate-pulse" />
        </div>
      )}
      {!loading && error && (
        <p className="text-[11px] text-red-300/90 leading-relaxed">{error}</p>
      )}
      {!loading && !error && verdict && (
        <>
          <p className="text-[13px] font-semibold leading-snug" style={{ color: LEVEL_COLOR[verdict.level] }}>
            {verdict.headline}
          </p>
          {verdict.detail && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">{verdict.detail}</p>
          )}
        </>
      )}
      {!loading && !error && !verdict && (
        <div className="h-3 w-2/3 bg-white/[0.06] rounded animate-pulse mt-1" />
      )}
      {href && !loading && (
        <span className="mt-auto pt-3 inline-flex items-center gap-0.5 text-[10px] uppercase tracking-widest text-orange-400/80 group-hover:text-orange-300 transition-colors">
          Open tool <ChevronRight className="w-3 h-3" />
        </span>
      )}
    </div>
  );
  if (!href) return inner;
  return (
    <a href={href} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 rounded-xl">
      {inner}
    </a>
  );
}

const RECENTS_KEY = "ndns-recents";
const RECENTS_MAX = 10;

export function pushRecent(domain: string) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]") as string[];
    const next = [domain, ...list.filter(d => d !== domain)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export function getRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function RecentsStrip({ exclude }: { exclude?: string }) {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    const id = setTimeout(() => {
      setRecents(getRecents().filter(d => d !== exclude).slice(0, 5));
    }, 0);
    return () => clearTimeout(id);
  }, [exclude]);

  if (recents.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">Recent</span>
      {recents.map(d => (
        <a
          key={d}
          href={`${BASE}/d/${encodeURIComponent(d)}`}
          className="premium-surface rounded-full px-3 py-1 text-[11px] text-muted-foreground hover:text-orange-300 transition-colors"
        >
          {d}
        </a>
      ))}
    </div>
  );
}
