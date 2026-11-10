'use strict';

const httpRequestsTotal = new Map();
const httpErrorsTotal = new Map();
const httpDurationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity];
const httpDurationCounts = new Map();
const httpDurationSums = new Map();

function keyFor(req) {
  if (!req || !req.path) return '/unknown';
  const p = req.path;
  if (p === '/health' || p === '/metrics') return p;
  const m = p.match(/^\/api\/([a-z0-9_-]+)/i);
  return m ? `/api/${m[1]}` : p;
}

function middleware(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const endpoint = keyFor(req);
    const method = req.method || 'GET';
    const status = String(res.statusCode || 0);
    const key = `${method}|${endpoint}|${status}`;
    httpRequestsTotal.set(key, (httpRequestsTotal.get(key) || 0) + 1);
    if (res.statusCode >= 400) {
      const ekey = `${method}|${endpoint}|${status}`;
      httpErrorsTotal.set(ekey, (httpErrorsTotal.get(ekey) || 0) + 1);
    }
    const dur = Number(process.hrtime.bigint() - started) / 1e9;
    const dkey = `${method}|${endpoint}`;
    if (!httpDurationCounts.has(dkey)) {
      httpDurationCounts.set(dkey, httpDurationBuckets.map(() => 0));
      httpDurationSums.set(dkey, 0);
    }
    const counts = httpDurationCounts.get(dkey);
    for (let i = 0; i < httpDurationBuckets.length; i++) {
      if (dur <= httpDurationBuckets[i]) counts[i] += 1;
    }
    httpDurationSums.set(dkey, (httpDurationSums.get(dkey) || 0) + dur);
  });
  next();
}

function escLabel(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function metricsText() {
  const lines = [];
  lines.push('# HELP nexus_dns_up Process uptime');
  lines.push('# TYPE nexus_dns_up gauge');
  lines.push(`nexus_dns_up ${Math.round(process.uptime())}`);
  lines.push('# HELP process_resident_memory_bytes Resident memory');
  lines.push('# TYPE process_resident_memory_bytes gauge');
  lines.push(`process_resident_memory_bytes ${process.memoryUsage().rss}`);
  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, value] of httpRequestsTotal.entries()) {
    const [method, endpoint, status] = key.split('|');
    lines.push(`http_requests_total{method="${escLabel(method)}",endpoint="${escLabel(endpoint)}",status="${escLabel(status)}"} ${value}`);
  }
  lines.push('# HELP http_request_duration_seconds HTTP request duration');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const [key, counts] of httpDurationCounts.entries()) {
    const [method, endpoint] = key.split('|');
    let total = 0;
    for (let i = 0; i < httpDurationBuckets.length; i++) {
      total = counts[i];
      const le = httpDurationBuckets[i] === Infinity ? '+Inf' : String(httpDurationBuckets[i]);
      lines.push(`http_request_duration_seconds_bucket{method="${escLabel(method)}",endpoint="${escLabel(endpoint)}",le="${le}"} ${counts[i]}`);
    }
    lines.push(`http_request_duration_seconds_sum{method="${escLabel(method)}",endpoint="${escLabel(endpoint)}"} ${httpDurationSums.get(key) || 0}`);
    lines.push(`http_request_duration_seconds_count{method="${escLabel(method)}",endpoint="${escLabel(endpoint)}"} ${total}`);
  }
  lines.push('# HELP http_client_errors_total Total 4xx/5xx responses');
  lines.push('# TYPE http_client_errors_total counter');
  for (const [key, value] of httpErrorsTotal.entries()) {
    const [method, endpoint, status] = key.split('|');
    lines.push(`http_client_errors_total{method="${escLabel(method)}",endpoint="${escLabel(endpoint)}",status="${escLabel(status)}"} ${value}`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { middleware, metricsText };
