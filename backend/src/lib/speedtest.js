'use strict';

const net = require('node:net');
const tls = require('node:tls');
const https = require('node:https');
const http = require('node:http');
const dns = require('node:dns/promises');
const { classifyIp } = require('./validate');

const ALLOWED_PORTS = new Set([22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 8080, 8443, 3306, 5432, 6379, 27017]);
const VALID_TESTS = new Set(['ping', 'dns', 'tcp', 'tls', 'http', 'whois']);
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 10000;
const MIN_TIMEOUT_MS = 500;
const SAMPLE_COUNT = 3;
const MAX_SAMPLES = 20;
const MAX_RESPONSE_BYTES = 1024 * 100;
const MAX_PATH_LENGTH = 2048;

const DEFAULT_RESOLVERS = [
  { id: 'cf', name: 'Cloudflare', ip: '1.1.1.1', location: 'Global', region: 'North America' },
  { id: 'google', name: 'Google', ip: '8.8.8.8', location: 'Global', region: 'North America' },
  { id: 'quad9', name: 'Quad9', ip: '9.9.9.9', location: 'Global', region: 'North America' },
  { id: 'verisign', name: 'Verisign', ip: '64.6.64.6', location: 'Global', region: 'North America' },
  { id: 'opendns', name: 'OpenDNS', ip: '208.67.222.222', location: 'Global', region: 'North America' },
  { id: 'cnic', name: 'CZ.NIC', ip: '185.43.135.1', location: 'Prague, CZ', region: 'Europe' },
  { id: 'dns-watch', name: 'DNS.WATCH', ip: '84.200.69.80', location: 'Germany', region: 'Europe' },
  { id: 'alidns', name: 'AliDNS', ip: '223.5.5.5', location: 'Hangzhou, CN', region: 'Asia' },
  { id: 'dnspod', name: 'DNSPod', ip: '119.29.29.29', location: 'Beijing, CN', region: 'Asia' },
  { id: 'yandex', name: 'Yandex', ip: '77.88.8.8', location: 'Moscow, RU', region: 'Europe' },
  { id: 'neustar', name: 'Neustar', ip: '156.154.70.5', location: 'Global', region: 'North America' },
  { id: 'powerdns', name: 'PowerDNS', ip: '169.239.202.1', location: 'Global', region: 'North America' },
];

function sanitisePath(path) {
  if (!path || typeof path !== 'string') return '/';
  const cleaned = path.replace(/[\r\n]/g, '');
  if (!cleaned.startsWith('/')) return '/' + cleaned;
  return cleaned.slice(0, MAX_PATH_LENGTH);
}

function boundTimeout(timeout) {
  const parsed = parseInt(timeout, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function boundSamples(samples) {
  const parsed = parseInt(samples, 10);
  if (!Number.isFinite(parsed)) return SAMPLE_COUNT;
  return Math.min(Math.max(parsed, 1), MAX_SAMPLES);
}

class SpeedTestService {
  constructor(config = {}) {
    this.timeout = boundTimeout(config.timeout);
    this.samples = boundSamples(config.samples);
    this.resolvers = config.resolvers || DEFAULT_RESOLVERS;
  }

  async ping(target, options = {}) {
    const samples = boundSamples(options.samples);
    const port = parseInt(options.port, 10) || 443;
    const timeout = boundTimeout(options.timeout);

    if (!ALLOWED_PORTS.has(port)) {
      throw Object.assign(new Error(`Port ${port} not allowed`), { code: 'INVALID_PORT' });
    }

    const ip = await this.resolveAndValidate(target);
    const results = [];

    const tasks = Array.from({ length: samples }, async () => {
      const start = performance.now();
      const success = await this.tcpConnect(ip, port, timeout);
      const duration = performance.now() - start;
      return { success, duration: parseFloat(duration.toFixed(2)) };
    });

    const sampleResults = await Promise.all(tasks);
    results.push(...sampleResults);

    return this.calculateStats('ping', target, ip, port, results);
  }

  async dns(domain, options = {}) {
    const resolver = options.resolver || '1.1.1.1';
    const type = options.type || 'A';
    const timeout = boundTimeout(options.timeout);
    const results = [];
    const types = Array.isArray(type) ? type : [type];

    const { valid, reason } = classifyIp(resolver);
    if (!valid) {
      throw Object.assign(new Error(`Resolver ${reason}: ${resolver}`), { code: 'INVALID_RESOLVER' });
    }

    for (const t of types) {
      const start = performance.now();
      try {
        const records = await this.resolveWithTimeout(domain, t, resolver, timeout);
        const duration = performance.now() - start;
        results.push({ type: t, success: true, duration: parseFloat(duration.toFixed(2)), records });
      } catch (err) {
        const duration = performance.now() - start;
        results.push({ type: t, success: false, duration: parseFloat(duration.toFixed(2)), error: 'dns-resolution-failed' });
      }
    }

    return this.calculateStats('dns', domain, resolver, null, results);
  }

  async tcp(target, options = {}) {
    const port = parseInt(options.port, 10) || 443;
    const samples = boundSamples(options.samples);
    const timeout = boundTimeout(options.timeout);

    if (!ALLOWED_PORTS.has(port)) {
      throw Object.assign(new Error(`Port ${port} not allowed`), { code: 'INVALID_PORT' });
    }

    const ip = await this.resolveAndValidate(target);
    const results = [];

    const tasks = Array.from({ length: samples }, async () => {
      const start = performance.now();
      const success = await this.tcpConnect(ip, port, timeout);
      const duration = performance.now() - start;
      return { success, duration: parseFloat(duration.toFixed(2)) };
    });

    const sampleResults = await Promise.all(tasks);
    results.push(...sampleResults);

    return this.calculateStats('tcp', target, ip, port, results);
  }

  async tls(target, options = {}) {
    const port = parseInt(options.port, 10) || 443;
    const timeout = boundTimeout(options.timeout);

    if (!ALLOWED_PORTS.has(port)) {
      throw Object.assign(new Error(`Port ${port} not allowed`), { code: 'INVALID_PORT' });
    }

    const ip = await this.resolveAndValidate(target);

    const start = performance.now();
    const result = await this.tlsHandshake(ip, port, target, timeout);
    const duration = performance.now() - start;

    return {
      type: 'tls',
      target,
      ip,
      port,
      duration: parseFloat(duration.toFixed(2)),
      ...result
    };
  }

  async http(target, options = {}) {
    const port = parseInt(options.port, 10) || 443;
    const timeout = boundTimeout(options.timeout);
    const path = sanitisePath(options.path);

    if (!ALLOWED_PORTS.has(port)) {
      throw Object.assign(new Error(`Port ${port} not allowed`), { code: 'INVALID_PORT' });
    }

    const ip = await this.resolveAndValidate(target);

    const start = performance.now();
    const result = await this.httpRequest(ip, port, target, path, timeout);
    const duration = performance.now() - start;

    return {
      type: 'http',
      target,
      ip,
      port,
      duration: parseFloat(duration.toFixed(2)),
      ...result
    };
  }

  async whois(domain, options = {}) {
    const timeout = boundTimeout(options.timeout);
    const start = performance.now();
    try {
      const result = await this.whoisQuery(domain, timeout);
      const duration = performance.now() - start;
      return { type: 'whois', domain, success: true, duration: parseFloat(duration.toFixed(2)), data: result };
    } catch (err) {
      const duration = performance.now() - start;
      return { type: 'whois', domain, success: false, duration: parseFloat(duration.toFixed(2)), error: 'whois-query-failed' };
    }
  }

  async runAllTests(target, options = {}) {
    const testTypes = (options.tests || ['ping', 'dns', 'tcp', 'tls', 'http', 'whois'])
      .filter(t => VALID_TESTS.has(t));
    const results = {};

    for (const test of testTypes) {
      try {
        results[test] = await this[test](target, options);
      } catch (err) {
        results[test] = { type: test, target, error: 'test-failed', success: false };
      }
    }

    return results;
  }

  getDefaultResolvers() {
    return this.resolvers;
  }

  async resolveTarget(target) {
    try {
      const { address } = await dns.lookup(target, { family: 4 });
      return address;
    } catch {
      return target;
    }
  }

  async resolveAndValidate(target) {
    const ip = await this.resolveTarget(target);
    const { valid, reason } = classifyIp(ip);
    if (!valid) {
      throw Object.assign(new Error(`Target resolves to ${reason}: ${ip}`), { code: 'PRIVATE_TARGET' });
    }
    return ip;
  }

  async resolveWithTimeout(domain, type, server, timeout) {
    const resolver = new dns.Resolver({ timeout, tries: 1 });
    resolver.setServers([server]);
    switch (type) {
      case 'A': return resolver.resolve4(domain);
      case 'AAAA': return resolver.resolve6(domain);
      case 'MX': return resolver.resolveMx(domain);
      case 'NS': return resolver.resolveNs(domain);
      case 'TXT': return resolver.resolveTxt(domain);
      case 'CNAME': return resolver.resolveCname(domain);
      case 'SOA': return resolver.resolveSoa(domain);
      default: throw new Error(`Unsupported type: ${type}`);
    }
  }

  tcpConnect(ip, port, timeout) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeout);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, ip);
    });
  }

  tlsHandshake(ip, port, servername, timeout) {
    return new Promise((resolve) => {
      const socket = tls.connect({
        host: ip,
        port,
        servername,
        rejectUnauthorized: false,
        timeout
      }, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve({
          success: true,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name,
          cert: {
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to
          }
        });
      });
      socket.on('error', () => {
        socket.destroy();
        resolve({ success: false, error: 'tls-handshake-failed' });
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, error: 'timeout' });
      });
    });
  }

  httpRequest(ip, port, hostname, path, timeout) {
    return new Promise((resolve) => {
      let totalBytes = 0;
      let destroyed = false;
      const start = performance.now();
      const req = https.get({
        hostname: ip,
        port,
        path,
        headers: { Host: hostname },
        rejectUnauthorized: false,
        timeout
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            destroyed = true;
            req.destroy();
            resolve({ success: false, error: 'response-too-large' });
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          if (destroyed) return;
          resolve({
            success: res.statusCode < 400,
            statusCode: res.statusCode,
            headers: res.headers,
            size: Buffer.byteLength(data)
          });
        });
      });
      req.on('error', () => {
        req.destroy();
        resolve({ success: false, error: 'http-request-failed' });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'timeout' });
      });
    });
  }

  whoisQuery(domain, timeout) {
    return new Promise((resolve, reject) => {
      let totalBytes = 0;
      let destroyed = false;
      const socket = net.createConnection(43, 'whois.verisign-grs.com');
      let data = '';
      socket.setTimeout(timeout);
      socket.on('connect', () => socket.write(`${domain}\r\n`));
      socket.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          destroyed = true;
          socket.destroy();
          reject(new Error('response-too-large'));
          return;
        }
        data += chunk.toString();
      });
      socket.on('end', () => {
        if (!destroyed) resolve(data);
      });
      socket.on('error', reject);
      socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    });
  }

  calculateStats(type, target, ip, port, results) {
    const successful = results.filter(r => r.success);
    const durations = successful.map(r => r.duration);
    const successRate = results.length > 0 ? successful.length / results.length : 0;

    return {
      type,
      target,
      ip,
      port,
      samples: results,
      stats: {
        min: durations.length > 0 ? durations.reduce((a, b) => Math.min(a, b), Infinity) : null,
        max: durations.length > 0 ? durations.reduce((a, b) => Math.max(a, b), -Infinity) : null,
        avg: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        success_rate: parseFloat((successRate * 100).toFixed(2)),
        total: results.length,
        successful: successful.length
      }
    };
  }
}

module.exports = { SpeedTestService, DEFAULT_RESOLVERS, ALLOWED_PORTS, VALID_TESTS };
