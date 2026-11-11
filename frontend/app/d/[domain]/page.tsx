import type { Metadata } from "next";
import DomainOverviewClient from "./_client";

export function generateStaticParams() {
  // Static export produces one shell at /d/_/ — it resolves the real
  // domain from ?domain= on the client. Docker/nginx builds (no export)
  // serve /d/<domain> directly; the client handles both.
  return [{ domain: "_" }];
}

export const metadata: Metadata = {
  title: "Domain Overview — Nexus DNS",
};

export default function DomainOverviewPage({ params }: { params: { domain: string } }) {
  return <DomainOverviewClient pathDomain={params?.domain} />;
}
