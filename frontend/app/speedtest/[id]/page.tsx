import type { Metadata } from "next";
import SpeedTestResultClient from "./_client";

export function generateStaticParams() {
  // Static export produces one shell at /speedtest/_/ — it resolves the
  // real id from ?id= on the client. Docker/nginx builds (no export) can
  // still serve /speedtest/<id> directly; the client handles both.
  return [{ id: "_" }];
}

export const metadata: Metadata = {
  title: "Speed Test Result — Nexus DNS",
};

export default function SpeedTestResultPage({ params }: { params: { id: string } }) {
  return <SpeedTestResultClient pathId={params?.id} />;
}
