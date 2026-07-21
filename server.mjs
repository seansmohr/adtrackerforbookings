#!/usr/bin/env node
// server.mjs — serves the Ad Creative Performance dashboard on Railway (or anywhere).
//
// Always serves the committed snapshot in dashboard.html. If GHL_API_TOKEN is set,
// it also refreshes the data from GoHighLevel on boot and every REFRESH_HOURS
// (default 6), and exposes POST /refresh to rebuild on demand.
//
// Env:
//   PORT            provided by Railway (defaults to 3000 locally)
//   GHL_API_TOKEN   optional — enables live refresh (see README)
//   REFRESH_HOURS   optional — auto-refresh interval, default 6, set 0 to disable

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const REFRESH_HOURS = process.env.REFRESH_HOURS != null ? Number(process.env.REFRESH_HOURS) : 6;

let lastRefresh = null;
let refreshing = false;

async function refresh(reason) {
  if (!process.env.GHL_API_TOKEN) return { ok: false, skipped: 'no GHL_API_TOKEN set' };
  if (refreshing) return { ok: false, skipped: 'already refreshing' };
  refreshing = true;
  try {
    const { build } = await import('./build-dashboard.mjs');
    const data = await build();
    lastRefresh = new Date().toISOString();
    console.log(`[refresh:${reason}] ok — ${data.totals.leads} leads, ${data.totals.appts} appts, ${data.totals.sales} sales`);
    return { ok: true, generatedAt: data.generatedAt };
  } catch (err) {
    console.error(`[refresh:${reason}] failed — ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    refreshing = false;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function serveFile(res, rel) {
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return send(res, 404, 'Not found');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (p === '/' || p === '/index.html' || p === '/dashboard.html') return serveFile(res, 'dashboard.html');
  if (p === '/data/dashboard_data.json') return serveFile(res, 'data/dashboard_data.json');

  if (p === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, lastRefresh, refreshEnabled: !!process.env.GHL_API_TOKEN }), TYPES['.json']);
  }
  if (p === '/refresh' && req.method === 'POST') {
    const result = await refresh('manual');
    return send(res, result.ok ? 200 : 503, JSON.stringify(result), TYPES['.json']);
  }

  return send(res, 404, 'Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ad dashboard listening on :${PORT}`);
  // Refresh on boot (non-blocking) and then on an interval, if a token is configured.
  if (process.env.GHL_API_TOKEN) {
    refresh('boot');
    if (REFRESH_HOURS > 0) setInterval(() => refresh('interval'), REFRESH_HOURS * 3600 * 1000);
  } else {
    console.log('GHL_API_TOKEN not set — serving committed snapshot only (set it in Railway to enable live refresh).');
  }
});
