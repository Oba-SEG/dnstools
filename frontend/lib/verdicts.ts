export type Level = "ok" | "warn" | "bad" | "info";

export interface Verdict {
  level: Level;
  headline: string;
  detail?: string;
}

const LEVEL_ORDER: Level[] = ["ok", "info", "warn", "bad"];

export function worstLevel(levels: Level[]): Level {
  let w: Level = "info";
  for (const l of levels) {
    if (LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(w)) w = l;
  }
  return w;
}

export function cleanDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

export function isDomainish(s: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function daysUntil(dateish: string): number | null {
  const s = String(dateish).trim();
  const t = Date.parse(s);
  if (!isNaN(t)) return Math.floor((t - Date.now()) / 86_400_000);
  const m = /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/.exec(s);
  if (m) {
    const mm = MONTHS[m[2].toLowerCase()];
    if (mm !== undefined) {
      return Math.floor((Date.UTC(+m[3], mm, +m[1]) - Date.now()) / 86_400_000);
    }
  }
  return null;
}

function relDays(days: number): string {
  if (days < 0) return `${-days}d ago`;
  return `${days}d`;
}

export function whoisVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "Registration unavailable" };
  const exp = d.expires ? daysUntil(String(d.expires)) : null;
  const registrar = d.registrar ? String(d.registrar) : null;
  const detail = registrar ? `Registrar: ${registrar}` : undefined;
  if (exp === null) {
    return { level: "info", headline: "Expiry unknown", detail };
  }
  if (exp < 0) return { level: "bad", headline: `Expired ${relDays(exp)}`, detail };
  if (exp <= 30) return { level: "warn", headline: `Expires in ${relDays(exp)}`, detail };
  return { level: "ok", headline: `Expires in ${relDays(exp)}`, detail };
}

export function emailVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "Email audit unavailable" };
  const parts: string[] = [];
  const levels: Level[] = [];

  const spf = d.spf;
  if (!spf?.present) { levels.push("bad"); parts.push("no SPF"); }
  else if (spf.rfc7208_lookup_overflow) { levels.push("warn"); parts.push("SPF lookup overflow"); }
  else { levels.push("ok"); parts.push("SPF ok"); }

  const dmarc = d.dmarc;
  if (!dmarc?.present) { levels.push("bad"); parts.push("no DMARC"); }
  else if (dmarc.policy === "reject" || dmarc.policy === "quarantine") { levels.push("ok"); parts.push(`DMARC ${dmarc.policy}`); }
  else { levels.push("warn"); parts.push("DMARC monitor only"); }

  const dkimFound = Array.isArray(d.dkim?.found) ? d.dkim.found.length : 0;
  if (dkimFound > 0) { levels.push("ok"); parts.push(`DKIM ×${dkimFound}`); }
  else { levels.push("warn"); parts.push("no DKIM selectors"); }

  if (d.mta_sts?.present) parts.push("MTA-STS");
  if (d.tls_rpt?.present) parts.push("TLS-RPT");

  return { level: worstLevel(levels), headline: parts.join(" · "), detail: !d.mx?.present ? "No MX records — domain receives no mail" : undefined };
}

export function dnssecVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "DNSSEC check unavailable" };
  if (d.signed) return { level: "ok", headline: "Zone signed", detail: `${d.dnskey_count ?? d.dnskey_count} DNSKEY · ${d.ds_count} DS at parent` };
  return { level: "warn", headline: "Not DNSSEC-signed", detail: "Chain of trust absent — spoofable responses" };
}

export function tlsVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "TLS unavailable", detail: typeof d?.error === "string" ? d.error : undefined };
  const cert = d.certificate || {};
  const issuer = cert.issuer?.CN || cert.issuer?.O || null;
  const cipher = d.cipher ? `${d.cipher.name} · ${d.protocol}` : d.protocol;
  const detail = [issuer ? `Issuer: ${issuer}` : null, cipher].filter(Boolean).join(" · ") || undefined;
  if (!d.authorized) {
    return { level: "bad", headline: "Certificate not trusted", detail: d.authorization_error || detail };
  }
  if (cert.expired) return { level: "bad", headline: "Certificate expired", detail };
  if (cert.not_yet_valid) return { level: "bad", headline: "Certificate not yet valid", detail };
  const days = typeof cert.days_to_expiry === "number" ? cert.days_to_expiry : null;
  if (days !== null && days <= 15) return { level: "warn", headline: `Expires in ${relDays(days)}`, detail };
  if (days !== null) return { level: "ok", headline: `Valid, ${relDays(days)} left`, detail };
  return { level: "ok", headline: "Valid certificate", detail };
}

export function blacklistVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "Blacklist check unavailable" };
  const listed = d.listed_count ?? 0;
  const total = d.total_checked ?? 0;
  if (listed === 0) return { level: "ok", headline: `Clean across ${total} DNSBLs` };
  const names = (d.results || []).filter((r: any) => r.listed).map((r: any) => r.name).slice(0, 2).join(", ");
  return { level: "bad", headline: `Listed on ${listed}/${total}`, detail: names };
}

export function headersVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "Header audit unavailable" };
  const grade = d.grade ?? "?";
  const level: Level = grade === "A" || grade === "B" ? "ok" : grade === "F" ? "bad" : "warn";
  const missing = (d.checks || []).filter((c: any) => c.present === false).map((c: any) => c.label || c.name);
  const detail = missing.length ? `Missing: ${missing.slice(0, 3).join(", ")}` : `Score ${d.score}/100`;
  return { level, headline: `Security headers: ${grade}`, detail };
}

export function dnsVerdict(d: any): Verdict {
  if (!d || d.error) return { level: "info", headline: "DNS unavailable" };
  const byType: Record<string, any[]> = {};
  for (const r of d.results || []) {
    if (r && !r.error) byType[r.type] = r.records || [];
  }
  const a = (byType.A || []).length;
  const aaaa = (byType.AAAA || []).length;
  const mx = (byType.MX || []).length;
  const ns = (byType.NS || []).length;
  const parts = [`A ×${a}`, `AAAA ×${aaaa}`, `MX ×${mx}`, `NS ×${ns}`];
  const levels: Level[] = [];
  if (a === 0 && aaaa === 0) levels.push("warn");
  if (ns === 0) levels.push("bad");
  return { level: worstLevel(levels), headline: parts.join(" · "), detail: (byType.NS || []).slice(0, 2).join(" ") };
}
