"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search, Globe, Mail, ShieldCheck, Server, Map, FileSearch, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Lock, ChevronRight, Network, Radio, Clock,
} from "lucide-react";
import { WorldMap } from "@/components/world-map";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api";

type TabKey = "lookup" | "propagation" | "email" | "tls" | "whois" | "headers" | "blacklist" | "dnssec" | "ping" | "portcheck" | "probe" | "traceroute" | "geoip" | "mha";

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
];

export default function Home() {
  const [tab, setTab] = useState<TabKey>("lookup");
  const [domain, setDomain] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propType, setPropType] = useState<"A" | "AAAA" | "CNAME" | "MX" | "NS" | "TXT">("A");
  const [mhaInput, setMhaInput] = useState("");

  const run = async (which: TabKey, target: string) => {
    if (!target && which !== "mha") return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      if (which === "mha") {
        const res = await fetch(`${API}/mha`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers: mhaInput }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
        return;
      }
      const params = new URLSearchParams();
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
      const res = await fetch(`${API}/${which}?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      setData(body);
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // Re-run when tab or propType changes
  useEffect(() => {
    if (submitted && tab !== "mha") {
      setData(null);
      run(tab, submitted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, propType]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    if (!cleaned) return;
    setSubmitted(cleaned);
    run(tab, cleaned);
  };

  return (
    <main className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-white/5 bg-background/70 backdrop-blur-2xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="ndns-mark w-9 h-9 text-[13px]">N</div>
            <div className="leading-tight">
              <h1 className="text-[15px] font-display font-bold tracking-tight">Nexus Domain Tools</h1>
            </div>
          </div>
          <a
            href="https://brandprotection.segbytes.co.za"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Brand Protection <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-12 pb-8">
        <div className="text-center max-w-2xl mx-auto mb-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tighter mb-3">
            What's actually live on your domain.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Resolve DNS records across 15 global resolvers, audit email security posture, inspect TLS certificates, and read WHOIS — without an account.
          </p>
        </div>

        <form onSubmit={onSubmit} className="max-w-2xl mx-auto">
          <div className="relative premium-surface premium-card rounded-2xl p-2 flex items-center gap-2">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="flex-1 h-12 pl-12 pr-3 bg-transparent text-base font-medium placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!domain.trim() || loading}
              className="btn-primary h-12 px-6 rounded-xl flex items-center gap-2 text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Run check
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
      {(submitted || tab === "mha") && (
        <section className="container mx-auto px-6">
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="flex gap-2 pb-2 min-w-max">
              {TABS.map((t) => {
                const active = t.key === tab;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${active ? 'bg-orange-500/10 text-orange-300 border-orange-500/30' : 'bg-white/[0.02] text-muted-foreground border-white/5 hover:bg-white/[0.04] hover:text-foreground'}`}
                  >
                    <Icon className="w-4 h-4" /> {t.label}
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
        {!submitted && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl mx-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="premium-surface premium-card rounded-xl p-4 text-left cursor-pointer"
                >
                  <Icon className="w-4 h-4 text-orange-400 mb-2" />
                  <p className="font-display font-bold text-xs tracking-tight mb-0.5">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{t.desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {(submitted || tab === "mha") && error && (
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
          <div className="max-w-5xl mx-auto">
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
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-10 mt-16 border-t border-white/5">
        <div className="text-center text-xs text-muted-foreground">
          <p className="font-display font-semibold text-foreground mb-1">Nexus Domain Tools</p>
          <p>Free public lookup tool · No account required · No data stored.</p>
          <p className="mt-2">Part of the <a href="https://segbytes.co.za" className="text-orange-300 hover:text-orange-200">Segbytes</a> family.</p>
        </div>
      </footer>
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
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">Propagation</p>
          <h3 className="font-display text-lg font-bold tracking-tight">{data.domain}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {data.consensus.agreeing}/{data.consensus.total} resolvers agree · {data.elapsed_ms}ms
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ${type === t ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'bg-white/[0.03] text-muted-foreground border border-white/5 hover:text-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-3">
        {/* Results left */}
        <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
          {data.resolvers.map((r: any) => (
            <div key={r.resolver.id} className="premium-surface premium-card rounded-lg p-2.5 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${!r.ok ? 'bg-red-400' : r.consensus ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display font-semibold text-xs tracking-tight">{r.resolver.name}</span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{r.resolver.city}, {r.resolver.country}</span>
                </div>
                <div className="font-mono text-[11px] text-foreground/80 truncate">
                  {r.ok ? (r.records.length > 0 ? r.records.join(", ") : "—") : <span className="text-red-300">{r.error}</span>}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{r.latency_ms}ms</span>
            </div>
          ))}
        </div>

        {/* Map right */}
        <WorldMap resolvers={data.resolvers} />
      </div>
    </div>
  );
}

function EmailView({ data }: { data: any }) {
  if (!data?.spf || !data?.dmarc || !data?.dkim) return null;
  const Block = ({ title, present, children, className = "" }: any) => (
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

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">Email security</p>
        <h3 className="font-display text-xl font-bold tracking-tight">{data.domain}</h3>
        <p className="text-xs text-muted-foreground mt-1">{data.elapsed_ms}ms</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Block title="SPF" present={data.spf.present}>
          {data.spf.present && (
            <>
              <p className="font-mono text-xs bg-white/[0.02] border border-white/5 rounded-md px-3 py-2 break-all">{data.spf.record}</p>
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <span>All: <code className="text-foreground">{data.spf.all_qualifier || '—'}</code></span>
                <span>Lookups: <code className={data.spf.rfc7208_lookup_overflow ? 'text-red-300' : 'text-foreground'}>{data.spf.dns_lookups}/10</code></span>
              </div>
            </>
          )}
        </Block>

        <Block title="DMARC" present={data.dmarc.present}>
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
        </Block>

        <Block title="DKIM" present={data.dkim.found.length > 0}>
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
        </Block>

        <Block title="MX" present={data.mx.present}>
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
        </Block>

        <Block title="MTA-STS" present={data.mta_sts.present} />
        <Block title="TLS-RPT" present={data.tls_rpt.present} />
        <Block title="BIMI" present={data.bimi.present} className="md:col-span-2" />
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

function MHAView({ data }: { data: any }) {
  if (!data?.hops && !data?.summary) return null;
  const authColor = (r: string | null) => !r ? "text-muted-foreground" : r === "pass" ? "text-emerald-300" : r === "fail" ? "text-red-300" : "text-amber-300";
  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-2">Summary</p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {data.summary.from && <div><span className="text-muted-foreground">From:</span> <span className="text-foreground break-all">{data.summary.from}</span></div>}
            {data.summary.to && <div><span className="text-muted-foreground">To:</span> <span className="text-foreground break-all">{data.summary.to}</span></div>}
            {data.summary.subject && <div className="sm:col-span-2"><span className="text-muted-foreground">Subject:</span> <span className="text-foreground">{data.summary.subject}</span></div>}
            {data.summary.date && <div><span className="text-muted-foreground">Date:</span> <span className="text-foreground">{data.summary.date}</span></div>}
            {data.summary.total_delay_str && <div><span className="text-muted-foreground">Transit time:</span> <span className="text-foreground">{data.summary.total_delay_str}</span></div>}
          </div>
        </div>
      )}

      {/* Auth */}
      {data.auth && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-2">Authentication</p>
          <div className="flex gap-4 text-xs flex-wrap">
            <span>SPF: <strong className={authColor(data.auth.spf?.result)}>{data.auth.spf?.result || "—"}</strong></span>
            <span>DKIM: <strong className={authColor(data.auth.dkim?.result)}>{data.auth.dkim?.result || "—"}</strong></span>
            <span>DMARC: <strong className={authColor(data.auth.dmarc?.result)}>{data.auth.dmarc?.result || "—"}</strong></span>
            {data.auth.arc && <span>ARC: <strong className="text-foreground">{data.auth.arc.count} header(s)</strong></span>}
          </div>
        </div>
      )}

      {/* Hops */}
      {Array.isArray(data.hops) && data.hops.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Message path ({data.hops.length} hops)</p>
          <div className="space-y-1">
            {data.hops.map((h: any, i: number) => (
              <div key={i} className="premium-surface rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-display font-bold text-muted-foreground w-5">{h.index}</span>
                  <span className="font-mono text-foreground/90 flex-1 truncate">{h.by || h.from || "unknown"}</span>
                  {h.delay_str && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${h.delay_ms > 30000 ? "bg-red-500/15 text-red-300" : h.delay_ms > 5000 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                      +{h.delay_str}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground ml-7 flex-wrap">
                  {h.from && <span>from: {h.from}</span>}
                  {h.ip && <span>ip: {h.ip}</span>}
                  {h.protocol && <span>with: {h.protocol}</span>}
                  {h.date_str && <span>{h.date_str}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anti-spam */}
      {data.antispam && (
        <div className="premium-surface rounded-xl p-4">
          <p className="eyebrow mb-2">Anti-spam verdicts</p>
          <div className="space-y-1 font-mono text-[11px]">
            {Object.entries(data.antispam).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
              <div key={k} className="break-all">
                <span className="text-orange-300">{k}</span>
                <span className="text-muted-foreground">: </span>
                <span className="text-foreground/80">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
