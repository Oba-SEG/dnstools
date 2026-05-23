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
      center: [20, 15],
      zoom: 0.8,
      attributionControl: false,
      renderWorldCopies: false,
      interactive: false,
    });

    map.on("load", () => {
      map.resize();
      setReady(true);
    });
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

    map.resize();

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!resolvers) return;

    resolvers.forEach((r) => {
      const color = !r.ok ? "#fca5a5" : r.consensus ? "#86efac" : "#fcd34d";

      const el = document.createElement("div");
      el.style.cssText = "position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:default;";
      el.innerHTML = `
        <div style="position:absolute;width:18px;height:18px;border-radius:50%;background:${color};opacity:0.12;"></div>
        <div style="position:absolute;width:10px;height:10px;border-radius:50%;background:${color};opacity:0.35;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:${color};"></div>
      `;
      el.title = `${r.resolver.name} · ${r.resolver.city}, ${r.resolver.country} · ${r.resolver.ip}`;

      const marker = new MapLibreGL.Marker({ element: el, anchor: "center" })
        .setLngLat([r.resolver.lon, r.resolver.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [resolvers, ready]);

  return (
    <div className="relative w-full premium-surface rounded-xl overflow-hidden">
      <div ref={containerRef} style={{ width: "100%", height: "220px" }} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <p className="text-[11px] text-white/50">Querying resolvers…</p>
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-3 text-[9px] uppercase tracking-widest text-muted-foreground/70 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded border border-white/[0.04]">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" /> agree</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-300" /> differ</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-300" /> error</span>
      </div>
    </div>
  );
}
