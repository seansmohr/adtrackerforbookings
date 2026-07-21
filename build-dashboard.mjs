#!/usr/bin/env node
// build-dashboard.mjs — pull live data from GoHighLevel and regenerate the
// Ad Creative Performance dashboard.
//
// Usage:
//   GHL_API_TOKEN=xxx GHL_LOCATION_ID=dTtT96ODx29mbQcdOp0v node build-dashboard.mjs
//
// Optionally override the date window (defaults to 2025-01-01 .. +1 year):
//   START=2025-01-01 END=2026-12-31 node build-dashboard.mjs
//
// Outputs: ./dashboard.html and ./data/dashboard_data.json
//
// Token: create a GoHighLevel *Private Integration* (Settings → Private
// Integrations) for this sub-account with these scopes:
//   View Contacts            (contacts.readonly)
//   View Calendars / Events  (calendars/events.readonly)
//   View Custom Fields       (locations/customFields.readonly)

import fs from 'fs';
import { renderDoc } from './render.mjs';

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
const TOKEN = process.env.GHL_API_TOKEN;
const LOCATION = process.env.GHL_LOCATION_ID || 'dTtT96ODx29mbQcdOp0v';

// Field + calendar IDs discovered for this location. Override via env if they change.
const AD_FIELD_ID   = process.env.GHL_AD_FIELD_ID   || 'JPvtFePRKemKT8SfOn1T';   // "Ad Creative"
const APPT_FIELD_ID = process.env.GHL_APPT_FIELD_ID || 'swdRjiAcFZNMfXztLD0g';   // "Appointment Status"
const VA_CAL_ID     = process.env.GHL_VA_CAL_ID     || 'iDBM1sRSqiZBWhblcGPD';   // "VA Calendar"
const T65_CAL_ID    = process.env.GHL_T65_CAL_ID    || 'jDfKPflpQai5OB0v7m0C';   // "Turning 65 Medicare Call"

const headers = { Authorization: `Bearer ${TOKEN}`, Version: VERSION, Accept: 'application/json' };

async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status} ${res.statusText}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

// Pull every contact that has an Ad Creative set. GHL caps pageLimit at 100.
async function fetchContacts() {
  const out = new Map();
  let page = 1;
  for (;;) {
    const data = await api('/contacts/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId: LOCATION,
        page,
        pageLimit: 100,
        filters: [{ field: `customFields.${AD_FIELD_ID}`, operator: 'exists' }],
      }),
    });
    const contacts = data.contacts || [];
    if (contacts.length === 0) break;
    for (const c of contacts) {
      const cf = {};
      for (const f of c.customFields || []) cf[f.id] = f.value;
      const ad = cf[AD_FIELD_ID];
      if (ad != null && ad !== '') out.set(c.id, { ad, appt: cf[APPT_FIELD_ID] || null });
    }
    process.stderr.write(`\rcontacts: ${out.size}/${data.total || '?'}   `);
    if (data.total && page * 100 >= data.total) break;
    if (page > 500) break; // hard safety
    page++;
  }
  process.stderr.write('\n');
  return out;
}

async function fetchEvents(calendarId, startMs, endMs) {
  const data = await api(`/calendars/events?calendarId=${calendarId}&startTime=${startMs}&endTime=${endMs}`);
  return data.events || [];
}

// distinct contactIds that booked (excluding cancelled/deleted) and that showed
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

function aggregate(contacts, va, t65) {
  const vaB = bookingSets(va), t65B = bookingSets(t65);
  const agg = new Map();
  const blank = () => ({ leads: 0, va: 0, va_showed: 0, t65: 0, t65_showed: 0, sales: 0, appts: 0 });
  for (const [cid, info] of contacts) {
    if (!agg.has(info.ad)) agg.set(info.ad, blank());
    const a = agg.get(info.ad);
    a.leads++;
    const isVa = vaB.booked.has(cid), isT65 = t65B.booked.has(cid);
    if (isVa) a.va++;
    if (vaB.showed.has(cid)) a.va_showed++;
    if (isT65) a.t65++;
    if (t65B.showed.has(cid)) a.t65_showed++;
    if (isVa || isT65) a.appts++;
    if (info.appt && info.appt.toLowerCase().includes('sale')) a.sales++;
  }
  const rows = [...agg.entries()].map(([ad, a]) => ({
    ...a, ad,
    appt_rate: a.leads ? +(100 * a.appts / a.leads).toFixed(1) : 0,
    sale_rate: a.leads ? +(100 * a.sales / a.leads).toFixed(1) : 0,
  })).sort((x, y) => y.leads - x.leads);
  const keys = ['leads', 'va', 'va_showed', 't65', 't65_showed', 'sales', 'appts'];
  const totals = Object.fromEntries(keys.map(k => [k, rows.reduce((s, r) => s + r[k], 0)]));
  return {
    rows, totals,
    meta: {
      va_events: va.length, t65_events: t65.length,
      va_booking_contacts: vaB.booked.size, t65_booking_contacts: t65B.booked.size,
      locationId: LOCATION, va_calendar_id: VA_CAL_ID, t65_calendar_id: T65_CAL_ID,
    },
    generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };
}

export async function build() {
  if (!TOKEN) {
    throw new Error('GHL_API_TOKEN is not set (a GoHighLevel Private Integration token). See README / header of this file.');
  }
  const start = new Date((process.env.START || '2025-01-01') + 'T00:00:00Z').getTime();
  const end = new Date((process.env.END || '2026-12-31') + 'T23:59:59Z').getTime();
  console.error('Fetching contacts…');
  const contacts = await fetchContacts();
  console.error('Fetching VA calendar events…');
  const va = await fetchEvents(VA_CAL_ID, start, end);
  console.error('Fetching Turning 65 calendar events…');
  const t65 = await fetchEvents(T65_CAL_ID, start, end);
  console.error(`VA appts: ${va.length} · T65 appts: ${t65.length}`);

  const data = aggregate(contacts, va, t65);
  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync('./data/dashboard_data.json', JSON.stringify(data, null, 2));
  fs.writeFileSync('./dashboard.html', renderDoc(data));
  console.error(`\nDone. ${data.totals.leads} leads · ${data.totals.appts} appts booked · ${data.totals.sales} sales`);
  console.error('Wrote dashboard.html and data/dashboard_data.json');
  return data;
}

// Run as a CLI only when invoked directly (not when imported by the server).
if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(err => { console.error('\n' + err.message); process.exit(1); });
}
