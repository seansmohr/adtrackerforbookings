# Ad Creative Performance Dashboard

Tracks which Facebook/Meta ad creatives are driving **VA calendar appointments**,
**Turning 65 calendar appointments**, and **sales** — so you know which ads to scale.

Data comes from GoHighLevel:

- **Leads** — contacts that have the **Ad Creative** custom field set. Each distinct
  value of that field is one ad creative.
- **VA appointments** — leads that booked on the **VA Calendar**.
- **Turning 65 appointments** — leads that booked on the **Turning 65 Medicare Call** calendar.
- **Sales** — leads whose **Appointment Status** field contains the word *"Sale"*
  (e.g. `Sale (MA)`, `Sale (MedSupp)`, …).

Open **`dashboard.html`** in any browser. It is a single self-contained file — no
server, no build step needed just to view it. Deployed, it runs as a small web
service (see **Deploying on Railway** below).

## What the dashboard shows

- **KPI tiles** — total leads, appointments booked (and the % of leads that booked),
  VA appointments, Turning 65 appointments, and sales (with % of leads and close rate).
- **Which ads to scale** — appointment booking rate per ad, highest first, colored by
  ad family (Winning / Test / AI Test / Other). A "min leads" slider hides low-volume
  ads so the ranking isn't dominated by ads with only a handful of leads.
- **Full breakdown** — a sortable, searchable table of every ad creative with:

  | Column | Meaning |
  |--------|---------|
  | Leads | Contacts with this Ad Creative value |
  | VA | Distinct leads that booked ≥1 VA appointment |
  | T65 | Distinct leads that booked ≥1 Turning 65 appointment |
  | Appts | Distinct leads that booked on **either** calendar |
  | Appt % | Appts ÷ Leads — booking rate |
  | Showed | Leads that actually attended an appointment |
  | Sales | Leads with an Appointment Status containing "Sale" |
  | Sale % | Sales ÷ Leads |
  | Close % | Sales ÷ Appts booked |

Cancelled and deleted calendar events are excluded from the appointment counts.

## Refreshing with live data

`dashboard.html` and `data/dashboard_data.json` are a snapshot. To pull fresh
numbers from GoHighLevel and regenerate them:

```bash
# 1. install the one dependency used to fetch (Node 18+ has fetch built in;
#    only the browser for `npm run serve` needs installing)
npm install            # optional — only needed for `npm run serve`

# 2. run the build with your GoHighLevel Private Integration token
GHL_API_TOKEN=pit-xxxxxxxx GHL_LOCATION_ID=dTtT96ODx29mbQcdOp0v node build-dashboard.mjs
```

This rewrites `dashboard.html` and `data/dashboard_data.json` in place.

### Getting a token

In GoHighLevel, go to **Settings → Private Integrations → Create new integration**
for this sub-account and grant these read scopes:

- **View Contacts** (`contacts.readonly`)
- **View Calendar Events** (`calendars/events.readonly`)
- **View Custom Fields** (`locations/customFields.readonly`)

Copy the generated token into `GHL_API_TOKEN`. Keep it out of git (it's covered by
`.gitignore` if you put it in a `.env` file).

### IDs this project uses

Discovered for the Mohr Insurance sub-account and hard-coded as defaults in
`build-dashboard.mjs` (override any of them with the matching env var if they change):

| Thing | ID |
|-------|----|
| Location (sub-account) | `dTtT96ODx29mbQcdOp0v` |
| "Ad Creative" field | `JPvtFePRKemKT8SfOn1T` |
| "Appointment Status" field | `swdRjiAcFZNMfXztLD0g` |
| VA Calendar | `iDBM1sRSqiZBWhblcGPD` |
| Turning 65 Medicare Call | `jDfKPflpQai5OB0v7m0C` |

## Deploying on Railway

The repo is a self-contained Node service (zero npm dependencies — it uses only
built-in modules and Node 18+'s global `fetch`). Railway deploys it on every push
to `main`:

1. **New Project → Deploy from GitHub repo** → pick this repo.
2. Railway auto-detects Node (Nixpacks) and runs `npm start`, which starts
   `server.mjs`. `railway.json` pins the start command and a `/health` check.
3. **Generate a domain** under the service's *Settings → Networking*.

The service listens on Railway's `$PORT` and serves:

| Route | What |
|-------|------|
| `GET /` | the dashboard |
| `GET /data/dashboard_data.json` | the aggregated numbers |
| `GET /health` | health check (used by Railway) |
| `POST /refresh` | rebuild the data on demand (needs a token) |

### Live data on Railway (optional)

Out of the box the service serves the committed snapshot. To make it self-update,
add these **service Variables** in Railway:

| Variable | Value |
|----------|-------|
| `GHL_API_TOKEN` | your GoHighLevel Private Integration token (see below) |
| `GHL_LOCATION_ID` | `dTtT96ODx29mbQcdOp0v` (already the default) |
| `REFRESH_HOURS` | optional, default `6` — auto-refresh interval; `0` disables |

With a token set, the service pulls fresh data on boot and every `REFRESH_HOURS`,
and `POST /refresh` forces an immediate rebuild. Without one, it just serves the
snapshot — deploys never fail for a missing token.

## Files

| File | Purpose |
|------|---------|
| `dashboard.html` | The rendered dashboard — open this. |
| `server.mjs` | Web server for deployment (Railway). Serves the dashboard + optional live refresh. |
| `data/dashboard_data.json` | The aggregated numbers behind the dashboard. |
| `build-dashboard.mjs` | Pulls live data from GoHighLevel and regenerates everything. |
| `render.mjs` | Turns aggregated data into the HTML (shared by the build script). |
| `railway.json` | Railway build/deploy config. |

## Notes

- The date window defaults to `2025-01-01 … 2026-12-31`. Override with
  `START=YYYY-MM-DD END=YYYY-MM-DD` env vars.
- A lead is counted once per ad even if they booked multiple appointments on the
  same calendar, so booking rates never exceed 100%.
- The Appointment Status field lives on the contact, so a "sale" is attributed to the
  ad that generated that contact regardless of which calendar they booked.
