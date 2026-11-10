'use strict';

const API = 'https://ndns-api.onrender.com/api';
const SITE = 'https://oba-seg.github.io/dnstools/';

const el = {
  domain: document.getElementById('domain'),
  go: document.getElementById('go'),
  out: document.getElementById('out'),
};

function section(title, html) {
  if (!html) return '';
  return `<div class="section"><h2>${title}</h2>${html}</div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function safeJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return { _error: `HTTP ${r.status}` };
    return await r.json();
  } catch (_) {
    return { _error: 'network' };
  }
}

async function runCheck(target) {
  el.out.innerHTML = '<p class="dim">Checking…</p>';
  el.go.disabled = true;
  try {
    const [recordRes, dnssecRes, emailRes] = await Promise.all([
      safeJson(`${API}/lookup?domain=${encodeURIComponent(target)}`),
      safeJson(`${API}/dnssec?domain=${encodeURIComponent(target)}`),
      safeJson(`${API}/email?domain=${encodeURIComponent(target)}`),
    ]);

    const entries = (recordRes && recordRes.results) || [];
    const recLines = [];
    const failed = [];
    for (const r of entries) {
      const recs = r.records || [];
      if (recs.length > 0) {
        recLines.push(`<div class="rec"><span class="t">${esc(r.type)}</span>${esc(recs.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' · '))}</div>`);
      } else if (r.error && r.error !== 'ENODATA') {
        failed.push(`<div class="rec"><span class="t">${esc(r.type)}</span><span class="bad">${esc(r.error)}</span></div>`);
      }
    }
    const noRecs = (entries.length > 0 && recLines.length === 0 && failed.length === 0)
      ? '<div class="rec dim">No records resolved.</div>'
      : '';

    let dnssecHtml = '';
    if (dnssecRes && dnssecRes._error) {
      dnssecHtml = `<div class="rec"><span class="bad">check failed (${esc(dnssecRes._error)})</span></div>`;
    } else {
      const signed = !!(dnssecRes && (dnssecRes.signed === true || dnssecRes.dnssec === true || dnssecRes.has_key === true));
      const known = !!(dnssecRes && (dnssecRes.signed !== undefined || dnssecRes.dnssec !== undefined || dnssecRes.has_key !== undefined));
      if (known) dnssecHtml = `<div class="rec"><span class="${signed ? 'ok' : 'dim'}">${signed ? 'Signed' : 'Not signed'}</span></div>`;
    }

    let emailHtml = '';
    if (emailRes && emailRes._error) {
      emailHtml = `<div class="rec"><span class="bad">check failed (${esc(emailRes._error)})</span></div>`;
    } else if (emailRes && (emailRes.spf || emailRes.dmarc || emailRes.dkim)) {
      const chip = (name, state) => state == null ? '' : `<span class="badge">${name}: ${esc(state)}</span> `;
      const spfState = emailRes.spf ? (emailRes.spf.present ? 'present' : 'none') : null;
      const dkimState = emailRes.dkim ? ((emailRes.dkim.found || []).length ? `${emailRes.dkim.found.length} selector(s)` : 'none') : null;
      const dmarcState = emailRes.dmarc ? (emailRes.dmarc.present ? (emailRes.dmarc.policy || 'present') : 'none') : null;
      emailHtml = `<div class="rec">${chip('SPF', spfState)}${chip('DKIM', dkimState)}${chip('DMARC', dmarcState)}</div>`;
    }

    el.out.innerHTML =
      section('DNS records', recLines.join('') || noRecs || (failed.length ? '<div class="rec dim">All queries failed — see below.</div>' : '<div class="rec dim">No response.</div>')) +
      section('Failed checks', failed.length ? failed.join('') : '') +
      section('DNSSEC', dnssecHtml) +
      section('Email auth', emailHtml) +
      `<div class="section"><a href="${SITE}?domain=${encodeURIComponent(target)}&tool=lookup" target="_blank">Open full report →</a></div>`;
  } catch (err) {
    el.out.innerHTML = `<div class="section"><p class="bad">Failed: ${esc((err && err.message) || 'request error')}</p></div>`;
  } finally {
    el.go.disabled = false;
  }
}

el.go.addEventListener('click', () => {
  const raw = el.domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (raw) runCheck(raw);
});

el.domain.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    el.go.click();
  }
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const url = tab && tab.url;
  if (!url) return;
  try {
    const host = new URL(url).hostname;
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) && host !== 'localhost' && !host.endsWith('.local')) {
      el.domain.value = host;
      runCheck(host);
    }
  } catch (_) { /* chrome:// or others */ }
});
