'use strict';

// Curated list of public DNS resolvers to probe for propagation. Each entry
// has a real, reachable IP and a city/country/coords for the world-map
// rendering on the client. We keep this list trim and well-known so users
// understand what's being asked.

const RESOLVERS = [
  // North America — spread out so markers don't overlap
  { id: 'cf-na', name: 'Cloudflare', ip: '1.1.1.1',         country: 'US', city: 'San Francisco',  lat: 37.77,  lon: -122.42, tag: 'global-anycast' },
  { id: 'g8',    name: 'Google',     ip: '8.8.8.8',         country: 'US', city: 'Mountain View',  lat: 35.50,  lon: -118.00, tag: 'global-anycast' },
  { id: 'g844', name: 'Google',      ip: '8.8.4.4',         country: 'US', city: 'Mountain View',  lat: 33.80,  lon: -114.00, tag: 'global-anycast' },
  { id: 'q9',    name: 'Quad9',      ip: '9.9.9.9',         country: 'US', city: 'Berkeley',       lat: 40.00,  lon: -105.00, tag: 'global-anycast' },
  { id: 'odns',  name: 'OpenDNS',    ip: '208.67.222.222',  country: 'US', city: 'San Francisco',  lat: 34.00,  lon: -97.00,  tag: 'global-anycast' },
  { id: 'csv',   name: 'Verisign',   ip: '64.6.64.6',       country: 'US', city: 'Reston',         lat: 38.96,  lon: -77.34,  tag: 'global-anycast' },
  // Europe
  { id: 'cf-eu', name: 'Cloudflare', ip: '1.0.0.1',         country: 'NL', city: 'Amsterdam',      lat: 52.37,  lon: 4.90,    tag: 'global-anycast' },
  { id: 'cz-nic', name: 'CZ.NIC ODVR', ip: '193.17.47.1',   country: 'CZ', city: 'Prague',         lat: 50.07,  lon: 14.43,   tag: 'eu-anycast' },
  { id: 'dnswatch', name: 'DNS.WATCH', ip: '84.200.69.80',  country: 'DE', city: 'Frankfurt',      lat: 50.11,  lon: 8.68,    tag: 'eu' },
  // Asia / Pacific
  { id: 'ali',   name: 'AliDNS',     ip: '223.5.5.5',       country: 'CN', city: 'Hangzhou',       lat: 30.27,  lon: 120.16,  tag: 'cn' },
  { id: 'dnspod', name: 'DNSPod',    ip: '119.29.29.29',    country: 'CN', city: 'Shenzhen',       lat: 22.54,  lon: 114.06,  tag: 'cn' },
  { id: 'yandex', name: 'Yandex',    ip: '77.88.8.8',       country: 'RU', city: 'Moscow',         lat: 55.75,  lon: 37.62,   tag: 'eu' },
  // Africa / South America / Oceania (fewer well-known public resolvers,
  // we still want geographic spread on the propagation map)
  { id: 'cf-au',  name: 'Cloudflare (AU)', ip: '1.1.1.1', country: 'AU', city: 'Sydney',          lat: -33.87, lon: 151.21,  tag: 'global-anycast' },
  { id: 'cf-za',  name: 'Cloudflare (ZA)', ip: '1.1.1.1', country: 'ZA', city: 'Johannesburg',    lat: -26.20, lon: 28.04,   tag: 'global-anycast' },
  { id: 'cf-br',  name: 'Cloudflare (BR)', ip: '1.1.1.1', country: 'BR', city: 'São Paulo',       lat: -23.55, lon: -46.63,  tag: 'global-anycast' },
];

// Note: anycast providers (Cloudflare, Google, Quad9) actually resolve from
// whichever PoP is geographically closest to the *server* running the query.
// We label the geo by the perspective we'd like to represent to the user;
// the underlying server sees one PoP. This is the same compromise that
// dnschecker.org makes for browser-issued queries. For a visually richer
// 'true' geographic propagation we'd need agents in each region — out of
// scope for v1.

module.exports = { RESOLVERS };
