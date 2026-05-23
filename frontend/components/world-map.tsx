"use client";

import { useEffect, useRef, useState } from "react";
import MapLibreGL from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Resolver = {
  id: string;
  name: string;
  ip: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
};
type ResolverResult = {
  resolver: Resolver;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const markersRef = useRef<MapLibreGL.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreGL.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [20, 20],
      zoom: 0.9,
      attributionControl: false,
      renderWorldCopies: false,
      interactive: false,
      fadeDuration: 0,
    });

    map.on("style.load", () => {
      map.resize();
      setReady(true);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Clear old
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!resolvers || resolvers.length === 0) return;

    // Add markers
    for (const r of resolvers) {
      const color = !r.ok ? "#f87171" : r.consensus ? "#4ade80" : "#facc15";

      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;position:relative;`;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill="${color}" opacity="0.15"/><circle cx="7" cy="7" r="4" fill="${color}" opacity="0.4"/><circle cx="7" cy="7" r="2" fill="${color}"/></svg>`;
      el.title = `${r.resolver.name} — ${r.resolver.city}, ${r.resolver.country}\n${r.resolver.ip}\n${r.ok ? (r.records?.join(", ") || "no records") : r.error}`;

      const marker = new MapLibreGL.Marker({ element: el, anchor: "center" })
        .setLngLat([r.resolver.lon, r.resolver.lat])
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [resolvers, ready]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-white/[0.06]" style={{ height: "260px", background: "#0a0c14", boxShadow: "0 0 0 1px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), 0 20px 60px -20px rgba(0,0,0,0.6)" }}>
      <div ref={containerRef} className="absolute inset-0" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
          <p className="text-[11px] text-white/50">Querying resolvers…</p>
        </div>
      )}

      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-3 text-[9px] uppercase tracking-widest text-white/50 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded z-10">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> agree</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> differ</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> error</span>
      </div>
    </div>
  );
}
