"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export const LEGAL_STYLES = `
  .legal h2 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #fb923c; margin: 28px 0 10px; font-family: var(--font-display), sans-serif; }
  .legal p, .legal li { color: rgba(232,234,242,0.75); font-size: 13.5px; line-height: 1.75; }
  .legal a { color: #fdba74; text-decoration: underline; text-underline-offset: 2px; }
  .legal ul { list-style: disc; padding-left: 20px; display: grid; gap: 6px; margin: 8px 0; }
  .legal strong { color: rgba(232,234,242,0.95); font-weight: 600; }
`;

export function LegalShell({ title, updated, children, styles }: {
  title: string;
  updated: string;
  children: ReactNode;
  styles: string;
}) {
  return (
    <div className="min-h-screen bg-[#060810]">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <header className="border-b border-white/[0.04] bg-[#060810]/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="ndns-mark w-8 h-8 text-[12px]">N</div>
            <span className="text-[14px] font-display font-bold tracking-tight text-foreground/90">Nexus Domain Tools</span>
          </Link>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <Link href="/privacy" className="hover:text-orange-300">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-300">Terms</Link>
            <Link href="/refund" className="hover:text-orange-300">Refunds</Link>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <h1 className="text-3xl font-display font-bold tracking-tight mb-1">{title}</h1>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 mb-8">{updated}</p>
        <div className="legal">{children}</div>
      </main>
      <footer className="container mx-auto px-6 py-8 border-t border-white/[0.04]">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
          <span>Nexus Domain Tools</span>
          <span>
            <Link href="/privacy" className="hover:text-orange-300">Privacy</Link>
            {" · "}
            <Link href="/terms" className="hover:text-orange-300">Terms</Link>
            {" · "}
            <Link href="/refund" className="hover:text-orange-300">Refunds</Link>
            {" · "}
            <span>Part of <a href="https://segbytes.co.za" className="text-orange-300/70 hover:text-orange-300">Segbytes</a></span>
          </span>
        </div>
      </footer>
    </div>
  );
}
