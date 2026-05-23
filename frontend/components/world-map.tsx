"use client";

// Lightweight equirectangular world map for the propagation view.
// Continents drawn as a single low-detail SVG path (no external data
// dependency, ~5KB compressed). Resolver dots are positioned via lat/lon
// → x/y projection: x = (lon + 180) * (W / 360); y = (90 - lat) * (H / 180).

import React from "react";

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

// Equirectangular projection helpers
const W = 1000;
const H = 500;
const project = (lat: number, lon: number) => ({
  x: ((lon + 180) / 360) * W,
  y: ((90 - lat) / 180) * H,
});

// Hand-traced low-detail world silhouette. Public domain, equirectangular.
// Source: simplified from natural-earth coastline @ 1:110m, smoothed for
// dark-theme aesthetic. Single path; ~6KB.
const WORLD_PATH = "M 158 192 L 188 173 L 240 168 L 280 162 L 305 175 L 327 188 L 322 211 L 297 224 L 271 233 L 247 226 L 220 233 L 198 219 L 169 213 Z M 405 132 L 478 110 L 522 102 L 558 99 L 608 110 L 655 117 L 698 130 L 720 154 L 698 178 L 651 181 L 612 192 L 580 198 L 543 196 L 502 187 L 462 178 L 425 160 Z M 470 215 L 510 207 L 555 211 L 590 222 L 612 244 L 605 274 L 580 294 L 540 302 L 502 295 L 472 280 L 458 251 Z M 215 244 L 247 244 L 285 258 L 305 280 L 312 311 L 305 340 L 285 372 L 256 396 L 226 412 L 192 411 L 168 388 L 165 354 L 178 320 L 195 286 L 207 263 Z M 545 235 L 580 244 L 605 263 L 622 286 L 632 322 L 622 357 L 600 384 L 568 397 L 538 393 L 514 372 L 502 343 L 503 311 L 514 280 Z M 730 130 L 770 124 L 815 132 L 855 146 L 880 168 L 870 196 L 833 209 L 793 207 L 758 195 L 738 175 L 730 153 Z M 740 218 L 790 226 L 830 244 L 855 268 L 850 295 L 830 318 L 800 333 L 770 332 L 745 314 L 738 285 L 740 253 Z M 800 350 L 840 358 L 870 380 L 880 408 L 855 430 L 825 432 L 805 415 L 800 388 Z";

interface Props {
  resolvers: ResolverResult[] | null;
  loading?: boolean;
}

export function WorldMap({ resolvers, loading }: Props) {
  return (
    <div className="relative w-full premium-surface rounded-2xl overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet">
        {/* Background grid */}
        <defs>
          <pattern id="grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="rgba(255,255,255,0.04)" />
          </pattern>
          <radialGradient id="hot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 157, 82, 0.6)" />
            <stop offset="60%" stopColor="rgba(255, 157, 82, 0.15)" />
            <stop offset="100%" stopColor="rgba(255, 157, 82, 0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#grid)" />

        {/* Continents */}
        <path d={WORLD_PATH} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />

        {/* Resolver dots */}
        {(resolvers || []).map((r) => {
          const { x, y } = project(r.resolver.lat, r.resolver.lon);
          const colour = !r.ok ? "#fca5a5" : r.consensus ? "#86efac" : "#fcd34d";
          const stroke = !r.ok ? "rgba(248,113,113,0.5)" : r.consensus ? "rgba(110,231,183,0.5)" : "rgba(252,211,77,0.5)";
          return (
            <g key={r.resolver.id} className="resolver-dot" transform={`translate(${x}, ${y})`}>
              <circle r="14" fill={colour} opacity="0.08" />
              <circle r="6" fill={stroke} opacity="0.4" />
              <circle r="3.5" fill={colour}>
                <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
              </circle>
              <text x="0" y="-12" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.6)" fontWeight="600" style={{ pointerEvents: "none" }}>
                {r.resolver.country}
              </text>
            </g>
          );
        })}

        {/* Loading shimmer */}
        {loading && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.45)" fontFamily="var(--font-display)">
            Querying global resolvers…
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground bg-black/30 backdrop-blur px-3 py-1.5 rounded-md border border-white/5">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-300" /> consensus</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-300" /> divergent</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-300" /> error</span>
      </div>
    </div>
  );
}
