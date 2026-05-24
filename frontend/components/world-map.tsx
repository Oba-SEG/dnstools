"use client";

// Equirectangular projection: lon/lat → percentage position
// viewBox is 1000x500, mapping -180..180 → 0..100%, 90..-90 → 0..100%
const toX = (lon: number) => ((lon + 180) / 360) * 100;
const toY = (lat: number) => ((90 - lat) / 180) * 100;

type ResolverResult = {
  resolver: {
    id: string;
    name: string;
    ip: string;
    city: string;
    country: string;
    lat: number;
    lon: number;
  };
  ok: boolean;
  records?: string[];
  error?: string;
  latency_ms?: number;
  consensus?: boolean;
};

interface Props {
  resolvers: ResolverResult[] | null;
  loading?: boolean;
}

export function WorldMap({ resolvers, loading }: Props) {
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-white/[0.06]"
      style={{
        height: "calc(100vh - 520px)",
        minHeight: "300px",
        background: "#080a12 url(/world.svg) center center / contain no-repeat",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 16px 48px -12px rgba(0,0,0,0.5)",
      }}
    >
      {/* Dots */}
      {(resolvers || []).map((r) => {
        const color = !r.ok ? "#f87171" : r.consensus ? "#4ade80" : "#facc15";
        const x = toX(r.resolver.lon);
        const y = toY(r.resolver.lat);
        return (
          <div
            key={r.resolver.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${x}%`, top: `${y}%` }}
            title={`${r.resolver.name} · ${r.resolver.city}, ${r.resolver.country}\n${r.resolver.ip}\n${r.ok ? r.records?.join(", ") || "—" : r.error}`}
          >
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ width: 20, height: 20, marginLeft: -10, marginTop: -10, background: color, opacity: 0.15 }}
            />
            <span
              className="block rounded-full"
              style={{ width: 10, height: 10, background: color, boxShadow: `0 0 6px ${color}` }}
            />
          </div>
        );
      })}

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
          <p className="text-[11px] text-white/50">Querying resolvers…</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-3 text-[9px] uppercase tracking-widest text-white/50 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded z-10">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> agree</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> differ</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> error</span>
      </div>
    </div>
  );
}
