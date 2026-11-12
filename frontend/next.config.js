/** @type {import('next').NextConfig} */

const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

// Custom GitHub Pages domain serves the site at the root, so the base path
// must be overridable. Empty string = site at domain root; falls back to the
// legacy project-page base when the variable is not set.
const BASE_PATH = STATIC_EXPORT ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "/dnstools") : "";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(STATIC_EXPORT
    ? {
        output: "export",
        basePath: BASE_PATH,
        assetPrefix: BASE_PATH ? `${BASE_PATH}/` : "",
        trailingSlash: true,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_STATIC_EXPORT: "1", NEXT_PUBLIC_BASE_PATH: BASE_PATH },
      }
    : {}),
};
module.exports = nextConfig;
