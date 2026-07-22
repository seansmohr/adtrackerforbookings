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
const parseMoney = s => { const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };

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

// Read the Master Production Sheet as a published CSV and build a
// normalized-name -> { proj, conf } revenue map. Sums multiple policies per client.
// Set PRODUCTION_CSV_URL to the "Publish to web -> CSV" URL of the tab that exposes
// the client name + projected + confirmed revenue columns. Column headers are matched
// case-insensitively; override with PRODUCTION_CLIENT_COL / PRODUCTION_PROJECTED_COL /
// PRODUCTION_CONFIRMED_COL if your headers differ.
async function fetchProduction() {
  const url = process.env.PRODUCTION_CSV_URL;
  if (!url) return { map: new Map(), clients: 0, connected: false };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`production sheet ${res.status} ${res.statusText}`);
  const rows = parseCSV(await res.text());
  const wantClient = (process.env.PRODUCTION_CLIENT_COL || 'client').toLowerCase();
  const wantProj = (process.env.PRODUCTION_PROJECTED_COL || 'projected rev').toLowerCase();
  const wantConf = (process.env.PRODUCTION_CONFIRMED_COL || 'revenue').toLowerCase();
  // Find the header row (the one that contains the client column).
  let hi = -1, cols = null;
  for (let i = 0; i < rows.length; i++) {
    const lc = rows[i].map(x => (x || '').trim().toLowerCase());
    if (lc.includes(wantClient) && (lc.includes(wantProj) || lc.includes(wantConf))) {
      hi = i; cols = lc; break;
    }
  }
  if (hi < 0) throw new Error('production sheet: could not find header row (client/revenue columns)');
  const ci = cols.indexOf(wantClient);
  const pi = cols.indexOf(wantProj);
  const fi = cols.indexOf(wantConf);
  const map = new Map();
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; const name = normName(r[ci]);
    if (!name || name === wantClient) continue;
    const proj = pi >= 0 ? parseMoney(r[pi]) : 0;
    const conf = fi >= 0 ? parseMoney(r[fi]) : 0;
    if (!proj && !conf) continue;
    const cur = map.get(name) || { proj: 0, conf: 0 };
    cur.proj += proj; cur.conf += conf; map.set(name, cur);
  }
  return { map, clients: map.size, connected: true };
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

function build2(adContacts, saleContacts, va, t65, production) {
  const vaB = bookingSets(va), t65B = bookingSets(t65);
  const ads = [], adIdx = new Map();
  const contacts = [];
  let attributedSales = 0, revProj = 0, revConf = 0, revMatched = 0;
  for (const [cid, info] of adContacts) {
    const sale = info.appt && info.appt.toLowerCase().includes('sale') ? 1 : 0;
    if (sale) attributedSales++;
    if (!adIdx.has(info.ad)) { adIdx.set(info.ad, ads.length); ads.push(info.ad); }
    const rev = production.map.get(info.name);
    const pr = rev ? Math.round(rev.proj * 100) / 100 : 0;
    const cr = rev ? Math.round(rev.conf * 100) / 100 : 0;
    if (rev) { revMatched++; revProj += pr; revConf += cr; }
    contacts.push({
      a: adIdx.get(info.ad), d: info.added,
      va: vaB.booked.has(cid) ? 1 : 0, vs: vaB.showed.has(cid) ? 1 : 0,
      t: t65B.booked.has(cid) ? 1 : 0, ts: t65B.showed.has(cid) ? 1 : 0, s: sale,
      pr, cr,
    });
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
      revenue_clients_matched: revMatched, production_clients: production.clients,
      revenue_connected: production.connected,
      revenue_source: 'Master Production Sheet (Client name -> Projected + Confirmed revenue)',
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

  const data = build2(adContacts, saleContacts, va, t65, production);
  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync('./data/dashboard_data.json', JSON.stringify(data));
  fs.writeFileSync('./dashboard.html', renderDoc(data));
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
