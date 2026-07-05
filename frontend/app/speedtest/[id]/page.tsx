"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, LinkIcon, Globe } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api";

export default function SpeedTestResultPage() {
  const params = useParams();
  const id = params?.id as string;
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/speedtest/results/${id}`)
      .then(r => {
        if (!r.ok) throw new Error("Result not found or expired");
        return r.json();
      })
      .then(setResult)
      .catch(e => setError(e?.message || "Failed to load result"))
      .finally(() => setLoading(false));
  }, [id]);

  const formatSpeed = (mbps: number) => {
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
    return `${mbps.toFixed(1)} Mbps`;
  };

  const getSpeedColor = (mbps: number) => {
    if (mbps >= 100) return "#10b981";
    if (mbps >= 50) return "#22c55e";
    if (mbps >= 20) return "#eab308";
    if (mbps >= 5) return "#f97316";
    return "#ef4444";
  };

  const getNeedleAngle = (mbps: number) => {
    const maxSpeed = 200;
    const ratio = Math.min(mbps / maxSpeed, 1);
    return -135 + ratio * 270;
  };

  const Gauge = ({ value, label, unit }: { value: number; label: string; unit: string }) => {
    const angle = getNeedleAngle(value);
    const color = getSpeedColor(value);
    return (
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 200 120" className="w-48 h-28">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1a1a2e" strokeWidth="12" strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 56 32" fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 56 32 A 80 80 0 0 1 100 20" fill="none" stroke="#f97316" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 100 20 A 80 80 0 0 1 144 32" fill="none" stroke="#eab308" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 144 32 A 80 80 0 0 1 180 100" fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${angle}, 100, 100)`} />
          <circle cx="100" cy="100" r="5" fill={color} />
        </svg>
        <p className="text-3xl font-display font-bold tabular-nums mt-1" style={{ color }}>{value.toFixed(1)}</p>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{unit}</p>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#060810]">
      <header className="border-b border-white/[0.04] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3.5 flex items-center gap-2.5">
          <div className="ndns-mark w-8 h-8 text-[12px]">N</div>
          <h1 className="text-[14px] font-display font-bold tracking-tight text-foreground/90">Nexus Domain Tools</h1>
          <a href="/" className="ml-auto text-[11px] text-orange-400 hover:text-orange-300 transition-colors">← Run new test</a>
        </div>
      </header>

      <section className="container mx-auto px-6 py-12 max-w-3xl">
        {loading && (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 mx-auto text-orange-400 animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading result…</p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-sm text-red-300 mb-4">{error}</p>
            <a href="/" className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-block">Run a new test</a>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-1">Speed test result</p>
              <h2 className="font-display text-2xl font-bold tracking-tight">Shared Result</h2>
            </div>

            {/* Gauges */}
            <div className="premium-surface premium-card rounded-2xl p-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12">
                <Gauge value={result.pingMs} label="Ping" unit="ms" />
                <Gauge value={result.downloadMbps} label="Download" unit="Mbps" />
                <Gauge value={result.uploadMbps} label="Upload" unit="Mbps" />
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="premium-surface premium-card rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Ping</p>
                <p className="font-display text-xl font-bold" style={{ color: result.pingMs < 30 ? "#10b981" : result.pingMs < 60 ? "#eab308" : "#f97316" }}>
                  {result.pingMs.toFixed(1)}ms
                </p>
              </div>
              <div className="premium-surface premium-card rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Jitter</p>
                <p className="font-display text-xl font-bold" style={{ color: result.jitterMs < 10 ? "#10b981" : result.jitterMs < 30 ? "#eab308" : "#f97316" }}>
                  {result.jitterMs.toFixed(1)}ms
                </p>
              </div>
              <div className="premium-surface premium-card rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Download</p>
                <p className="font-display text-xl font-bold" style={{ color: getSpeedColor(result.downloadMbps) }}>
                  {formatSpeed(result.downloadMbps)}
                </p>
              </div>
              <div className="premium-surface premium-card rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Upload</p>
                <p className="font-display text-xl font-bold" style={{ color: getSpeedColor(result.uploadMbps) }}>
                  {formatSpeed(result.uploadMbps)}
                </p>
              </div>
            </div>

            {/* Meta */}
            <div className="premium-surface rounded-xl p-4 space-y-2 text-[11px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Server</span>
                <span className="text-foreground/70">{result.serverId}</span>
              </div>
              <div className="flex justify-between">
                <span>Tested</span>
                <span className="text-foreground/70">{new Date(result.created).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Link</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/70 font-mono">{window.location.href}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(window.location.href)}
                    className="text-orange-400 hover:text-orange-300"
                  >
                    <LinkIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center">
              <a href="/" className="btn-primary px-6 py-2.5 rounded-xl text-sm inline-block">
                Run new test
              </a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}