'use strict';

// Paddle fulfillment for Nexus DNS Pro.
//
//   POST /api/pro/paddle/webhook             — Paddle-Signature verified events
//   GET  /api/pro/redeem?transaction_id&email — buyer self-serve license download
//
// Checkout is opened client-side by Paddle.js on the sales page (public
// client-side token) with successUrl = /pro/redeem, where the buyer claims
// their license. No server-side transaction creation is involved.
//
// Delivery model (no email provider in the loop): /pro/redeem calls GET
// /redeem with the Paddle transaction id + buyer email. The order is
// validated against the Paddle API (completed status, our price, email match,
// no pending/approved refund), then a license is minted deterministically —
// Ed25519 signatures are deterministic, so the same transaction always yields
// the same license string. The webhook pre-caches minted licenses on
// transaction.completed and revokes on refund/chargeback adjustments.

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const PADDLE_API = 'https://api.paddle.com';
const PRICE_ID = process.env.PADDLE_PRICE_ID || 'pri_01m77gfvpjg1c6c1yjcdqs359f';
const PADDLE_TIMEOUT_MS = 15000;
const SIGNATURE_TTL_S = 300; // reject webhook timestamps older/newer than 5 min

class PaddleBusy extends Error {} // retryable upstream condition (429 / 5xx)

// --- Minting -------------------------------------------------------------

function mintKey() {
  const k = process.env.NEXUS_MINT_KEY;
  if (!k) throw new Error('NEXUS_MINT_KEY not configured');
  return k.trim();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// iat is the transaction's creation date (not mint time) so the same
// transaction always yields byte-identical licenses, whenever it is redeemed.
function mint(orderRef, email, iat) {
  const claims = {
    lic: email,
    id: 'NP-' + String(orderRef).replace(/[^0-9a-z]/gi, '').slice(0, 10).toUpperCase(),
    plan: 'pro',
    iat: iat || new Date().toISOString().slice(0, 10),
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(crypto.sign(null, Buffer.from(payload), mintKey()));
  return { license: `NEXUSPRO.${payload}.${sig}`, claims };
}

// --- State (in-memory; survives within a deploy) --------------------------

const minted = new Map();   // transaction id -> { license, claims, at }
const refunded = new Set(); // refunded/charged-back transaction ids
const audit = [];           // recent events, capped

function noteAudit(entry) {
  audit.push(entry);
  if (audit.length > 100) audit.splice(0, audit.length - 100);
}

// --- Paddle API helpers ---------------------------------------------------

function paddleHeaders() {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error('PADDLE_API_KEY not configured');
  return { Authorization: `Bearer ${key.trim()}`, Accept: 'application/json' };
}

// For an event payload, the id to log/act on: transactions/customers carry
// `id`; adjustments carry `transaction_id`.
function txnRefId(data) {
  return String(data.transaction_id || data.id || '');
}

async function paddleFetch(path, opts = {}) {
  let r;
  try {
    r = await fetch(`${PADDLE_API}${path}`, {
      ...opts,
      headers: { ...paddleHeaders(), ...(opts.headers || {}) },
      signal: AbortSignal.timeout(PADDLE_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failures and timeouts are transient too — surface them as
    // retryable instead of reporting a valid transaction as "not found".
    throw new PaddleBusy(`Paddle unreachable: ${err && err.name === 'TimeoutError' ? 'timeout' : err.message}`);
  }
  // 429 / 5xx are transient upstream conditions — surface them as retryable
  // instead of letting callers report a valid transaction as "not found".
  if (r.status === 429 || r.status >= 500) throw new PaddleBusy(`Paddle ${r.status}`);
  return r;
}

async function paddleCustomerEmail(customerRef) {
  // customer_ref is an id string or an embedded customer object
  if (customerRef && typeof customerRef === 'object') return String(customerRef.email || '');
  if (!customerRef) return '';
  const r = await paddleFetch(`/customers/${encodeURIComponent(customerRef)}`);
  if (!r.ok) return '';
  const j = await r.json();
  return String((j.data && j.data.email) || '');
}

// Mint (fire-and-forget) from a webhook event; redeem mints on demand anyway.
async function mintAndCache(txnId, customerId, iat) {
  try {
    const email = await paddleCustomerEmail(customerId);
    if (!email) return;
    const { license, claims } = mint(txnId, email, iat);
    minted.set(txnId, { license, claims, at: new Date().toISOString() });
  } catch (err) {
    console.error('[fulfil] webhook mint failed:', err.message);
  }
}

// A refund or chargeback Paddle has recorded — even one still awaiting
// approval — revokes the license. Checked live on every serve (cache hits
// included) so the in-memory `refunded` set is only an optimization, never
// the authority: webhook timing and multi-instance deployments can't leave a
// refunded license redeemable. Walks every adjustments page before concluding
// "no refund", and fails closed on any Paddle error.
async function refundPending(txnId) {
  const BLOCK = new Set(['pending_approval', 'approved']);
  let url = `/adjustments?transaction_id=${encodeURIComponent(txnId)}&per_page=200`;
  while (url) {
    const r = await paddleFetch(url);
    if (!r.ok) throw new PaddleBusy(`Paddle adjustments ${r.status}`);
    const j = await r.json();
    const adjList = j.data || [];
    if (adjList.some(x => (x.action === 'refund' || x.action === 'chargeback') && BLOCK.has(x.status))) {
      refunded.add(txnId);
      return true;
    }
    // meta.pagination.next is an absolute URL; strip the origin for paddleFetch.
    // has_more is Paddle's documented end-of-results signal.
    const pagination = (j.meta && j.meta.pagination) || {};
    const next = pagination.has_more ? pagination.next : null;
    url = next ? String(next).replace(PADDLE_API, '') : null;
  }
  return false;
}

// --- Webhook ---------------------------------------------------------------

router.post('/paddle/webhook', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'webhook not configured' });

  // Paddle-Signature: ts=<unix>;h1=<hmac-sha256 of "ts:body">
  const sig = req.get('Paddle-Signature') || '';
  const parts = {};
  for (const piece of sig.split(';')) {
    const i = piece.indexOf('=');
    if (i > 0) parts[piece.slice(0, i)] = piece.slice(i + 1);
  }
  const ts = Number(parts.ts);
  const h1 = String(parts.h1 || '');
  if (!Number.isFinite(ts) || !h1) return res.status(401).json({ error: 'bad signature' });
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TTL_S) return res.status(401).json({ error: 'stale signature' });

  const mac = crypto.createHmac('sha256', secret).update(`${ts}:${req.body}`).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(h1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'bad signature' });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'bad json' });
  }

  // Paddle Billing events carry the name in `event_type`.
  const event = body.event_type || 'unknown';
  const data = body.data || {};

  noteAudit({ at: new Date().toISOString(), event, identifier: txnRefId(data) });

  if (event === 'transaction.completed') {
    const txnId = String(data.id || '');
    const iat = String(data.created_at || '').slice(0, 10);
    // Only pre-mint transactions for our price — webhook payloads carry the
    // line items; without details we skip the cache entirely (redeem remains
    // authoritative). Webhooks carry the customer as a bare id (ctm_…); the
    // email comes from the API record for the authoritative spelling.
    const lineItems = (data.details && data.details.line_items) || [];
    if (lineItems.some(li => li.price_id === PRICE_ID)) {
      mintAndCache(txnId, data.customer_id || null, iat);
    }
  } else if (event === 'adjustment.created') {
    // For adjustment events `data.id` is the adjustment (adj_…); the affected
    // sale is `data.transaction_id`.
    const txnId = String(data.transaction_id || '');
    const action = data.action;
    if (txnId && (action === 'refund' || action === 'chargeback')) {
      refunded.add(txnId);
      minted.delete(txnId);
    }
  }

  // Always 200 after a valid signature — Paddle retries non-2xx deliveries.
  return res.status(200).json({ ok: true });
});

// --- Redeem ----------------------------------------------------------------

const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts; try again in a minute.' },
});

router.get('/redeem', redeemLimiter, async (req, res) => {
  const txnId = String(req.query.transaction_id || '').trim();
  const email = String(req.query.email || '').trim();

  if (!/^txn_[a-z0-9]{6,}$/i.test(txnId)) {
    return res.status(400).json({ error: 'Missing or malformed transaction id — it starts with txn_ (see your Paddle receipt).' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Missing or malformed email.' });
  }

  try {
    // 1) Fast path: pre-minted by the webhook. The live refund check still
    // runs — the cache only skips the transaction/customer fetch.
    const hit = minted.get(txnId);
    if (hit && !refunded.has(txnId) && hit.claims.lic.toLowerCase() === email.toLowerCase()) {
      if (await refundPending(txnId)) {
        return res.status(403).json({ error: 'This transaction was refunded — no license can be issued.' });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="nexus-pro-license.txt"');
      return res.type('text/plain').send(hit.license + '\n');
    }

    // 2) Validate the transaction with Paddle.
    const r = await paddleFetch(`/transactions/${encodeURIComponent(txnId)}`);
    if (r.status === 404) {
      return res.status(404).json({
        error: 'Transaction not found. Check the Transaction ID in your Paddle receipt — it starts with txn_.',
      });
    }
    if (!r.ok) return res.status(503).json({ error: 'License service unavailable; try again shortly.' });

    const t = (await r.json()).data || {};
    if (t.status !== 'completed') {
      return res.status(402).json({ error: 'Payment not completed yet; try again in a minute.' });
    }
    const lineItems = (t.details && t.details.line_items) || [];
    if (!lineItems.some(li => li.price_id === PRICE_ID)) {
      return res.status(403).json({ error: 'This transaction is not for this product.' });
    }

    // 3) Buyer email must match Paddle's record (authoritative spelling).
    const paddleEmail = await paddleCustomerEmail(t.customer || t.customer_id || null);
    if (!paddleEmail || paddleEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: 'Email does not match this transaction.' });
    }

    // 4) Refunds/chargebacks revoke the license (live, fail-closed).
    if (await refundPending(txnId)) {
      return res.status(403).json({ error: 'This transaction was refunded — no license can be issued.' });
    }

    const iat = String(t.created_at || '').slice(0, 10);
    const { license } = mint(t.id, paddleEmail, iat);
    minted.set(t.id, { license, claims: { lic: paddleEmail, iat }, at: new Date().toISOString() });
    res.setHeader('Content-Disposition', 'attachment; filename="nexus-pro-license.txt"');
    return res.type('text/plain').send(license + '\n');
  } catch (err) {
    if (err instanceof PaddleBusy) {
      return res.status(503).json({ error: 'License service busy — try again in a minute.' });
    }
    console.error('[fulfil] redeem error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
