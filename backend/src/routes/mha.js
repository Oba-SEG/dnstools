'use strict';

// Message Header Analyzer — parses raw email headers and extracts:
// - Hop chain (Received headers) with timestamps, delays, IPs
// - Authentication results (SPF, DKIM, DMARC, ARC)
// - Key headers (From, To, Subject, Date, Message-ID, etc.)
// - Anti-spam verdicts (X-Spam-Status, X-MS-Exchange-*, BCL, SCL)

const express = require('express');
const router = express.Router();

function parseHeaders(raw) {
  // Unfold continuation lines (lines starting with whitespace are continuations)
  const unfolded = raw.replace(/\r\n/g, '\n').replace(/\n([ \t]+)/g, ' ');
  const lines = unfolded.split('\n');
  const headers = [];
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)/);
    if (match) {
      headers.push({ name: match[1], value: match[2] });
    }
  }
  return headers;
}

function parseReceived(headers) {
  const received = headers.filter(h => h.name.toLowerCase() === 'received');
  const hops = [];

  for (let i = 0; i < received.length; i++) {
    const val = received[i].value;
    const hop = { index: received.length - i, raw: val };

    // Extract "from" host
    const fromMatch = val.match(/from\s+([^\s(;]+)/i);
    if (fromMatch) hop.from = fromMatch[1];

    // Extract "by" host
    const byMatch = val.match(/by\s+([^\s(;]+)/i);
    if (byMatch) hop.by = byMatch[1];

    // Extract IP
    const ipMatch = val.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
    if (ipMatch) hop.ip = ipMatch[1];

    // Extract "with" protocol
    const withMatch = val.match(/with\s+([A-Za-z0-9]+)/i);
    if (withMatch) hop.protocol = withMatch[1];

    // Extract timestamp after semicolon
    const semiIdx = val.lastIndexOf(';');
    if (semiIdx !== -1) {
      const dateStr = val.slice(semiIdx + 1).trim();
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        hop.timestamp = parsed.toISOString();
        hop.date_str = dateStr;
      }
    }

    hops.push(hop);
  }

  // Calculate delays between hops
  for (let i = 0; i < hops.length - 1; i++) {
    if (hops[i].timestamp && hops[i + 1].timestamp) {
      const diff = new Date(hops[i + 1].timestamp).getTime() - new Date(hops[i].timestamp).getTime();
      hops[i + 1].delay_ms = diff;
      hops[i + 1].delay_str = formatDelay(diff);
    }
  }

  return hops;
}

function formatDelay(ms) {
  if (ms < 0) return `${ms}ms (clock skew)`;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
  return `${(ms / 3600000).toFixed(1)}hr`;
}

function extractAuth(headers) {
  const results = { spf: null, dkim: null, dmarc: null, arc: null, compauth: null };

  const authResults = headers.filter(h => h.name.toLowerCase() === 'authentication-results');
  for (const ar of authResults) {
    const val = ar.value;
    const spfMatch = val.match(/spf=(pass|fail|softfail|neutral|none|temperror|permerror)/i);
    if (spfMatch) results.spf = { result: spfMatch[1].toLowerCase(), raw: val };

    const dkimMatch = val.match(/dkim=(pass|fail|none|temperror|permerror)/i);
    if (dkimMatch) results.dkim = { result: dkimMatch[1].toLowerCase(), raw: val };

    const dmarcMatch = val.match(/dmarc=(pass|fail|bestguesspass|none|temperror|permerror)/i);
    if (dmarcMatch) results.dmarc = { result: dmarcMatch[1].toLowerCase(), raw: val };

    const compMatch = val.match(/compauth=(\w+)/i);
    if (compMatch) results.compauth = { result: compMatch[1], raw: val };
  }

  const arcAuth = headers.filter(h => h.name.toLowerCase() === 'arc-authentication-results');
  if (arcAuth.length > 0) results.arc = { present: true, count: arcAuth.length };

  return results;
}

function extractKeyHeaders(headers) {
  const keys = ['from', 'to', 'cc', 'subject', 'date', 'message-id', 'reply-to', 'return-path', 'x-mailer', 'user-agent', 'mime-version', 'content-type'];
  const result = {};
  for (const h of headers) {
    const lower = h.name.toLowerCase();
    if (keys.includes(lower) && !result[lower]) {
      result[lower] = h.value;
    }
  }
  return result;
}

function extractAntiSpam(headers) {
  const spam = {};
  for (const h of headers) {
    const lower = h.name.toLowerCase();
    if (lower === 'x-spam-status' || lower === 'x-spam-score' || lower === 'x-spam-flag') {
      spam[h.name] = h.value;
    }
    if (lower.startsWith('x-ms-exchange-') || lower === 'x-microsoft-antispam' || lower === 'x-forefront-antispam-report') {
      spam[h.name] = h.value;
    }
    if (lower === 'x-google-dkim-signature' || lower === 'x-gm-message-state') {
      spam[h.name] = h.value;
    }
  }
  // Parse SCL/BCL from X-MS headers
  for (const [k, v] of Object.entries(spam)) {
    const sclMatch = String(v).match(/SCL:(\d+)/i);
    if (sclMatch) spam._scl = parseInt(sclMatch[1]);
    const bclMatch = String(v).match(/BCL:(\d+)/i);
    if (bclMatch) spam._bcl = parseInt(bclMatch[1]);
  }
  return spam;
}

router.post('/', (req, res) => {
  const raw = req.body?.headers;
  if (!raw || typeof raw !== 'string' || raw.trim().length < 10) {
    return res.status(400).json({ error: 'Provide email headers in body as { "headers": "..." }' });
  }

  const headers = parseHeaders(raw);
  if (headers.length === 0) {
    return res.status(400).json({ error: 'Could not parse any headers from input' });
  }

  const hops = parseReceived(headers);
  const auth = extractAuth(headers);
  const key = extractKeyHeaders(headers);
  const antispam = extractAntiSpam(headers);

  // Total transit time
  let totalDelay = null;
  if (hops.length >= 2 && hops[0].timestamp && hops[hops.length - 1].timestamp) {
    totalDelay = new Date(hops[hops.length - 1].timestamp).getTime() - new Date(hops[0].timestamp).getTime();
  }

  res.json({
    summary: {
      total_hops: hops.length,
      total_delay_ms: totalDelay,
      total_delay_str: totalDelay != null ? formatDelay(totalDelay) : null,
      subject: key.subject || null,
      from: key.from || null,
      to: key.to || null,
      date: key.date || null,
      message_id: key['message-id'] || null,
    },
    hops,
    auth,
    key_headers: key,
    antispam: Object.keys(antispam).length > 0 ? antispam : null,
    header_count: headers.length,
  });
});

module.exports = router;
