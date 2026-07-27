#!/usr/bin/env node
// build-dashboard.mjs — pull live data from GoHighLevel and regenerate the
// Ad Creative Performance dashboard.
//
// Usage:
//   GHL_API_TOKEN=xxx GHL_LOCATION_ID=dTtT96ODx29mbQcdOp0v node build-dashboard.mjs
//
// Outputs: ./dashboard.html and ./data/dashboard_data.json
//
// Emits a per-lead data model so the browser can re-aggregate for any date
// range with no further API calls:
//   { generatedAt, meta, activeAds[], ads[], contacts[], unattributedSales[] }
//   contacts[i] = { a: adIndex, d: "YYYY-MM-DD" lead-created, va,vs,t,ts,s: 0|1 }
//
// Token: create a GoHighLevel *Private Integration* (Settings → Private
// Integrations) for this sub-account with these scopes:
//   View Contacts (contacts.readonly), View Calendar Events
//   (calendars/events.readonly), View Custom Fields (locations/customFields.readonly)

import fs from 'fs';
import { renderDoc } from './render.mjs';

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
const TOKEN = process.env.GHL_API_TOKEN;
const LOCATION = process.env.GHL_LOCATION_ID || 'dTtT96ODx29mbQcdOp0v';

const AD_FIELD_ID   = process.env.GHL_AD_FIELD_ID   || 'JPvtFePRKemKT8SfOn1T';   // "Ad Creative"
const APPT_FIELD_ID = process.env.GHL_APPT_FIELD_ID || 'swdRjiAcFZNMfXztLD0g';   // "Appointment Status"
const VA_CAL_ID     = process.env.GHL_VA_CAL_ID     || 'iDBM1sRSqiZBWhblcGPD';   // "VA Calendar"
const T65_CAL_ID    = process.env.GHL_T65_CAL_ID    || 'jDfKPflpQai5OB0v7m0C';   // "Turning 65 Medicare Call"

const headers = { Authorization: `Bearer ${TOKEN}`, Version: VERSION, Accept: 'application/json' };

async function api(path, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (res.ok) return res.json();
    // GHL/Cloudflare occasionally 504s on large reads — back off and retry a few times.
    if ((res.status === 504 || res.status === 502 || res.status === 429) && attempt < 4) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const body = await res.text().catch(() => '');
    throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status} ${res.statusText}\n${body.slice(0, 400)}`);
  }
}

function searchContacts(filters, page) {
  return api('/contacts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locationId: LOCATION, page, pageLimit: 100, filters }),
  });
}

function cfMap(c) {
  const m = {};
  for (const f of c.customFields || []) m[f.id] = f.value;
  return m;
}
const day = iso => (iso || '').slice(0, 10) || null;

// Normalize a person's name for matching (lowercase, strip punctuation, collapse spaces).
const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
// Last 10 digits of a phone, so +12142829434 and 12142829434 both -> 2142829434.
const phone10 = s => { const d = String(s == null ? '' : s).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const parseMoney = s => { const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
// Parse a sale date (App Date) into YYYY-MM-DD. Accepts M/D/YYYY or YYYY-MM-DD.
const parseDate = s => {
  s = String(s == null ? '' : s).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas/newlines).
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Every contact that has an Ad Creative set.
async function fetchAdContacts() {
  const out = new Map();
  for (let page = 1; page <= 500; page++) {
    const data = await searchContacts([{ field: `customFields.${AD_FIELD_ID}`, operator: 'exists' }], page);
    const contacts = data.contacts || [];
    if (contacts.length === 0) break;
    for (const c of contacts) {
      const cf = cfMap(c);
      const ad = cf[AD_FIELD_ID];
      if (ad != null && ad !== '') out.set(c.id, {
        ad, appt: cf[APPT_FIELD_ID] || null, added: day(c.dateAdded),
        name: normName(c.contactName || `${c.firstName || ''} ${c.lastName || ''}`),
        phone: phone10(c.phone),
      });
    }
    process.stderr.write(`\rad contacts: ${out.size}/${data.total || '?'}   `);
    if (data.total && page * 100 >= data.total) break;
  }
  process.stderr.write('\n');
  return out;
}

// Every contact whose Appointment Status contains "Sale" (attributed or not).
async function fetchSaleContacts() {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const data = await searchContacts([{ field: `customFields.${APPT_FIELD_ID}`, operator: 'contains', value: 'Sale' }], page);
    const contacts = data.contacts || [];
    if (contacts.length === 0) break;
    for (const c of contacts) {
      const cf = cfMap(c);
      out.push({ id: c.id, ad: cf[AD_FIELD_ID] || null, added: day(c.dateAdded) });
    }
    if (data.total && page * 100 >= data.total) break;
  }
  return out;
}

// Read the Master Production Sheet as a published CSV and build revenue maps keyed by
// phone (last 10 digits) and by normalized client name. Sums multiple policies per client.
// Set PRODUCTION_CSV_URL to the "Publish to web -> CSV" URL of the tab that exposes
// client name + phone + projected + confirmed revenue. Headers are matched
// case-insensitively; override with PRODUCTION_CLIENT_COL / PRODUCTION_PHONE_COL /
// PRODUCTION_PROJECTED_COL / PRODUCTION_CONFIRMED_COL if your headers differ.
async function fetchProduction() {
  const url = process.env.PRODUCTION_CSV_URL;
  const empty = { byPhone: new Map(), byName: new Map(), clients: 0, connected: false };
  if (!url) return empty;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`production sheet ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (/^\s*</.test(text)) {
    throw new Error('production sheet URL returned HTML, not CSV. In Google Sheets use File → Share → '
      + 'Publish to web → pick the tab → format CSV, and use that link (it ends in output=csv).');
  }
  const rows = parseCSV(text);

  // Column finder: optional explicit override (substring match), else fuzzy by keyword.
  const find = (cols, envName, any, not = []) => {
    const override = (process.env[envName] || '').toLowerCase().trim();
    if (override) { const i = cols.findIndex(c => c.includes(override)); if (i >= 0) return i; }
    return cols.findIndex(c => any.some(s => c.includes(s)) && !not.some(s => c.includes(s)));
  };
  // Find the header row: the first row that has a client/name column AND a revenue column.
  let hi = -1, cols = null, ci = -1, pi = -1, fi = -1, phi = -1, di = -1;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const lc = rows[i].map(x => (x || '').trim().toLowerCase());
    const c = find(lc, 'PRODUCTION_CLIENT_COL', ['client', 'name'], ['agent', 'carrier', 'user', 'file']);
    const p = find(lc, 'PRODUCTION_PROJECTED_COL', ['projected'], ['commission']);
    const f = find(lc, 'PRODUCTION_CONFIRMED_COL', ['revenue', 'confirmed'], ['projected', 'commission']);
    if (c >= 0 && (p >= 0 || f >= 0)) {
      hi = i; cols = lc; ci = c; pi = p; fi = f;
      phi = find(lc, 'PRODUCTION_PHONE_COL', ['phone', 'mobile', 'cell']);
      di = find(lc, 'PRODUCTION_DATE_COL', ['app date', 'sale date', 'sold date', 'date'], ['effective', 'birth', 'dob', 'updated', 'added', 'lead']);
      break;
    }
  }
  if (hi < 0) {
    const seen = rows.slice(0, 5).map(r => r.join(' | ')).join('  //  ').slice(0, 300);
    throw new Error('production sheet: could not find a header row with a client column and a projected/confirmed '
      + 'revenue column. Make sure the published tab is the one with those columns. First rows seen: ' + seen);
  }
  const byPhone = new Map(), byName = new Map();
  const add = (map, key, proj, conf, sd) => {
    if (!key) return;
    const cur = map.get(key) || { proj: 0, conf: 0, sd: null };
    cur.proj += proj; cur.conf += conf; if (sd) cur.sd = sd; map.set(key, cur);
  };
  const clientHdr = cols[ci];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; const name = normName(r[ci]);
    if (!name || name === clientHdr) continue;
    const proj = pi >= 0 ? parseMoney(r[pi]) : 0;
    const conf = fi >= 0 ? parseMoney(r[fi]) : 0;
    if (!proj && !conf) continue;
    const sd = di >= 0 ? parseDate(r[di]) : null;
    add(byName, name, proj, conf, sd);
    if (phi >= 0) add(byPhone, phone10(r[phi]), proj, conf, sd);
  }
  return { byPhone, byName, clients: Math.max(byPhone.size, byName.size), connected: true };
}

async function fetchEvents(calendarId, startMs, endMs) {
  // locationId is required on this endpoint (the MCP connector used to inject it).
  const data = await api(`/calendars/events?locationId=${LOCATION}&calendarId=${calendarId}&startTime=${startMs}&endTime=${endMs}`);
  return data.events || [];
}

function bookingSets(events) {
  const booked = new Set(), showed = new Set();
  for (const e of events) {
    const cid = e.contactId; const st = (e.appointmentStatus || '').toLowerCase();
    if (!cid || e.deleted || st === 'cancelled') continue;
    booked.add(cid);
    if (st === 'showed') showed.add(cid);
  }
  return { booked, showed };
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync('./config.json', 'utf8')); }
  catch { return {}; }
}

// Meta ad spend, daily, by ad name. If META_ACCESS_TOKEN + META_AD_ACCOUNT_ID are
// set, pull live from the Graph API; otherwise use the committed data/spend_daily.json.
async function fetchSpendFromMeta(token, acct) {
  const base = `https://graph.facebook.com/v21.0/act_${acct}/insights`;
  let url = `${base}?level=ad&fields=ad_id,ad_name,spend&time_increment=1&date_preset=maximum&limit=500&access_token=${encodeURIComponent(token)}`;
  const out = [];
  for (let guard = 0; url && guard < 200; guard++) {
    const res = await fetch(url);
    if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Meta insights ${res.status} ${b.slice(0, 200)}`); }
    const j = await res.json();
    for (const r of j.data || []) {
      const v = parseFloat(r.spend);
      if (isFinite(v) && v > 0) out.push({ name: r.ad_name, id: r.ad_id, d: r.date_start, v: Math.round(v * 100) / 100 });
    }
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}

async function loadSpend() {
  const token = process.env.META_ACCESS_TOKEN, acct = process.env.META_AD_ACCOUNT_ID;
  if (token && acct) {
    try { const s = await fetchSpendFromMeta(token, acct); if (s.length) return s; }
    catch (e) { console.error('Meta spend fetch failed (' + e.message + ') — using committed spend snapshot'); }
  }
  try { return JSON.parse(fs.readFileSync('./data/spend_daily.json', 'utf8')); }
  catch { return []; }
}

// Fold daily spend into the data model: union its ad names into data.ads and emit
// per-day spend records keyed to the ad index (matched case/space-insensitively).
function mergeSpend(data, spendRecs) {
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nidx = new Map();
  data.ads.forEach((a, i) => { if (!nidx.has(norm(a))) nidx.set(norm(a), i); });
  const recs = [];
  for (const s of spendRecs) {
    const nk = norm(s.name);
    let i = nidx.get(nk);
    if (i == null) { i = data.ads.length; data.ads.push(s.name); nidx.set(nk, i); }
    recs.push({ a: i, d: s.d, v: s.v });
  }
  data.spend = recs;
  const dates = recs.map(r => r.d).filter(Boolean).sort();
  data.meta.spend_total = Math.round(recs.reduce((s, r) => s + r.v, 0) * 100) / 100;
  data.meta.spend_from = dates[0] || null;
  data.meta.spend_to = dates[dates.length - 1] || null;
  data.meta.spend_connected = recs.length > 0;
  data.meta.spend_source = 'Meta Ads — daily spend by ad name';
  return data;
}

function build2(adContacts, saleContacts, va, t65, production) {
  const vaB = bookingSets(va), t65B = bookingSets(t65);
  const ads = [], adIdx = new Map();
  const contacts = [];
  let attributedSales = 0, revProj = 0, revConf = 0, revMatched = 0, matchPhone = 0, matchName = 0;
  for (const [cid, info] of adContacts) {
    const sale = info.appt && info.appt.toLowerCase().includes('sale') ? 1 : 0;
    if (sale) attributedSales++;
    if (!adIdx.has(info.ad)) { adIdx.set(info.ad, ads.length); ads.push(info.ad); }
    // Match to the production sheet by phone first (most reliable), then by name.
    let rev = info.phone ? production.byPhone.get(info.phone) : null;
    if (rev) matchPhone++; else { rev = info.name ? production.byName.get(info.name) : null; if (rev) matchName++; }
    const pr = rev ? Math.round(rev.proj * 100) / 100 : 0;
    const cr = rev ? Math.round(rev.conf * 100) / 100 : 0;
    if (rev) { revMatched++; revProj += pr; revConf += cr; }
    const rec = {
      a: adIdx.get(info.ad), d: info.added,
      va: vaB.booked.has(cid) ? 1 : 0, vs: vaB.showed.has(cid) ? 1 : 0,
      t: t65B.booked.has(cid) ? 1 : 0, ts: t65B.showed.has(cid) ? 1 : 0, s: sale,
      pr, cr,
    };
    if (rev && rev.sd) rec.sd = rev.sd; // sale date (App Date) — revenue & sales filter by this
    contacts.push(rec);
  }
  // sales without an Ad Creative (organic / referral) — for total reconciliation
  const unattributedSales = saleContacts
    .filter(s => s.ad == null || s.ad === '')
    .map(s => ({ d: s.added }));

  return {
    generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    meta: {
      locationId: LOCATION, va_calendar_id: VA_CAL_ID, t65_calendar_id: T65_CAL_ID,
      va_events: va.length, t65_events: t65.length,
      va_booking_contacts: vaB.booked.size, t65_booking_contacts: t65B.booked.size,
      total_sales: attributedSales + unattributedSales.length,
      attributed_sales: attributedSales, unattributed_sales: unattributedSales.length,
      revenue_projected: Math.round(revProj * 100) / 100,
      revenue_confirmed: Math.round(revConf * 100) / 100,
      revenue_clients_matched: revMatched, revenue_match_phone: matchPhone, revenue_match_name: matchName,
      production_clients: production.clients, revenue_connected: production.connected,
      revenue_date_basis: 'sale (App Date)',
      revenue_source: 'Ad Tracking For Rev tab (phone-first, name fallback); revenue & sales filtered by App Date',
    },
    activeAds: readConfig().activeAds || [],
    ads, contacts, unattributedSales,
  };
}

export async function build() {
  if (!TOKEN) throw new Error('GHL_API_TOKEN is not set (a GoHighLevel Private Integration token). See README / header of this file.');
  const start = new Date((process.env.START || '2024-01-01') + 'T00:00:00Z').getTime();
  const end = new Date((process.env.END || '2026-12-31') + 'T23:59:59Z').getTime();
  console.error('Fetching contacts with Ad Creative…');
  const adContacts = await fetchAdContacts();
  console.error('Fetching sale contacts…');
  const saleContacts = await fetchSaleContacts();
  console.error('Fetching VA calendar events…');
  const va = await fetchEvents(VA_CAL_ID, start, end);
  console.error('Fetching Turning 65 calendar events…');
  const t65 = await fetchEvents(T65_CAL_ID, start, end);
  console.error(process.env.PRODUCTION_CSV_URL ? 'Fetching production sheet (revenue)…' : 'PRODUCTION_CSV_URL not set — skipping revenue.');
  const production = await fetchProduction();
  console.error((process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID) ? 'Fetching Meta ad spend…' : 'Using committed Meta spend snapshot (set META_ACCESS_TOKEN + META_AD_ACCOUNT_ID for live).');
  const spend = await loadSpend();

  const data = mergeSpend(build2(adContacts, saleContacts, va, t65, production), spend);
  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync('./data/dashboard_data.json', JSON.stringify(data));
  fs.writeFileSync('./dashboard.html', renderDoc(data));
  console.error(`Spend: $${data.meta.spend_total} across ${data.spend.length} ad-days (${data.meta.spend_connected ? 'connected' : 'none'}).`);
  console.error(`\nDone. ${data.contacts.length} ad leads · ${data.meta.total_sales} sales `
    + `(${data.meta.attributed_sales} attributed) · revenue ${data.meta.revenue_connected
      ? `$${data.meta.revenue_confirmed} confirmed / $${data.meta.revenue_projected} projected (${data.meta.revenue_clients_matched} clients matched)`
      : 'not connected (set PRODUCTION_CSV_URL)'}`);
  console.error('Wrote dashboard.html and data/dashboard_data.json');
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(err => { console.error('\n' + err.message); process.exit(1); });
}
