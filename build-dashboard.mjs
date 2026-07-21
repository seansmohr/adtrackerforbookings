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
      if (ad != null && ad !== '') out.set(c.id, { ad, appt: cf[APPT_FIELD_ID] || null, added: day(c.dateAdded) });
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

async function fetchEvents(calendarId, startMs, endMs) {
  const data = await api(`/calendars/events?calendarId=${calendarId}&startTime=${startMs}&endTime=${endMs}`);
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

function build2(adContacts, saleContacts, va, t65) {
  const vaB = bookingSets(va), t65B = bookingSets(t65);
  const ads = [], adIdx = new Map();
  const contacts = [];
  let attributedSales = 0;
  for (const [cid, info] of adContacts) {
    const sale = info.appt && info.appt.toLowerCase().includes('sale') ? 1 : 0;
    if (sale) attributedSales++;
    if (!adIdx.has(info.ad)) { adIdx.set(info.ad, ads.length); ads.push(info.ad); }
    contacts.push({
      a: adIdx.get(info.ad), d: info.added,
      va: vaB.booked.has(cid) ? 1 : 0, vs: vaB.showed.has(cid) ? 1 : 0,
      t: t65B.booked.has(cid) ? 1 : 0, ts: t65B.showed.has(cid) ? 1 : 0, s: sale,
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

  const data = build2(adContacts, saleContacts, va, t65);
  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync('./data/dashboard_data.json', JSON.stringify(data));
  fs.writeFileSync('./dashboard.html', renderDoc(data));
  console.error(`\nDone. ${data.contacts.length} ad leads · ${data.meta.total_sales} sales `
    + `(${data.meta.attributed_sales} attributed, ${data.meta.unattributed_sales} no ad creative)`);
  console.error('Wrote dashboard.html and data/dashboard_data.json');
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(err => { console.error('\n' + err.message); process.exit(1); });
}
