'use strict';

// Lemon Squeezy fulfillment for Nexus DNS Pro.
//
//   POST /api/pro/ls/webhook                 — HMAC-verified LS events
//   GET  /api/pro/redeem?order_id&email      — buyer self-serve license download
//
// Delivery model (no email provider in the loop): the checkout redirect sends
// the buyer to /pro/redeem on the public site, which calls GET /redeem with the
// order UUID + email that Lemon Squeezy appends to the redirect URL. The order
// is validated against the Lemon Squeezy API (store, product, paid status,
// email match), then a license is minted deterministically — Ed25519 signatures
// are deterministic, so the same order always yields the same license string.
// The webhook pre-caches minted licenses on order_created and tracks refunds.

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const LS_API = 'https://api.lemonsqueezy.com/v1';
const STORE_ID = '520835';
const PRODUCT_ID = '1517438';
const LS_TIMEOUT_MS = 15000; // hard cap on every Lemon Squeezy API call
const LS_MAX_PAGES = 10;     // pagination ceiling for the identifier fallback scan

class LsBusy extends Error {} // retryable upstream condition (429 / 5xx)

// --- Minting -------------------------------------------------------------

function mintKey() {
  const k = process.env.NEXUS_MINT_KEY;
  if (!k) throw new Error('NEXUS_MINT_KEY not configured');
  return k.trim();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// iat is the order's creation date (not mint time) so the same order always
// yields byte-identical licenses, regardless of when it is redeemed.
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

const minted = new Map();   // order UUID -> { license, claims, at }
const refunded = new Set(); // order UUIDs refunded
const audit = [];           // recent webhook events, capped

function noteAudit(entry) {
  audit.push(entry);
  if (audit.length > 100) audit.splice(0, audit.length - 100);
}

// --- Webhook --------------------------------------------------------------

router.post('/ls/webhook', express.raw({ type: 'application/json', limit: '256kb' }), (req, res) => {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'webhook not configured' });

  const sigHeader = req.get('X-Signature') || '';
  const mac = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(sigHeader.trim());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'bad signature' });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'bad json' });
  }

  const event = (body.meta && body.meta.event_name) || 'unknown';
  const data = body.data || {};
  const attrs = data.attributes || {};
  const identifier = attrs.identifier || String(data.id || '');
  const email = attrs.user_email || '';

  noteAudit({ at: new Date().toISOString(), event, identifier, email });

  if (event === 'order_refunded') {
    refunded.add(identifier);
    minted.delete(identifier);
  } else if (event === 'order_created') {
    const productId = (attrs.first_order_item && attrs.first_order_item.product_id) || null;
    if (String(productId) === PRODUCT_ID && email) {
      try {
        const iat = String(attrs.created_at || '').slice(0, 10);
        const { license, claims } = mint(data.id, email, iat);
        minted.set(identifier, { license, claims, at: new Date().toISOString() });
      } catch (err) {
        console.error('[fulfil] mint failed on webhook:', err.message);
        // redeem will mint on demand instead
      }
    }
  }

  // Always 200 after a valid signature — Lemon Squeezy retries non-2xx.
  return res.status(200).json({ ok: true });
});

// --- Order validation against the Lemon Squeezy API ------------------------

function lsHeaders() {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY not configured');
  return { Authorization: `Bearer ${key.trim()}`, Accept: 'application/vnd.api+json' };
}

async function lsFetch(url) {
  const r = await fetch(url, {
    headers: lsHeaders(),
    signal: AbortSignal.timeout(LS_TIMEOUT_MS),
  });
  // 429 / 5xx are transient upstream conditions — surface them as retryable
  // instead of letting redeem report a valid order as "not found".
  if (r.status === 429 || r.status >= 500) throw new LsBusy(`LS ${r.status}`);
  return r;
}

async function lsOrder(orderId) {
  const r = await lsFetch(`${LS_API}/orders/${encodeURIComponent(orderId)}`);
  if (r.ok) {
    const j = await r.json();
    if (j && j.data) return j.data;
  }
  // Fallback: scan recent store orders for the UUID identifier, walking
  // pagination until found, the list ends, or the page ceiling is hit.
  for (let page = 1; page <= LS_MAX_PAGES; page++) {
    const r2 = await lsFetch(`${LS_API}/orders?filter%5Bstore_id%5D=${STORE_ID}&page%5Bsize%5D=50&page%5Bnumber%5D=${page}`);
    if (!r2.ok) break;
    const j2 = await r2.json();
    const hit = (j2.data || []).find(o => o && o.attributes && o.attributes.identifier === orderId);
    if (hit) return hit;
    if (!(j2.links && j2.links.next)) break;
  }
  return null;
}

// --- Redeem ----------------------------------------------------------------

const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts; try again in a minute.' },
});

router.get('/redeem', redeemLimiter, async (req, res) => {
  const orderId = String(req.query.order_id || '').trim();
  const email = String(req.query.email || '').trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return res.status(400).json({ error: 'Missing or malformed order id.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Missing or malformed email.' });
  }

  try {
    // 1) Fast path: pre-minted by the webhook.
    const hit = minted.get(orderId);
    if (hit && !refunded.has(orderId) && hit.claims.lic.toLowerCase() === email.toLowerCase()) {
      res.setHeader('Content-Disposition', 'attachment; filename="nexus-pro-license.txt"');
      return res.type('text/plain').send(hit.license + '\n');
    }

    // 2) Validate the order with Lemon Squeezy.
    let order;
    try {
      order = await lsOrder(orderId);
    } catch (err) {
      console.error('[fulfil] LS API error:', err.message);
      return res.status(503).json({ error: 'License service unavailable; try again shortly.' });
    }
    if (!order) {
      return res.status(404).json({
        error: 'Order not found. Open the receipt link in your Lemon Squeezy email — its URL contains the order ID after /my-orders/.',
      });
    }

    const a = order.attributes || {};
    const iat = String(a.created_at || '').slice(0, 10);
    // Mint with the order's own email spelling: combined with the iat above,
    // this keeps the license byte-identical to the webhook-minted one no
    // matter how the buyer capitalized their address in the redeem form.
    const mintEmail = String(a.user_email || email);
    const emailOk = String(a.user_email || '').toLowerCase() === email.toLowerCase();
    const storeOk = !a.store_id || String(a.store_id) === STORE_ID;
    const productId = (a.first_order_item && a.first_order_item.product_id) || null;
    const paid = a.status === 'paid' || a.status === 'fulfilled';
    const refundedNow = a.refunded === true || a.status === 'refunded';

    if (!emailOk || !storeOk || String(productId) !== PRODUCT_ID || refundedNow) {
      return res.status(403).json({ error: 'This order does not qualify for a license.' });
    }
    if (!paid) return res.status(402).json({ error: 'Order not marked as paid yet; try again in a minute.' });

    const { license } = mint(order.id, mintEmail, iat);
    minted.set(order.attributes.identifier || orderId, { license, claims: { lic: mintEmail, iat }, at: new Date().toISOString() });
    res.setHeader('Content-Disposition', 'attachment; filename="nexus-pro-license.txt"');
    return res.type('text/plain').send(license + '\n');
  } catch (err) {
    console.error('[fulfil] redeem error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
