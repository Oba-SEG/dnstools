import type { Metadata } from "next";
import { LEGAL_STYLES, LegalShell } from "../legal-shared";

export const metadata: Metadata = {
  title: "Terms of Use — Nexus Domain Tools",
  description: "The fair-use, as-is, no-warranty terms for using Nexus Domain Tools.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Use"
      updated="Last updated: 11 November 2026"
      styles={LEGAL_STYLES}
    >
      <p>
        These terms govern your use of Nexus Domain Tools (&quot;the
        service&quot;), a free set of network diagnostics operated by Segbytes.
        By using the service you accept them.
      </p>

      <h2>What the service is</h2>
      <p>
        A free, best-effort toolbox for looking up public DNS records, WHOIS
        registration data, email security posture, TLS certificates, and
        related diagnostics. It requires no account and is supported by
        disclosed partner offers and our paid products.
      </p>

      <h2>No warranty, informational only</h2>
      <ul>
        <li>
          The service is provided <strong>&quot;as is&quot;</strong>, without
          warranty of any kind, express or implied, including accuracy,
          availability, or fitness for a particular purpose.
        </li>
        <li>
          Results come from third-party sources (DNS resolvers, WHOIS
          registries, certificate authorities, blacklist operators) and are{" "}
          <strong>informational only</strong> — not legal, security, or
          compliance advice. Verify critical findings through official
          channels.
        </li>
        <li>There is no SLA. Endpoints, limits, or the service itself may change or be discontinued.</li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>
          Rate limits apply per IP and per endpoint. Automated or bulk use
          must respect them; the service may throttle or block abusive
          traffic.
        </li>
        <li>
          Do not attempt to bypass rate limits, bot protection, or access
          restrictions, and do not use the service for scanning, harvesting,
          or attacking third parties.
        </li>
        <li>
          You are responsible for the legality of the targets you query and
          what you do with the results.
        </li>
        <li>
          Programmatic use should set a descriptive User-Agent and stay
          within limits; see the <code>ai.txt</code> and <code>robots.txt</code>{" "}
          notices for crawler policy.
        </li>
      </ul>

      <h2>Disclosed partner offers</h2>
      <p>
        When a check fails or something is expiring, the service may surface
        clearly-labelled offers from partners (registrars, email vendors).
        We may earn a commission from those. Offers never affect check
        results, and are shown only at the moment of the relevant failure.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Segbytes is not liable for
        any indirect, incidental, or consequential damages, or for any loss
        arising from use of, or inability to use, the service, or from
        reliance on its results.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of South Africa. Questions or
        reports: <a href="https://github.com/Oba-SEG/dnstools/issues">GitHub issues</a>{" "}
        or <a href="https://segbytes.co.za">segbytes.co.za</a>. Changes to
        these terms are posted on this page with an updated date.
      </p>
    </LegalShell>
  );
}
