import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

// Cloudflare Web Analytics beacon (cookieless, no fingerprinting, no PII we
// process). The token is a site identifier that ships in page source by
// design — safe to hardcode. No token set → no script tag.
const CF_BEACON_TOKEN = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN || "";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Nexus Domain Tools — DNS, email, TLS, WHOIS, and more",
  description: "Nexus Domain Tools — DNS propagation, email security (SPF/DKIM/DMARC), TLS certificate inspection, WHOIS, blacklists, security headers, and ping/traceroute. No login required.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
      {CF_BEACON_TOKEN ? (
        <Script
          id="cf-web-analytics"
          strategy="afterInteractive"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })}
        />
      ) : null}
    </html>
  );
}
