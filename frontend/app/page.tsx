"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, Globe, Mail, ShieldCheck, Server, Map, FileSearch, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Lock, ChevronRight, Network, Radio, Clock, LinkIcon,
  GitCompare, ListChecks,
} from "lucide-react";
import { WorldMap } from "@/components/world-map";
import { RecentsStrip, ToolVerdict } from "@/components/verdict";
import { CommandPalette } from "@/components/command-palette";
import { getTurnstileToken } from "@/lib/turnstile";
import { fetchResilient } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api";
const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const BASE = STATIC_EXPORT ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "/dnstools") : "";

function multiTargets(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0])
    .filter(Boolean);
}

async function mintHeavyHeader(): Promise<Record<string, string>> {
  const ts = await getTurnstileToken();
  if (ts.token) return { "x-turnstile-token": ts.token };
  throw new Error(
    `Security check didn't complete (${ts.reason}). Disable any ad/tracker blocker for this page and press Run again.`
  );
}

type TabKey = "lookup" | "propagation" | "email" | "tls" | "whois" | "headers" | "blacklist" | "dnssec" | "ping" | "portcheck" | "probe" | "traceroute" | "geoip" | "mha" | "speedtest" | "compare" | "batch";

const TABS: { key: TabKey; label: string; icon: any; desc: string }[] = [
  { key: "lookup",      label: "DNS records",   icon: Globe,       desc: "All record types (A, AAAA, MX, NS, TXT, SOA, SRV, CAA)" },
  { key: "propagation", label: "Propagation",   icon: Map,         desc: "Query 15 global resolvers, see who agrees" },
  { key: "email",       label: "Email auth",    icon: Mail,        desc: "SPF, DKIM, DMARC, MTA-STS, TLS-RPT, BIMI" },
  { key: "tls",         label: "TLS / SSL",     icon: Lock,        desc: "Certificate chain, expiry, ALPN, cipher" },
  { key: "whois",       label: "WHOIS",         icon: FileSearch,  desc: "Registrar, creation, expiry, status" },
  { key: "headers",     label: "HTTP headers",  icon: ShieldCheck, desc: "Security header grade (HSTS, CSP, etc.)" },
  { key: "blacklist",   label: "Blacklists",    icon: AlertTriangle, desc: "Check against 10 major DNSBLs" },
  { key: "dnssec",      label: "DNSSEC",        icon: Network,     desc: "DNSKEY + DS presence" },
  { key: "ping",        label: "Ping",          icon: Radio,       desc: "TCP RTT timing, 5-sample average" },
  { key: "portcheck",   label: "Port check",    icon: Server,      desc: "TCP reachability across 18 well-known ports" },
  { key: "probe",       label: "HTTP probe",    icon: Server,      desc: "Status, headers, redirect chain, timing breakdown" },
  { key: "traceroute",  label: "Traceroute",    icon: Network,     desc: "Hop-by-hop network path (TCP mode)" },
  { key: "geoip",       label: "GeoIP / ASN",   icon: Map,         desc: "Country, region, city, coords, timezone" },
  { key: "mha",         label: "Header analyzer", icon: Mail,      desc: "Parse email headers: hops, delays, auth, spam verdicts" },
  { key: "speedtest",   label: "Speed test",      icon: Clock,      desc: "DNS, TCP, TLS, HTTP, WHOIS performance metrics" },
  { key: "compare",     label: "Compare",         icon: GitCompare, desc: "Diff DNS records + WHOIS facts for two domains" },
  { key: "batch",       label: "Batch",           icon: ListChecks, desc: "Auditor mode: WHOIS or DNS over up to 10 domains" },
];

function parseDeepLink(): { tool: TabKey; domain: string; explicitTool: boolean } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("domain");
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  const okShape = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned) || /^(\d{1,3}\.){3}\d{1,3}$/.test(cleaned);
  if (!okShape) return null;
  const tool = params.get("tool");
  const toolOk = !!(tool && TABS.some((t) => t.key === tool));
  return { tool: (toolOk ? tool : "lookup") as TabKey, domain: cleaned, explicitTool: toolOk };
}

export default function Home() {
  const runSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Deep links are resolved after mount, never inside a useState initializer:
  // reading window.location there makes the first client render differ from
  // the prerendered HTML (SSR sees no query) and can break hydration on some
  // mobile browsers — leaving the input dead and the Run button stuck grey.
  const [deepLink, setDeepLink] = useState<ReturnType<typeof parseDeepLink>>(null);
  const [tab, setTab] = useState<TabKey>("lookup");
  const [domain, setDomain] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propType, setPropType] = useState<"A" | "AAAA" | "CNAME" | "MX" | "NS" | "TXT">("A");
  const [mhaInput, setMhaInput] = useState("");
  const [batchMode, setBatchMode] = useState<"whois" | "dns">("whois");
  const [toolPicked, setToolPicked] = useState(false);

  const run = async (which: TabKey, target: string) => {
    if (!target && which !== "mha") return;
    const seq = ++runSeq.current;
    setLoading(true);
    setError(null);
    const stale = () => seq !== runSeq.current;
    setData(null);
    try {
      if (which === "mha") {
        const res = await fetchResilient(`${API}/mha`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers: mhaInput }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const body = await res.json();
        if (!stale()) setData(body);
        return;
      }
      const params = new URLSearchParams();
      if (which === "speedtest") {
        // Speed test is self-contained — no domain API call needed
        setData({ _speedtest: true });
        return;
      }
      if (which === "compare") {
        const list = multiTargets(target);
        if (list.length !== 2) {
          throw new Error("Compare needs exactly two domains, comma-separated: example.com, other.com");
        }
        const headers = await mintHeavyHeader();
        const res = await fetchResilient(`${API}/compare?${new URLSearchParams({ domain1: list[0], domain2: list[1] })}`, { headers });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
        return;
      }
      if (which === "batch") {
        const list = multiTargets(target);
        if (list.length === 0) {
          throw new Error("Batch needs a list of domains (1–10), comma- or newline-separated.");
        }
        if (list.length > 10) {
          throw new Error(`Batch supports up to 10 domains (got ${list.length}). Split the list and run twice.`);
        }
        const headers = await mintHeavyHeader();
        const res = await fetchResilient(`${API}/batch?${new URLSearchParams({ domains: list.join(","), mode: batchMode })}`, { headers });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
        return;
      }
      // Each endpoint uses a slightly different parameter name; map here.
      const paramKey =
        which === "blacklist" ? "ip" :
        which === "ping" ? "host" :
        which === "portcheck" ? "host" :
        which === "probe" ? "url" :
        which === "traceroute" ? "host" :
        which === "geoip" ? "q" :
        "domain";
      params.set(paramKey, target);
      if (which === "propagation") params.set("type", propType);
      // Heavy endpoints are bot-gated server-side; mint a Turnstile token
      // (no-op when the protection isn't configured) and send it along.
      const HEAVY = new Set(["propagation", "tls", "whois", "headers", "blacklist", "ping", "portcheck", "probe", "traceroute"]);
      const headers: Record<string, string> = {};
      if (HEAVY.has(which)) {
        const ts = await getTurnstileToken();
        if (ts.token) {
          headers["x-turnstile-token"] = ts.token;
        } else {
          throw new Error(
            `Security check didn't complete (${ts.reason}). Disable any ad/tracker blocker for this page and press Run again.`
          );
        }
      }
      const res = await fetchResilient(
        `${API}/${which}?${params.toString()}`,
        { headers },
        (msg) => { if (!stale()) setError(msg); },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      if (!stale()) setData(body);
    } catch (e: any) {
      if (!stale()) setError(e?.message || "Request failed");
    } finally {
      if (!stale()) setLoading(false);
    }
  };

  // Re-run when tab, propType or batch mode changes
  useEffect(() => {
    if (submitted && deepLink && !deepLink.explicitTool && deepLink.tool === "lookup" && !toolPicked) {
      window.location.assign(`${BASE}/d/${encodeURIComponent(submitted)}`);
      return;
    }
    if (submitted && tab !== "mha") {
      const t = setTimeout(() => run(tab, submitted), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, propType, batchMode]);

  // Resolve deep links after hydration so the first client render matches SSR.
  useEffect(() => {
    const t = setTimeout(() => {
      const dl = parseDeepLink();
      if (!dl) return;
      setDeepLink(dl);
      setDomain(dl.domain);
      if (!dl.explicitTool && dl.tool === "lookup") {
        window.location.assign(`${BASE}/d/${encodeURIComponent(dl.domain)}`);
        return;
      }
      setTab(dl.tool);
      setSubmitted(dl.domain);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    if (!cleaned) {
      inputRef.current?.focus();
      return;
    }
    if (!toolPicked && tab === "lookup") {
      window.location.assign(`${BASE}/d/${encodeURIComponent(cleaned)}`);
      return;
    }
    setSubmitted(cleaned);
    run(tab, cleaned);
  };

  return (
    <main className="min-h-screen relative">
      {/* Top bar */}
      <header className="border-b border-white/[0.04] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3.5 flex items-center justify-between">
          <a href={`${BASE}/`} title="Back to start" className="flex items-center gap-2.5 group">
            <div className="ndns-mark w-8 h-8 text-[12px] group-hover:opacity-80 transition-opacity">N</div>
            <h1 className="text-[14px] font-display font-bold tracking-tight text-foreground/90 group-hover:text-orange-300 transition-colors">Nexus Domain Tools</h1>
          </a>
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.dispatchEvent(new Event("ndns-open-palette"))}
              title="Search (Ctrl/⌘ K)"
              className="p-2 rounded-lg border border-white/[0.06] text-muted-foreground hover:text-orange-300 hover:border-white/10 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <span className="hidden md:inline text-[10px] uppercase tracking-widest text-muted-foreground/60">Free · No login · No data stored</span>
            <a
              href="https://brandprotection.segbytes.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-orange-300 transition-colors"
            >
              Brand Protection <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-10 sm:pt-14 pb-8">
        <div className="text-center max-w-xl mx-auto mb-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-400/80 font-bold mb-3">DNS · Email · TLS · WHOIS · Network</p>
          <h2 className="font-display text-3xl sm:text-[2.5rem] font-bold tracking-tighter leading-[1.1] mb-3">
            What&apos;s actually live<br className="hidden sm:block" /> on your domain.
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-md mx-auto">
            15 global resolvers. Email auth audit. TLS inspection. Header analysis. All instant, no account.
          </p>
        </div>

        <form onSubmit={onSubmit} className="max-w-lg mx-auto">
          <div className="relative premium-surface rounded-2xl p-1.5 flex items-center gap-1.5">
            <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none ml-1" />
            <input
              type="text"
              ref={inputRef}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder={tab === "compare" ? "example.com, other.org" : tab === "batch" ? "a.com, b.io, c.net (max 10)" : "example.com"}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="flex-1 h-11 pl-10 pr-3 bg-transparent text-sm font-medium placeholder:text-muted-foreground/40 focus:outline-none rounded-xl"
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-11 px-5 rounded-xl flex items-center gap-2 text-xs font-bold"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Run
            </button>
          </div>
          {submitted && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Inspecting <code className="text-orange-300">{submitted}</code>
            </p>
          )}
        </form>
      </section>

      {/* Tabs */}
      {(submitted || (tab as TabKey) !== "lookup" || tab === "mha") && (
        <section className="container mx-auto px-6">
          <div className="overflow-x-auto -mx-2 px-2 snap-x">
            <div className="flex gap-2 pb-2 min-w-max">
              {TABS.map((t) => {
                const active = t.key === tab;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key);
                      setToolPicked(true);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap border ${active ? 'bg-orange-500/10 text-orange-300 border-orange-500/20 shadow-[0_0_12px_-3px_rgba(255,122,26,0.2)]' : 'bg-white/[0.02] text-muted-foreground/70 border-white/[0.04] hover:bg-white/[0.04] hover:text-foreground hover:border-white/10'}`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Results */}
      <section className="container mx-auto px-6 py-8">
        {/* MHA input */}
        {tab === "mha" && (
          <div className="max-w-5xl mx-auto mb-6">
            <textarea
              value={mhaInput}
              onChange={(e) => setMhaInput(e.target.value)}
              placeholder="Paste full email headers here..."
              className="w-full h-48 premium-surface rounded-xl p-4 font-mono text-xs bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-y border border-white/10"
            />
            <button
              onClick={() => run("mha", "")}
              disabled={!mhaInput.trim() || loading}
              className="btn-primary mt-2 px-5 py-2.5 rounded-xl text-sm flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Analyze headers
            </button>
          </div>
        )}
        {tab === "speedtest" && (
          <div className="max-w-3xl mx-auto">
            <SpeedTestView data={data} />
          </div>
        )}
        {tab === "batch" && (
          <div className="max-w-lg mx-auto mb-6 flex justify-center gap-2">
            {(["whois", "dns"] as const).map((m) => {
              const active = batchMode === m;
              return (
                <button
                  key={m}
                  onClick={() => setBatchMode(m)}
                  className={`px-4 py-2 rounded-lg text-[11px] font-semibold border transition-all ${active ? 'bg-orange-500/10 text-orange-300 border-orange-500/20' : 'bg-white/[0.02] text-muted-foreground/70 border-white/[0.04] hover:text-foreground'}`}
                >
                  {m === "whois" ? "WHOIS facts" : "DNS records"}
                </button>
              );
            })}
          </div>
        )}
        {!submitted && tab === "lookup" && (
          <div className="max-w-5xl mx-auto mb-8">
            <RecentsStrip />
          </div>
        )}
        {!submitted && tab === "lookup" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl mx-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    setToolPicked(true);
                    if (t.key === "speedtest") return; // self-contained, no API call needed
                    if (submitted) {
                      run(t.key, submitted);
                    } else {
                      document.querySelector<HTMLInputElement>('input[placeholder*="example.com"]')?.focus();
                    }
                  }}
                  className="premium-surface premium-card rounded-xl p-3.5 sm:p-4 text-left cursor-pointer"
                >
                  <Icon className="w-4 h-4 text-orange-400 mb-2" />
                  <p className="font-display font-bold text-xs tracking-tight mb-0.5">{t.label}</p>
                  <p className="block line-clamp-2 sm:line-clamp-none text-[11px] text-muted-foreground leading-relaxed">{t.desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {(submitted || tab === "mha" || tab === "speedtest") && error && (
          <div className="max-w-3xl mx-auto p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-200">
            <strong>Error:</strong> {error}
          </div>
        )}

        {(submitted || tab === "mha") && loading && !data && (
          <div className="max-w-3xl mx-auto premium-surface rounded-2xl p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto text-orange-400 animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Running check…</p>
          </div>
        )}

        {(submitted || tab === "mha") && data && (
          <div className="w-full">
            {tab === "lookup" && <LookupView data={data} />}
            {tab === "propagation" && <PropagationView data={data} type={propType} setType={setPropType} />}
            {tab === "email" && <EmailView data={data} />}
            {tab === "tls" && <TlsView data={data} />}
            {tab === "whois" && <WhoisView data={data} />}
            {tab === "headers" && <HeadersView data={data} />}
            {tab === "blacklist" && <BlacklistView data={data} />}
            {tab === "dnssec" && <DnssecView data={data} />}
            {tab === "ping" && <PingView data={data} />}
            {tab === "portcheck" && <PortCheckView data={data} />}
            {tab === "probe" && <ProbeView data={data} />}
            {tab === "traceroute" && <TracerouteView data={data} />}
            {tab === "geoip" && <GeoIPView data={data} />}
            {tab === "mha" && <MHAView data={data} />}
            {tab === "speedtest" && <SpeedTestView data={data} />}
            {tab === "compare" && <CompareView data={data} />}
            {tab === "batch" && <BatchView data={data} mode={batchMode} />}
            <ToolVerdict tab={tab} domain={submitted} data={data} />
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-8 mt-12 border-t border-white/[0.04]">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
          <div className="flex items-center gap-2">
            <div className="ndns-mark w-5 h-5 text-[8px]">N</div>
            <span>Nexus Domain Tools</span>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <a
              href="https://github.com/Oba-SEG/dnstools/issues/new?template=feature_request.yml&labels=enhancement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-300/70 hover:text-orange-300"
            >
              Suggest an improvement
            </a>
            <a href={`${BASE}/privacy`} className="hover:text-orange-300">Privacy</a>
            <a href={`${BASE}/terms`} className="hover:text-orange-300">Terms</a>
            <a href={`${BASE}/refund`} className="hover:text-orange-300">Refunds</a>
            <span>Part of <a href="https://segbytes.co.za" className="text-orange-300/70 hover:text-orange-300">Segbytes</a></span>
          </div>
          <span className="sm:hidden flex items-center gap-3">
            <a href={`${BASE}/privacy`} className="hover:text-orange-300">Privacy</a>
            <a href={`${BASE}/terms`} className="hover:text-orange-300">Terms</a>
            <a href={`${BASE}/refund`} className="hover:text-orange-300">Refunds</a>
            <span>Part of <a href="https://segbytes.co.za" className="text-orange-300/70 hover:text-orange-300">Segbytes</a></span>
          </span>
        </div>
      </footer>

      <CommandPalette onSwitchTab={(k) => { setTab(k as TabKey); setToolPicked(true); }} />
    </main>
  );
}

// ---------- Sub-views ----------

function LookupView({ data }: { data: any }) {
  if (!Array.isArray(data?.results)) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">DNS records</p>
          <h3 className="font-display text-xl font-bold tracking-tight">{data.domain}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{data.elapsed_ms}ms</p>
      </div>
      <div className="grid gap-3">
        {data.results.map((r: any) => (
          <div key={r.type} className="premium-surface premium-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm tracking-tight">{r.type}</span>
                {r.error && <span className="pill pill-fail">{r.error}</span>}
                {!r.error && r.records?.length === 0 && <span className="pill pill-neutral">empty</span>}
              </div>
              <span className="text-xs text-muted-foreground">{r.records?.length || 0} record{r.records?.length === 1 ? '' : 's'}</span>
            </div>
            {r.records?.length > 0 && (
              <div className="space-y-1.5">
                {r.records.map((rec: any, i: number) => (
                  <div key={i} className="font-mono text-xs text-foreground/90 bg-white/[0.02] border border-white/5 rounded-md px-3 py-2 break-all">
                    {typeof rec === "string" ? rec : JSON.stringify(rec)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PropagationView({ data, type, setType }: { data: any; type: string; setType: (t: any) => void }) {
  const types = ["A", "AAAA", "CNAME", "MX", "NS", "TXT"];
  if (!data?.consensus || !data?.resolvers) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-sm font-bold tracking-tight">{data.domain} <span className="text-muted-foreground font-normal">· {data.consensus.agreeing}/{data.consensus.total} agree · {data.elapsed_ms}ms</span></h3>
        </div>
        <div className="flex gap-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${type === t ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:text-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-3">
        {/* Map left - takes most space */}
        <WorldMap resolvers={data.resolvers} />

        {/* Results right - compact scrollable list */}
        <div className="space-y-0.5 max-h-[480px] overflow-y-auto">
          {data.resolvers.map((r: any) => (
            <div key={r.resolver.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!r.ok ? 'bg-red-400' : r.consensus ? 'bg-green-400' : 'bg-yellow-400'}`} />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium">{r.resolver.name}</span>
                <span className="text-[9px] text-muted-foreground ml-1">{r.resolver.country}</span>
                <p className="font-mono text-[10px] text-foreground/60 truncate">
                  {r.ok ? (r.records.length > 0 ? r.records.join(", ") : "—") : r.error}
                </p>
              </div>
              <span className="text-[9px] text-muted-foreground/60 tabular-nums">{r.latency_ms}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmailBlock({ title, present, children, className = "" }: any) {
  return (
    <div className={`premium-surface premium-card rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {present ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
          <span className="font-display font-bold text-sm tracking-tight">{title}</span>
        </div>
        <span className={`pill ${present ? 'pill-pass' : 'pill-neutral'}`}>{present ? 'present' : 'missing'}</span>
      </div>
      {children}
    </div>
  );
}

function EmailView({ data }: { data: any }) {
  if (!data?.spf || !data?.dmarc || !data?.dkim) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">Email security</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.domain}</h3>
        <p className="text-xs text-muted-foreground mt-1">{data.elapsed_ms}ms</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <EmailBlock title="SPF" present={data.spf.present}>
          {data.spf.present && (
            <>
              <p className="font-mono text-xs bg-white/[0.02] border border-white/5 rounded-md px-3 py-2 break-all">{data.spf.record}</p>
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <span>All: <code className="text-foreground">{data.spf.all_qualifier || '—'}</code></span>
                <span>Lookups: <code className={data.spf.rfc7208_lookup_overflow ? 'text-red-300' : 'text-foreground'}>{data.spf.dns_lookups}/10</code></span>
              </div>
            </>
          )}
        </EmailBlock>

        <EmailBlock title="DMARC" present={data.dmarc.present}>
          {data.dmarc.present && (
            <>
              <p className="font-mono text-xs bg-white/[0.02] border border-white/5 rounded-md px-3 py-2 break-all">{data.dmarc.record}</p>
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                <span>Policy: <code className={data.dmarc.enforced ? 'text-emerald-300' : 'text-amber-300'}>{data.dmarc.policy}</code></span>
                <span>Pct: <code className="text-foreground">{data.dmarc.pct}%</code></span>
                {data.dmarc.rua && <span className="text-[10px]">rua: {data.dmarc.rua}</span>}
              </div>
            </>
          )}
        </EmailBlock>

        <EmailBlock title="DKIM" present={data.dkim.found.length > 0}>
          {data.dkim.found.length > 0 ? (
            <div className="space-y-1.5">
              {data.dkim.found.map((d: any) => (
                <div key={d.selector} className="flex items-baseline gap-2 text-xs">
                  <span className="text-muted-foreground">selector:</span>
                  <code className="text-orange-300">{d.selector}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tried {data.dkim.selectors_checked.length} common selectors. None responded.</p>
          )}
        </EmailBlock>

        <EmailBlock title="MX" present={data.mx.present}>
          {data.mx.present && (
            <div className="space-y-1">
              {data.mx.records.map((m: any, i: number) => (
                <div key={i} className="flex items-baseline gap-3 text-xs font-mono">
                  <span className="text-muted-foreground">{m.priority}</span>
                  <span>{m.exchange}</span>
                </div>
              ))}
            </div>
          )}
        </EmailBlock>

        <EmailBlock title="MTA-STS" present={data.mta_sts.present} />
        <EmailBlock title="TLS-RPT" present={data.tls_rpt.present} />
        <EmailBlock title="BIMI" present={data.bimi.present} className="md:col-span-2" />
      </div>
    </div>
  );
}

function TlsView({ data }: { data: any }) {
  if (!data?.host && !data?.error) return null;
  if (data.error) {
    return (
      <div className="premium-surface rounded-xl p-6">
        <p className="text-sm text-red-300">{data.error}</p>
        <p className="text-xs text-muted-foreground mt-2">{data.detail}</p>
      </div>
    );
  }
  const cert = data.certificate;
  const expiryColor = cert.expired ? 'text-red-300' : cert.days_to_expiry < 30 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">TLS / SSL</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.host}:{data.port}</h3>
        <p className="text-xs text-muted-foreground mt-1">{data.peer_address} · {data.protocol} · {data.cipher?.name}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="premium-surface rounded-xl p-5">
          <p className="eyebrow mb-2">Validity</p>
          <p className={`font-display text-2xl font-bold ${expiryColor}`}>
            {cert.expired ? 'Expired' : `${cert.days_to_expiry} days`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">until {new Date(cert.valid_to).toLocaleDateString()}</p>
        </div>
        <div className="premium-surface rounded-xl p-5">
          <p className="eyebrow mb-2">Authorized</p>
          <p className={`font-display text-2xl font-bold ${data.authorized ? 'text-emerald-300' : 'text-red-300'}`}>
            {data.authorized ? 'Yes' : 'No'}
          </p>
          {data.authorization_error && <p className="text-xs text-red-300 mt-1">{data.authorization_error}</p>}
        </div>
        <div className="premium-surface rounded-xl p-5">
          <p className="eyebrow mb-2">Cipher</p>
          <p className="font-mono text-sm">{data.cipher?.name}</p>
          <p className="text-xs text-muted-foreground">{data.cipher?.bits} bit · {data.cipher?.version}</p>
        </div>
        <div className="premium-surface rounded-xl p-5">
          <p className="eyebrow mb-2">ALPN</p>
          <p className="font-mono text-sm">{data.alpn || '—'}</p>
          <p className="text-xs text-muted-foreground">Chain length: {data.chain_length}</p>
        </div>
      </div>

      <div className="premium-surface rounded-xl p-5">
        <p className="eyebrow mb-3">Certificate chain</p>
        <div className="space-y-2">
          {data.chain.map((c: any, i: number) => (
            <div key={i} className="bg-white/[0.02] border border-white/5 rounded-md p-3">
              <p className="font-mono text-xs text-foreground/90 break-all">{c.subject?.CN || JSON.stringify(c.subject)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">issued by {c.issuer?.CN || c.issuer?.O}</p>
            </div>
          ))}
        </div>
      </div>

      {cert.subject_alt_names && (
        <div className="premium-surface rounded-xl p-5">
          <p className="eyebrow mb-2">Subject Alternative Names</p>
          <div className="flex flex-wrap gap-1.5">
            {String(cert.subject_alt_names).split(",").map((s: string) => (
              <span key={s} className="font-mono text-xs px-2 py-0.5 rounded bg-white/[0.04] border border-white/5">{s.trim().replace(/^DNS:/, '')}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WhoisView({ data }: { data: any }) {
  if (!data?.domain && !data?.raw) return null;
  return (
    <div className="space-y-3">
      <div>
        <p className="eyebrow mb-1">WHOIS</p>
        <h3 className="font-display text-lg font-bold tracking-tight">{data.domain}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{data.elapsed_ms}ms</p>
      </div>
      <pre className="premium-surface rounded-xl p-4 font-mono text-[11px] text-foreground/85 whitespace-pre-wrap break-all max-h-[500px] overflow-y-auto leading-relaxed">
        {data.raw || JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function HeadersView({ data }: { data: any }) {
  if (!data?.checks) return null;
  const gradeColor = data.grade === 'A' ? 'text-emerald-300' : data.grade === 'B' ? 'text-emerald-300' : data.grade === 'C' ? 'text-amber-300' : 'text-red-300';
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">HTTP security headers</p>
          <h3 className="font-display text-xl font-bold tracking-tight">{data.domain}</h3>
        </div>
        <div className="text-right">
          <p className={`font-display text-5xl font-bold tracking-tighter ${gradeColor}`}>{data.grade}</p>
          <p className="text-xs text-muted-foreground">{data.score}/100</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.checks.map((c: any) => (
          <div key={c.header} className="premium-surface premium-card rounded-xl p-4 flex items-center gap-3">
            {c.present ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-semibold text-sm tracking-tight">{c.name}</span>
                <span className={`pill pill-${c.importance === 'critical' ? 'fail' : c.importance === 'high' ? 'warn' : 'neutral'}`}>{c.importance}</span>
              </div>
              {c.present && <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">{c.value}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlacklistView({ data }: { data: any }) {
  if (!data?.results_per_ip && !data?.results) return null;
  const groups = data.results_per_ip || (data.results ? [data] : []);
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">DNSBL check</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.domain || data.ip}</h3>
      </div>
      {groups.map((g: any, i: number) => (
        <div key={i} className="premium-surface rounded-xl p-5">
          <p className="font-display font-bold text-sm tracking-tight mb-3">
            {g.ip}
            {' · '}
            <span className={g.listed_count > 0 ? 'text-red-300' : 'text-emerald-300'}>{g.listed_count}/{g.total_checked} listed</span>
          </p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {g.results.map((r: any) => (
              <div key={r.id} className={`flex items-center gap-2 p-2 rounded-md border text-xs ${r.listed ? 'bg-red-500/5 border-red-500/30 text-red-200' : 'bg-white/[0.02] border-white/5 text-muted-foreground'}`}>
                {r.listed ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3 opacity-50" />}
                <span className="flex-1 truncate">{r.name}</span>
                {r.listed && <span className="text-[10px] uppercase tracking-wider">listed</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DnssecView({ data }: { data: any }) {
  if (!data?.domain || data.signed === undefined) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">DNSSEC</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.domain}</h3>
        <p className="text-xs text-muted-foreground mt-1">{data.elapsed_ms}ms</p>
      </div>
      <div className="premium-surface rounded-xl p-6 text-center">
        {data.signed ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="font-display text-xl font-bold tracking-tight">Signed</p>
            <p className="text-xs text-muted-foreground mt-1">DNSKEY at apex + DS at parent zone present</p>
          </>
        ) : (
          <>
            <XCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-display text-xl font-bold tracking-tight">Not signed</p>
            <p className="text-xs text-muted-foreground mt-1">No DNSKEY/DS chain detected</p>
          </>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-1">DNSKEY</p>
          <p className="font-display text-2xl font-bold">{data.dnskey_count}</p>
          <p className="text-xs text-muted-foreground">at zone apex</p>
        </div>
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-1">DS</p>
          <p className="font-display text-2xl font-bold">{data.ds_count}</p>
          <p className="text-xs text-muted-foreground">at parent zone</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground italic text-center max-w-lg mx-auto">
        {data.note}
      </p>
    </div>
  );
}

function PingView({ data }: { data: any }) {
  if (!Array.isArray(data?.samples)) return null;
  const stats = data.stats || {};
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">TCP ping</p>
          <h3 className="font-display text-xl font-bold tracking-tight">{data.target} <span className="text-muted-foreground text-sm">:{data.port}</span></h3>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{data.ip}</p>
        </div>
        <p className="text-xs text-muted-foreground">{data.elapsed_ms}ms</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { k: "Min", v: stats.min, unit: "ms", color: "text-emerald-300" },
          { k: "Avg", v: stats.avg, unit: "ms", color: "text-foreground" },
          { k: "Max", v: stats.max, unit: "ms", color: "text-amber-300" },
          { k: "Loss", v: stats.loss_pct, unit: "%", color: stats.loss_pct === 0 ? "text-emerald-300" : "text-red-300" },
        ].map((s) => (
          <div key={s.k} className="premium-surface premium-card rounded-xl p-5">
            <p className="eyebrow mb-1">{s.k}</p>
            <p className={`font-display text-3xl font-bold tabular-nums ${s.color}`}>
              {s.v ?? "—"}<span className="text-sm text-muted-foreground ml-1">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {data.samples.map((s: any, i: number) => (
          <div key={i} className="premium-surface premium-card rounded-xl p-3 flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${s.ok ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
            <div className="flex-1" />
            <span className="text-sm font-mono tabular-nums">{s.ok ? `${s.ms} ms` : <span className="text-red-300">{s.error}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortCheckView({ data }: { data: any }) {
  if (!Array.isArray(data?.results)) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">Port check</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.target}</h3>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{data.ip}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {data.results.map((r: any) => {
          const status = r.status || "error";
          const cls =
            status === "open" ? "border-emerald-500/30 bg-emerald-500/5" :
            status === "closed" ? "border-white/5 bg-white/[0.02]" :
            status === "filtered" ? "border-amber-500/30 bg-amber-500/5" :
            "border-red-500/30 bg-red-500/5";
          const text =
            status === "open" ? "text-emerald-300" :
            status === "closed" ? "text-muted-foreground" :
            status === "filtered" ? "text-amber-300" :
            "text-red-300";
          return (
            <div key={r.port} className={`rounded-xl border p-4 ${cls}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm tracking-tight">{r.port}</span>
                <span className={`pill pill-${status === "open" ? "pass" : status === "filtered" ? "warn" : "neutral"}`}>{status}</span>
              </div>
              <p className="text-xs text-muted-foreground">{r.name}</p>
              <p className={`text-xs mt-1 font-mono tabular-nums ${text}`}>
                {status === "open" ? `${r.ms} ms` : (r.error || "—")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProbeView({ data }: { data: any }) {
  if (!Array.isArray(data?.chain)) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">HTTP probe</p>
        <h3 className="font-display text-xl font-bold tracking-tight break-all">{data.initial_url}</h3>
        <p className="text-xs text-muted-foreground mt-1">{data.hops} hop{data.hops === 1 ? "" : "s"} · {data.elapsed_ms}ms</p>
      </div>
      {data.chain.map((hop: any, i: number) => (
        <div key={i} className="premium-surface premium-card rounded-xl p-5">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-foreground/90 break-all">{hop.url}</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">via {hop.peer}</p>
            </div>
            <span className={`pill ${hop.status >= 200 && hop.status < 300 ? "pill-pass" : hop.status >= 300 && hop.status < 400 ? "pill-warn" : "pill-fail"}`}>{hop.status} {hop.status_text}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <p className="eyebrow mb-1">DNS</p>
              <p className="font-mono text-sm tabular-nums">{hop.timing.dns_ms} ms</p>
            </div>
            <div>
              <p className="eyebrow mb-1">TTFB</p>
              <p className="font-mono text-sm tabular-nums">{hop.timing.ttfb_ms} ms</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Total</p>
              <p className="font-mono text-sm tabular-nums">{hop.timing.total_ms} ms</p>
            </div>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Headers ({Object.keys(hop.headers).length})</summary>
            <div className="mt-2 space-y-1 font-mono">
              {Object.entries(hop.headers).map(([k, v]) => (
                <div key={k} className="break-all">
                  <span className="text-orange-300">{k}</span>
                  <span className="text-muted-foreground">: </span>
                  <span className="text-foreground/80">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}

function TracerouteView({ data }: { data: any }) {
  if (!Array.isArray(data?.hops)) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">Traceroute</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.target}</h3>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{data.ip} · {data.hop_count} hops · {data.elapsed_ms}ms</p>
      </div>
      <div className="space-y-1.5">
        {data.hops.map((h: any) => (
          <div key={h.hop} className={`premium-surface premium-card rounded-xl p-3 flex items-center gap-3 ${h.timeout ? "opacity-50" : ""}`}>
            <span className="font-display font-bold text-sm tabular-nums w-8 text-muted-foreground">{h.hop}</span>
            <span className={`w-2 h-2 rounded-full ${h.timeout ? "bg-muted" : "bg-orange-400"}`} />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm">{h.timeout ? <span className="text-muted-foreground">* * *</span> : h.ip}</p>
            </div>
            {!h.timeout && h.rtt_ms != null && (
              <span className="text-xs font-mono tabular-nums text-foreground/80">{h.rtt_ms.toFixed(2)} ms</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GeoIPView({ data }: { data: any }) {
  if (!data?.ip) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">GeoIP / ASN</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.target}</h3>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{data.ip}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { k: "Country", v: data.country_name ? `${data.country_name} (${data.country})` : data.country },
          { k: "Region", v: data.region },
          { k: "City", v: data.city },
          { k: "Coordinates", v: data.coords?.lat != null ? `${data.coords.lat}, ${data.coords.lon}` : null },
          { k: "Timezone", v: data.timezone },
          { k: "Metro", v: data.metro || (data.eu ? "European Union" : null) },
        ].map((row) => (
          <div key={row.k} className="premium-surface rounded-xl p-4">
            <p className="eyebrow mb-1">{row.k}</p>
            <p className="text-sm font-medium">{row.v || "—"}</p>
          </div>
        ))}
      </div>
      {data.range && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-1">IP range</p>
          <p className="font-mono text-xs">{data.range[0]} – {data.range[1]}</p>
        </div>
      )}
    </div>
  );
}

function CompareView({ data }: { data: any }) {
  if (!data?.diff) return null;
  const aDom = data.a?.domain || "A";
  const bDom = data.b?.domain || "B";
  const diff = data.diff || {};
  const whoisSelected: [string, any][] = Object.entries(diff.whois || {}).map(([k, v]) => [
    k === "registrar" ? "Registrar" : k === "created" ? "Created" : k === "expires" ? "Expires" : k === "dnssec" ? "DNSSEC" : k === "status" ? "Status" : k === "nameservers" ? "Nameservers" : k,
    v,
  ]);
  const dnsDiffs = Object.entries(diff.dns || {});
  const anyDiff = whoisSelected.some(([, v]) => !v?.same) || dnsDiffs.length > 0;
  const fmt = (v: string) => {
    if (!v) return "—";
    return Array.isArray(v) ? v.join(", ") : String(v);
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
        <div className="premium-surface premium-card rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">A</p>
          <p className="font-display font-bold text-sm truncate text-orange-300">{aDom}</p>
        </div>
        <div className="premium-surface premium-card rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">B</p>
          <p className="font-display font-bold text-sm truncate text-orange-300">{bDom}</p>
        </div>
      </div>

      {!anyDiff && (
        <div className="premium-surface rounded-xl p-4 text-center text-xs text-emerald-300 max-w-3xl mx-auto">
          Identical on everything we compare (WHOIS facts + DNS record sets).
        </div>
      )}

      {whoisSelected.length > 0 && (
        <div className="premium-surface rounded-xl p-4 max-w-3xl mx-auto">
          <p className="eyebrow mb-2">WHOIS</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="text-left py-1.5 pr-3 font-semibold">Field</th>
                <th className="text-left py-1.5 pr-3 font-semibold truncate">{aDom}</th>
                <th className="text-left py-1.5 font-semibold truncate">{bDom}</th>
              </tr>
            </thead>
            <tbody>
              {whoisSelected.map(([k, v]) => (
                <tr key={k} className={`border-b border-white/5 last:border-0 ${!v?.same ? "bg-orange-500/[0.04]" : ""}`}>
                  <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap align-top w-24">
                    {k}
                    {!v?.same && <span className="ml-1.5 text-orange-400">≠</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-foreground break-all">{fmt(v?.a)}</td>
                  <td className="py-1.5 text-foreground break-all">{fmt(v?.b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dnsDiffs.length > 0 && (
        <div className="premium-surface rounded-xl p-4 max-w-3xl mx-auto">
          <p className="eyebrow mb-2">DNS — records only present on one side</p>
          <div className="space-y-2">
            {dnsDiffs.map(([t, v]: [string, any]) => (
              <div key={t} className="rounded-lg border border-white/[0.06] p-2.5">
                <p className="text-[11px] font-bold text-orange-300 mb-1">{t}</p>
                {v?.only_a?.length > 0 && (
                  <p className="text-[11px] break-all"><span className="text-muted-foreground/60">{aDom}: </span><span className="font-mono">{v.only_a.join(" · ")}</span></p>
                )}
                {v?.only_b?.length > 0 && (
                  <p className="text-[11px] break-all mt-0.5"><span className="text-muted-foreground/60">{bDom}: </span><span className="font-mono">{v.only_b.join(" · ")}</span></p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {dnsDiffs.length === 0 && Object.keys(diff.whois || {}).length > 0 && (
        <div className="premium-surface rounded-xl p-4 text-center text-xs text-muted-foreground max-w-3xl mx-auto">
          No differences in A / AAAA / CNAME / NS / MX / TXT / SOA / CAA records.
        </div>
      )}
    </div>
  );
}

function batchExpiryColor(d: string | null) {
  if (!d) return "text-muted-foreground";
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return "text-foreground";
  const days = (t - Date.now()) / 86_400_000;
  if (days < 30) return "text-red-300";
  if (days < 90) return "text-amber-300";
  return "text-foreground";
}

function BatchView({ data, mode }: { data: any; mode: string }) {
  if (!data?.results) return null;
  return (
    <div className="space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Batch · {mode} · {data.results.filter((r: any) => r.ok).length}/{data.count} ok{data.skipped_invalid?.length ? ` · ${data.skipped_invalid.length} skipped` : ""} · {data.elapsed_ms}ms</span>
      </div>
      {data.results.map((r: any) => (
        <div key={r.domain} className="premium-surface rounded-xl p-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="font-display font-bold text-sm truncate">{r.domain}</p>
            {r.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <span className="text-[11px] font-mono text-red-300 shrink-0 flex items-center gap-1 truncate max-w-[55%]"><XCircle className="w-3.5 h-3.5" />{r.error}</span>
            )}
          </div>
          {r.ok && mode === "whois" && r.whois && (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
              <p><span className="text-muted-foreground/60">Registrar: </span>{r.whois.registrar || "—"}</p>
              <p><span className="text-muted-foreground/60">Expires: </span><span className={batchExpiryColor(r.whois.expires)}>{r.whois.expires || "—"}</span></p>
              <p className="sm:col-span-2 truncate"><span className="text-muted-foreground/60">NS: </span>{(r.whois.nameservers || []).join(", ") || "—"}</p>
            </div>
          )}
          {r.ok && mode === "dns" && Array.isArray(r.dns) && (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] font-mono">
              {r.dns.filter((x: any) => (x.records || []).length > 0).map((x: any) => (
                <p key={x.type} className="truncate"><span className="text-orange-300 font-bold not-italic font-sans mr-1">{x.type}</span>{x.records.join(" · ")}</p>
              ))}
              {r.dns.every((x: any) => (x.records || []).length === 0) && (
                <p className="text-muted-foreground/60 font-sans not-italic col-span-2">No records found on any type.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function speedColor(mbps: number | null) {
  if (mbps === null) return "#666";
  if (mbps >= 100) return "#10b981";
  if (mbps >= 50) return "#22c55e";
  if (mbps >= 20) return "#eab308";
  if (mbps >= 5) return "#f97316";
  return "#ef4444";
}

function SpeedGauge({ value, unit }: { value: number | null; unit: string }) {
  const getNeedleAngle = (mbps: number | null) => {
    if (mbps === null) return -135;
    const maxSpeed = 200;
    const ratio = Math.min(mbps / maxSpeed, 1);
    return -135 + ratio * 270;
  };

  const angle = getNeedleAngle(value);
  const color = speedColor(value);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-48 h-28">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1a1a2e" strokeWidth="12" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 56 32" fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
        <path d="M 56 32 A 80 80 0 0 1 100 20" fill="none" stroke="#f97316" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
        <path d="M 100 20 A 80 80 0 0 1 144 32" fill="none" stroke="#eab308" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
        <path d="M 144 32 A 80 80 0 0 1 180 100" fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
        <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${angle}, 100, 100)`} style={{ transition: "transform 0.3s ease-out" }} />
        <circle cx="100" cy="100" r="5" fill={color} />
      </svg>
      <p className="text-3xl font-display font-bold tabular-nums mt-1" style={{ color }}>
        {value !== null ? value.toFixed(1) : "—"}
      </p>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{unit}</p>
    </div>
  );
}

function MHAView({ data }: { data: any }) {
  if (!data?.hops && !data?.summary) return null;
  const authColor = (r: string | null) => !r ? "text-muted-foreground" : r === "pass" ? "text-emerald-300" : r === "fail" ? "text-red-300" : "text-amber-300";
  const authBg = (r: string | null) => !r ? "" : r === "pass" ? "bg-emerald-500/10 border-emerald-500/30" : r === "fail" ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30";
  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-2">Message summary</p>
          <table className="w-full text-xs">
            <tbody>
              {[
                ["From", data.summary.from],
                ["To", data.summary.to],
                ["Subject", data.summary.subject],
                ["Date", data.summary.date],
                ["Message-ID", data.summary.message_id],
                ["Transit time", data.summary.total_delay_str],
                ["Hops", data.summary.total_hops],
              ].filter(([,v]) => v).map(([k, v]) => (
                <tr key={k as string} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap align-top w-28">{k}</td>
                  <td className="py-1.5 text-foreground break-all">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Authentication */}
      {data.auth && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-3">Authentication results</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            {[
              { label: "SPF", data: data.auth.spf },
              { label: "DKIM", data: data.auth.dkim },
              { label: "DMARC", data: data.auth.dmarc },
              { label: "CompAuth", data: data.auth.compauth },
            ].map((a) => (
              <div key={a.label} className={`rounded-lg border p-3 ${authBg(a.data?.result)}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{a.label}</p>
                <p className={`font-display font-bold text-sm ${authColor(a.data?.result)}`}>{a.data?.result || "—"}</p>
              </div>
            ))}
          </div>
          {data.auth.spf?.raw && (
            <details className="text-[11px] mt-2">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw Authentication-Results</summary>
              <pre className="mt-1 font-mono text-[10px] text-foreground/70 whitespace-pre-wrap break-all bg-white/[0.02] rounded p-2 border border-white/5">{data.auth.spf.raw}</pre>
            </details>
          )}
        </div>
      )}

      {/* Hops */}
      {Array.isArray(data.hops) && data.hops.length > 0 && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-3">Message path ({data.hops.length} hops)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-white/10">
                  <th className="pb-2 pr-2 w-6">#</th>
                  <th className="pb-2 pr-2">From</th>
                  <th className="pb-2 pr-2">By</th>
                  <th className="pb-2 pr-2">IP</th>
                  <th className="pb-2 pr-2">Protocol</th>
                  <th className="pb-2 pr-2">Time</th>
                  <th className="pb-2">Delay</th>
                </tr>
              </thead>
              <tbody>
                {data.hops.map((h: any, i: number) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-2 font-bold text-muted-foreground">{h.index}</td>
                    <td className="py-2 pr-2 font-mono truncate max-w-[180px]">{h.from || "—"}</td>
                    <td className="py-2 pr-2 font-mono truncate max-w-[180px]">{h.by || "—"}</td>
                    <td className="py-2 pr-2 font-mono">{h.ip || "—"}</td>
                    <td className="py-2 pr-2">{h.protocol || "—"}</td>
                    <td className="py-2 pr-2 text-muted-foreground whitespace-nowrap">{h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : "—"}</td>
                    <td className="py-2">
                      {h.delay_str ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${h.delay_ms > 30000 ? "bg-red-500/15 text-red-300" : h.delay_ms > 5000 ? "bg-amber-500/15 text-amber-300" : h.delay_ms < 0 ? "bg-blue-500/15 text-blue-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                          {h.delay_str}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="text-[11px] mt-3">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw Received headers</summary>
            <div className="mt-2 space-y-2">
              {data.hops.map((h: any, i: number) => (
                <pre key={i} className="font-mono text-[10px] text-foreground/60 whitespace-pre-wrap break-all bg-white/[0.02] rounded p-2 border border-white/5">{h.raw}</pre>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Key headers */}
      {data.key_headers && Object.keys(data.key_headers).length > 0 && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-2">Key headers</p>
          <table className="w-full text-[11px]">
            <tbody>
              {Object.entries(data.key_headers).map(([k, v]) => (
                <tr key={k} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-3 text-orange-300 font-mono whitespace-nowrap align-top">{k}</td>
                  <td className="py-1.5 text-foreground/80 break-all font-mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Anti-spam */}
      {data.antispam && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-2">Anti-spam analysis</p>
          {(data.antispam._scl != null || data.antispam._bcl != null) && (
            <div className="flex gap-4 mb-3">
              {data.antispam._scl != null && (
                <div className={`rounded-lg border p-3 ${data.antispam._scl >= 5 ? "bg-red-500/10 border-red-500/30" : data.antispam._scl >= 3 ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">SCL</p>
                  <p className={`font-display font-bold text-lg ${data.antispam._scl >= 5 ? "text-red-300" : data.antispam._scl >= 3 ? "text-amber-300" : "text-emerald-300"}`}>{data.antispam._scl}</p>
                  <p className="text-[9px] text-muted-foreground">{data.antispam._scl === 0 ? "Not spam" : data.antispam._scl <= 1 ? "Low risk" : data.antispam._scl <= 4 ? "Medium" : "High / Spam"}</p>
                </div>
              )}
              {data.antispam._bcl != null && (
                <div className={`rounded-lg border p-3 ${data.antispam._bcl >= 5 ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">BCL</p>
                  <p className={`font-display font-bold text-lg ${data.antispam._bcl >= 5 ? "text-amber-300" : "text-emerald-300"}`}>{data.antispam._bcl}</p>
                  <p className="text-[9px] text-muted-foreground">{data.antispam._bcl === 0 ? "Not bulk" : data.antispam._bcl <= 3 ? "Low bulk" : "Bulk sender"}</p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-1.5 font-mono text-[10px]">
            {Object.entries(data.antispam).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
              <div key={k} className="break-all bg-white/[0.02] rounded p-2 border border-white/5">
                <span className="text-orange-300 font-bold">{k}</span>
                <br />
                 <span className="text-foreground/70">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeedTestView({ data }: { data: any }) {
  const [phase, setPhase] = useState<"idle" | "ping" | "download" | "upload" | "done">("idle");
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [jitterMs, setJitterMs] = useState<number | null>(null);
  const [downloadMbps, setDownloadMbps] = useState<number | null>(null);
  const [uploadMbps, setUploadMbps] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>("jnb");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const API_URL = API;

  useEffect(() => {
    fetch(`${API_URL}/speedtest/servers`).then(r => r.json()).then(d => setServers(d.servers || [])).catch(() => {});
  }, []);

  const currentServer = servers.find(s => s.id === selectedServer) || servers[0];

  const measurePing = async (): Promise<number> => {
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await fetch(`${API_URL}/speedtest/ping?t=${Date.now()}`, { cache: "no-store" });
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const jitter = Math.max(...samples) - Math.min(...samples);
    setJitterMs(Math.round(jitter * 10) / 10);
    return median;
  };

  const measureDownload = async (): Promise<number> => {
    const sizes = [1024 * 100, 1024 * 500, 1024 * 1024, 1024 * 1024 * 5, 1024 * 1024 * 10, 1024 * 1024 * 25];
    let totalBytes = 0;
    let totalMs = 0;
    for (let i = 0; i < sizes.length; i++) {
      const bytes = sizes[i];
      setProgress(((i + 1) / sizes.length) * 100);
      const start = performance.now();
      const res = await fetch(`${API_URL}/speedtest/download?bytes=${bytes}`, { cache: "no-store" });
      await res.arrayBuffer();
      const elapsed = performance.now() - start;
      totalBytes += bytes;
      totalMs += elapsed;
    }
    const mbps = (totalBytes * 8) / (totalMs / 1000) / 1_000_000;
    return Math.round(mbps * 10) / 10;
  };

  const measureUpload = async (): Promise<number> => {
    const sizes = [1024 * 100, 1024 * 500, 1024 * 1024, 1024 * 1024 * 5, 1024 * 1024 * 10];
    let totalBytes = 0;
    let totalMs = 0;
    for (let i = 0; i < sizes.length; i++) {
      const bytes = sizes[i];
      setProgress(((i + 1) / sizes.length) * 100);
      const chunks: Uint8Array[] = [];
      let remaining = bytes;
      while (remaining > 0) {
        const chunkSize = Math.min(remaining, 65536);
        const chunk = new Uint8Array(chunkSize);
        crypto.getRandomValues(chunk);
        chunks.push(chunk);
        remaining -= chunkSize;
      }
      const payload = chunks.length === 1 ? chunks[0] : (() => {
        const merged = new Uint8Array(bytes);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.length; }
        return merged;
      })();
      const start = performance.now();
      await fetch(`${API_URL}/speedtest/upload`, { method: "POST", body: payload, cache: "no-store" });
      const elapsed = performance.now() - start;
      totalBytes += bytes;
      totalMs += elapsed;
    }
    const mbps = (totalBytes * 8) / (totalMs / 1000) / 1_000_000;
    return Math.round(mbps * 10) / 10;
  };

  const saveResult = async (ping: number, jitter: number, dl: number, ul: number) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_URL}/speedtest/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pingMs: ping,
          jitterMs: jitter,
          downloadMbps: dl,
          uploadMbps: ul,
          serverId: selectedServer,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const d = await res.json();
      if (d.shareUrl) {
        const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
        const BASE = STATIC_EXPORT ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "/dnstools") : "";
        let path = d.shareUrl as string;
        if (STATIC_EXPORT && path.startsWith("/speedtest/")) {
          const sid = path.slice("/speedtest/".length).replace(/\/$/, "");
          path = `/speedtest/_/?id=${encodeURIComponent(sid)}`;
        }
        setShareUrl(window.location.origin + BASE + path);
      }
    } catch (e: any) {
      console.error("Speed test save failed:", e);
      setSaveError(e?.message || "Failed to save result");
    }
    setSaving(false);
  };

  const runTest = async () => {
    setPhase("ping");
    setProgress(0);
    setPingMs(null);
    setJitterMs(null);
    setDownloadMbps(null);
    setUploadMbps(null);
    setShareUrl(null);
    setSaveError(null);
    setError(null);
    try {
      const ping = await measurePing();
      setPingMs(Math.round(ping * 10) / 10);

      setPhase("download");
      setProgress(0);
      const dl = await measureDownload();
      setDownloadMbps(dl);

      setPhase("upload");
      setProgress(0);
      const ul = await measureUpload();
      setUploadMbps(ul);

      setPhase("done");
      saveResult(ping, jitterMs ?? 0, dl, ul);
    } catch (e: any) {
      setError(e?.message || "Test failed");
      setPhase("idle");
    }
  };

  const formatSpeed = (mbps: number | null) => {
    if (mbps === null) return "—";
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
    return `${mbps.toFixed(1)} Mbps`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">Speed test</p>
          <h3 className="font-display text-xl font-bold tracking-tight">
            {currentServer?.name || "NexusDNS"} — {currentServer?.location || "Server"}
          </h3>
        </div>
        {phase !== "idle" && phase !== "done" && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
            <span className="text-xs text-muted-foreground capitalize">{phase}…</span>
          </div>
        )}
      </div>

      {/* Server selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Server:</label>
        <div className="flex gap-1.5 flex-wrap">
          {servers.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedServer(s.id)}
              disabled={phase !== "idle"}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                selectedServer === s.id
                  ? "bg-orange-500/10 text-orange-300 border-orange-500/20"
                  : "bg-white/[0.02] text-muted-foreground/70 border-white/[0.04] hover:bg-white/[0.04] hover:text-foreground"
              } disabled:opacity-50`}
            >
              {s.location}
            </button>
          ))}
        </div>
      </div>

      {/* Main gauge area */}
      <div className="premium-surface premium-card rounded-2xl p-8">
        <div className="flex flex-col items-center">
          {phase === "idle" && !error && (
            <>
              <p className="text-sm text-muted-foreground mb-6">Test your internet speed against our server</p>
              <button
                onClick={runTest}
                className="w-20 h-20 rounded-full bg-orange-500 hover:bg-orange-400 text-white font-display font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_-5px_rgba(249,115,22,0.4)]"
              >
                GO
              </button>
            </>
          )}

          {phase !== "idle" && (
            <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
              <SpeedGauge value={pingMs} unit="ms" />
              <SpeedGauge value={downloadMbps} unit="Mbps" />
              <SpeedGauge value={uploadMbps} unit="Mbps" />
            </div>
          )}

          {phase !== "idle" && phase !== "done" && (
            <div className="w-full max-w-md mt-6">
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results summary */}
      {phase === "done" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="premium-surface premium-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Ping</p>
              <p className="font-display text-xl font-bold" style={{ color: pingMs !== null && pingMs < 30 ? "#10b981" : pingMs !== null && pingMs < 60 ? "#eab308" : "#f97316" }}>
                {pingMs !== null ? `${pingMs.toFixed(1)}ms` : "—"}
              </p>
            </div>
            <div className="premium-surface premium-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Jitter</p>
              <p className="font-display text-xl font-bold" style={{ color: jitterMs !== null && jitterMs < 10 ? "#10b981" : jitterMs !== null && jitterMs < 30 ? "#eab308" : "#f97316" }}>
                {jitterMs !== null ? `${jitterMs.toFixed(1)}ms` : "—"}
              </p>
            </div>
            <div className="premium-surface premium-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Download</p>
              <p className="font-display text-xl font-bold" style={{ color: speedColor(downloadMbps) }}>
                {formatSpeed(downloadMbps)}
              </p>
            </div>
            <div className="premium-surface premium-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Upload</p>
              <p className="font-display text-xl font-bold" style={{ color: speedColor(uploadMbps) }}>
                {formatSpeed(uploadMbps)}
              </p>
            </div>
          </div>

          {/* Share link */}
          {shareUrl && (
            <div className="premium-surface rounded-xl p-4 flex items-center gap-3">
              <LinkIcon className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Share this result</p>
                <p className="text-sm font-mono text-foreground/80 truncate">{shareUrl}</p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(shareUrl)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-orange-500/10 text-orange-300 border border-orange-500/20 hover:bg-orange-500/20 transition-all shrink-0"
              >
                Copy
              </button>
            </div>
          )}
          {saving && <p className="text-[11px] text-muted-foreground text-center">Saving result…</p>}
          {saveError && <p className="text-[11px] text-red-400 text-center">{saveError}</p>}
        </>
      )}

      {error && (
        <div className="premium-surface rounded-xl p-4 border border-red-500/30 bg-red-500/10 text-sm text-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {phase === "done" && (
        <button onClick={runTest} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold">
          Test Again
        </button>
      )}
    </div>
  );
}
