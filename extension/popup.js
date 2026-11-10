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

async function runCheck(target) {
  el.out.innerHTML = '<p class="dim">Checking…</p>';
  el.go.disabled = true;
  try {
    const [recordRes, dnssecRes, emailRes] = await Promise.all([
      fetch(`${API}/lookup?domain=${encodeURIComponent(target)}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`lookup ${r.status}`))),
      fetch(`${API}/dnssec?domain=${encodeURIComponent(target)}`).then(r => r.json()).catch(() => null),
      fetch(`${API}/email?domain=${encodeURIComponent(target)}`).then(r => r.json()).catch(() => null),
    ]);

    const recs = (recordRes.results || []).filter(r => (r.records || []).length > 0)
      .map(r => `<div class="rec"><span class="t">${esc(r.type)}</span>${esc(r.records.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' · '))}</div>`)
      .join('');
    const noRecs = `<div class="rec dim">No records resolved.</div>`;

    let dnssecHtml = '';
    if (dnssecRes) {
      const signed = dnssecRes.signed === true || dnssecRes.dnssec === true || dnssecRes.has_key === true;
      const shown = typeof dnssecRes.signed === 'boolean' ? dnssecRes.signed : undefined;
      if (shown !== undefined) dnssecHtml = `<div class="rec"><span class="${signed ? 'ok' : 'bad'}">${signed ? 'Signed' : 'Not signed'}</span></div>`;
    }

    let emailHtml = '';
    if (emailRes && (emailRes.spf || emailRes.dmarc || emailRes.dkim_domain)) {
      const chip = (name, v) => v == null ? '' : `<span class="badge">${name}: ${esc(v.status || v.policy || (v.valid ? 'found' : 'none'))}</span> `;
      emailHtml = `<div class="rec">${chip('SPF', emailRes.spf)}${chip('DKIM', emailRes.dkim_domain)}${chip('DMARC', emailRes.dmarc)}</div>`;
    }

    el.out.innerHTML =
      section('DNS records', recs || noRecs) +
      section('DNSSEC', dnssecHtml) +
      section('Email auth', emailHtml) +
      `<div class="section"><a href="${SITE}?domain=${encodeURIComponent(target)}&tool=lookup" target="_blank">Open full report →</a></div>`;
  } catch (err) {
    el.out.innerHTML = `<div class="section"><p class="bad">Failed: ${esc(err.message || 'request error')}</p></div>`;
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
