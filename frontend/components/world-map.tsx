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
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [20, 20],
      zoom: 1.2,
      attributionControl: false,
      renderWorldCopies: false,
      interactive: false,
    });

    map.on("load", () => setReady(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when resolvers change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!resolvers) return;

    resolvers.forEach((r) => {
      const color = !r.ok ? "#fca5a5" : r.consensus ? "#86efac" : "#fcd34d";

      const el = document.createElement("div");
      el.className = "resolver-marker";
      el.innerHTML = `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="width:24px;height:24px;border-radius:50%;background:${color};opacity:0.15;position:absolute;"></div>
          <div style="width:12px;height:12px;border-radius:50%;background:${color};opacity:0.4;position:absolute;"></div>
          <div style="width:7px;height:7px;border-radius:50%;background:${color};"></div>
        </div>
      `;
      el.title = `${r.resolver.name} (${r.resolver.city}, ${r.resolver.country}) — ${r.resolver.ip}`;

      const marker = new MapLibreGL.Marker({ element: el })
        .setLngLat([r.resolver.lon, r.resolver.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [resolvers, ready]);

  return (
    <div className="relative w-full premium-surface rounded-2xl overflow-hidden">
      <div ref={containerRef} className="w-full" style={{ height: "min(280px, 40vw)" }} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <p className="text-sm text-white/60">Querying global resolvers…</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground bg-black/30 backdrop-blur px-3 py-1.5 rounded-md border border-white/5">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-300" /> consensus</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-300" /> divergent</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-300" /> error</span>
      </div>
    </div>
  );
}
