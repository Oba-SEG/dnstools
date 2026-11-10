/** @type {import('next').NextConfig} */

const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(STATIC_EXPORT
    ? {
        output: "export",
        basePath: "/dnstools",
        assetPrefix: "/dnstools/",
        trailingSlash: true,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_STATIC_EXPORT: "1" },
      }
    : {}),
};
module.exports = nextConfig;
