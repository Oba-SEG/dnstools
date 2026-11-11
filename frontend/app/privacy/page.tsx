import type { Metadata } from "next";
import { LEGAL_STYLES, LegalShell } from "../legal-shared";

export const metadata: Metadata = {
  title: "Privacy Policy — Nexus Domain Tools",
  description: "What Nexus Domain Tools processes, what it never stores, and who it shares nothing with.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="Last updated: 11 November 2026"
      styles={LEGAL_STYLES}
    >
      <p>
        Nexus Domain Tools (this site) is a set of free network diagnostics —
        DNS, WHOIS, email security, TLS, and related checks. It has no
        accounts, no login, and no cookies. This policy explains the small
        amount of processing that happens anyway, because honesty about data
        is the point of the product.
      </p>

      <h2>What we process</h2>
      <ul>
        <li>
          <strong>The domains, IPs, and URLs you look up.</strong> These are
          processed in real time to answer your query. Caches of results are
          in-memory and expire within minutes. They are not written to disk,
          not tied to you, and not sold.
        </li>
        <li>
          <strong>Your IP address.</strong> Used transiently, in memory, for
          rate limiting and abuse prevention. It is not persisted, not
          exported, and not linked to your queries after the request.
        </li>
        <li>
          <strong>Short-lived operational logs</strong> at our hosting
          providers, used only for troubleshooting incidents.
        </li>
        <li>
          <strong>Cloudflare Turnstile</strong> protects heavier endpoints
          from bots. Verification runs on Cloudflare&apos;s infrastructure;
          see <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare&apos;s privacy policy</a>.
        </li>
        <li>
          <strong>Cloudflare Web Analytics.</strong> We use a cookieless,
          no-fingerprinting analytics beacon to understand aggregate site
          traffic (visits, geography, referrers, device types). It sets no
          cookies and collects no personal data we can link back to you.
        </li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>No accounts or profiles — there is nothing to sign up for.</li>
        <li>No cookies on this site.</li>
        <li>No advertising trackers.</li>
        <li>No profiling of individual users.</li>
        <li>No selling or sharing of personal data. Ever.</li>
        <li>
          No use of this service&apos;s output for AI/LLM training — see our{" "}
          <a href="https://ndns-api.onrender.com/ai.txt">ai.txt</a> notice.
        </li>
      </ul>

      <h2>Where things run</h2>
      <ul>
        <li>Frontend: static files served by GitHub Pages.</li>
        <li>API: Render (US/EU regions).</li>
        <li>Analytics + bot protection: Cloudflare.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        We designed the service so that there is no personal data of yours to
        export, correct, or delete — we don&apos;t retain records that could
        identify you. We aim for strict data minimisation (POPIA, GDPR
        principles). If you have a question or concern, open an issue at{" "}
        <a href="https://github.com/Oba-SEG/dnstools/issues">
          github.com/Oba-SEG/dnstools/issues
        </a>{" "}
        or reach us via <a href="https://segbytes.co.za">segbytes.co.za</a>.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, we update the date above and the
        footer of the site. Continued use after a change means you accept the
        updated policy.
      </p>
    </LegalShell>
  );
}
