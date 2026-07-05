'use strict';

// Real bandwidth speed test — download Mbps, upload Mbps, ping, jitter.
// Inspired by speedtest.net / speedtests.co.za.
//
// Endpoints:
//   GET  /api/speedtest/ping              → tiny payload for latency measurement
//   GET  /api/speedtest/download?bytes=N  → N bytes of random data
//   POST /api/speedtest/upload            → accepts uploaded payload
//   GET  /api/speedtest/server            → current server info
//   GET  /api/speedtest/servers           → list of available test servers
//   POST /api/speedtest/results           → store test result, returns share ID
//   GET  /api/speedtest/results/:id       → retrieve stored result

const express = require('express');
const crypto = require('node:crypto');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MB cap
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;    // 50 MB cap

// Pre-generate cached random buffers for common sizes to avoid CPU overhead
const CACHE = new Map();
const CACHE_TTL = 60_000;

function getCachedBuffer(bytes) {
  const key = bytes;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.buf;
  const buf = crypto.randomBytes(bytes);
  CACHE.set(key, { buf, ts: Date.now() });
  return buf;
}

// In-memory result storage (TTL-based cleanup)
const RESULTS = new Map();
const RESULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_RESULTS = 10000;

function cleanupResults() {
  const now = Date.now();
  for (const [id, data] of RESULTS) {
    if (now - data.created > RESULT_TTL) RESULTS.delete(id);
  }
  if (RESULTS.size > MAX_RESULTS) {
    // Remove oldest entries
    const sorted = [...RESULTS.entries()].sort((a, b) => a[1].created - b[1].created);
    const toRemove = sorted.slice(0, RESULTS.size - MAX_RESULTS);
    for (const [id] of toRemove) RESULTS.delete(id);
  }
}
setInterval(cleanupResults, 60 * 60 * 1000); // hourly

// Available test servers
const SERVERS = [
  { id: 'jnb', name: 'NexusDNS JHB', location: 'Johannesburg, ZA', host: 'jnb.nexusdns.co.za', lat: -26.2041, lon: 28.0473 },
  { id: 'cpt', name: 'NexusDNS CPT', location: 'Cape Town, ZA', host: 'cpt.nexusdns.co.za', lat: -33.9249, lon: 18.4241 },
  { id: 'london', name: 'NexusDNS LON', location: 'London, UK', host: 'lon.nexusdns.co.za', lat: 51.5074, lon: -0.1278 },
  { id: 'frankfurt', name: 'NexusDNS FRA', location: 'Frankfurt, DE', host: 'fra.nexusdns.co.za', lat: 50.1109, lon: 8.6821 },
  { id: 'singapore', name: 'NexusDNS SIN', location: 'Singapore', host: 'sin.nexusdns.co.za', lat: 1.3521, lon: 103.8198 },
  { id: 'newyork', name: 'NexusDNS NYC', location: 'New York, US', host: 'nyc.nexusdns.co.za', lat: 40.7128, lon: -74.0060 },
];

// Ping — returns a tiny JSON payload for latency measurement.
router.get('/ping', (req, res) => {
  res.json({ t: Date.now() });
});

// Download — streams random bytes for bandwidth measurement.
router.get('/download', (req, res) => {
  const bytes = Math.min(Math.max(parseInt(req.query.bytes, 10) || 1024 * 1024, 1024), MAX_DOWNLOAD_BYTES);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', bytes);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const buf = getCachedBuffer(bytes);
  res.end(buf);
});

// Upload — accepts POSTed body and returns confirmation.
router.post('/upload', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
  const received = req.body ? req.body.length : 0;
  res.json({ received, t: Date.now() });
});

// Server info — returns location and capacity for display.
router.get('/server', (req, res) => {
  res.json({
    name: 'NexusDNS',
    location: 'Johannesburg, ZA',
    host: req.hostname,
    timestamp: Date.now(),
  });
});

// Servers list — returns all available test servers.
router.get('/servers', (req, res) => {
  res.json({ servers: SERVERS });
});

// Store test result — returns shareable ID.
router.post('/results', express.json({ limit: '64kb' }), (req, res) => {
  const { pingMs, jitterMs, downloadMbps, uploadMbps, serverId, clientIp, userAgent } = req.body;

  if (
    typeof pingMs !== 'number' ||
    typeof jitterMs !== 'number' ||
    typeof downloadMbps !== 'number' ||
    typeof uploadMbps !== 'number' ||
    !serverId
  ) {
    return res.status(400).json({ error: 'Invalid result payload' });
  }

  // Generate short ID: base36 timestamp + random
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const result = {
    id,
    pingMs,
    jitterMs,
    downloadMbps,
    uploadMbps,
    serverId,
    clientIp: clientIp || req.ip,
    userAgent: userAgent || req.get('user-agent'),
    created: Date.now(),
  };

  RESULTS.set(id, result);
  res.json({ id, shareUrl: `/speedtest/${id}` });
});

// Retrieve stored result.
router.get('/results/:id', (req, res) => {
  const result = RESULTS.get(req.params.id);
  if (!result) {
    return res.status(404).json({ error: 'Result not found or expired' });
  }
  res.json(result);
});

module.exports = router;