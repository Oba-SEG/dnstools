"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Globe, Search } from "lucide-react";
import { cleanDomain, isDomainish } from "@/lib/verdicts";
import { getRecents } from "@/components/verdict";

const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const BASE = STATIC_EXPORT ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "/dnstools") : "";

const TOOLS: { key: string; label: string }[] = [
  { key: "lookup", label: "DNS records" },
  { key: "propagation", label: "Propagation" },
  { key: "email", label: "Email auth" },
  { key: "tls", label: "TLS / SSL" },
  { key: "whois", label: "WHOIS" },
  { key: "headers", label: "HTTP headers" },
  { key: "blacklist", label: "Blacklists" },
  { key: "dnssec", label: "DNSSEC" },
  { key: "ping", label: "Ping" },
  { key: "portcheck", label: "Port check" },
  { key: "probe", label: "HTTP probe" },
  { key: "traceroute", label: "Traceroute" },
  { key: "geoip", label: "GeoIP / ASN" },
  { key: "mha", label: "Header analyzer" },
  { key: "speedtest", label: "Speed test" },
  { key: "compare", label: "Compare" },
  { key: "batch", label: "Batch" },
];

const NO_DOMAIN_VERBS = new Set(["compare", "batch", "mha", "speedtest"]);

interface Item {
  icon: ReactNode;
  label: string;
  hint?: string;
  href?: string;
  tabKey?: string;
}

function buildItems(q: string, recents: string[]): Item[] {
  const cleaned = cleanDomain(q);
  if (q.trim() && isDomainish(cleaned)) {
    const d = encodeURIComponent(cleaned);
    const items: Item[] = [
      { icon: <Globe className="w-4 h-4" />, label: `Overview: ${cleaned}`, hint: "dossier", href: `${BASE}/d/${d}` },
    ];
    for (const t of TOOLS) {
      if (NO_DOMAIN_VERBS.has(t.key)) continue;
      items.push({ icon: <Search className="w-4 h-4" />, label: `${t.label} on ${cleaned}`, hint: "run", href: `${BASE}/?tool=${t.key}&domain=${d}` });
    }
    items.push(
      { icon: <Search className="w-4 h-4" />, label: `Batch on ${cleaned}`, hint: "run", href: `${BASE}/?tool=batch&domain=${d}` },
      { icon: <Search className="w-4 h-4" />, label: `Compare ${cleaned} with…`, hint: "run", href: `${BASE}/?tool=compare&domain=${cleaned}` },
    );
    return items;
  }
  const needle = q.trim().toLowerCase();
  const tools = TOOLS
    .filter(t => !needle || t.label.toLowerCase().includes(needle))
    .map(t => ({ icon: <Search className="w-4 h-4" />, label: t.label, hint: "switch tool", tabKey: t.key }));
  const recentsItems = recents
    .slice(0, needle ? 3 : 4)
    .map(r => ({ icon: <Globe className="w-4 h-4" />, label: `Overview: ${r}`, hint: "recent", href: `${BASE}/d/${encodeURIComponent(r)}` } as Item));
  return needle ? [...tools, ...recentsItems] : [...recentsItems, ...tools];
}

export function CommandPalette({ onSwitchTab }: { onSwitchTab?: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ndns-open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ndns-open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      setRecents(getRecents());
      setQ("");
      setSel(0);
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [open]);

  const items = useMemo(() => buildItems(q, recents), [q, recents]);
  const selIdx = Math.min(sel, Math.max(items.length - 1, 0));

  const run = (item: Item) => {
    setOpen(false);
    if (item.href) {
      window.location.assign(item.href);
    } else if (item.tabKey) {
      onSwitchTab?.(item.tabKey);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        className="max-w-lg mx-auto mt-24 premium-surface rounded-2xl p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={q}
            spellCheck={false}
            autoComplete="off"
            placeholder="Type a domain, or search tools…"
            onChange={e => { setQ(e.target.value); setSel(0); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => Math.min(i + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); const it = items[selIdx]; if (it) run(it); }
              if (e.key === "Escape") setOpen(false);
            }}
            className="flex-1 bg-transparent text-sm py-1.5 placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <kbd className="text-[9px] uppercase tracking-widest text-muted-foreground/50 border border-white/[0.08] rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No matches.</p>
          )}
          {items.map((item, i) => (
            <button
              key={`${item.label}-${i}`}
              onClick={() => run(item)}
              onMouseEnter={() => setSel(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${i === selIdx ? "bg-white/[0.06]" : ""}`}
            >
              <span className="text-muted-foreground/70">{item.icon}</span>
              <span className="text-[13px] text-foreground/90 truncate">{item.label}</span>
              {item.hint && <span className="ml-auto text-[9px] uppercase tracking-widest text-muted-foreground/50 shrink-0">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
