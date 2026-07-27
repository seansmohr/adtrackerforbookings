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
- **Revenue** — projected & confirmed revenue joined from the **Master Production Sheet**
  on client name, attributed back to the ad (see **Revenue** below).
- **Ad spend** — daily spend per ad from **Meta Ads**, matched to the ad by name, which
  powers ROAS, cost-per-lead, and cost-per-sale (see **Ad spend** below).

Open **`dashboard.html`** in any browser. It is a single self-contained file — no
server, no build step needed just to view it. Deployed, it runs as a small web
service (see **Deploying on Railway** below).

## What the dashboard shows

- **Date range** — presets (last 7/30/90 days, this month/quarter, year to date) plus a
  custom From/To. Everything below recomputes for the selected range. Leads, appointments
  and sales are all counted by the **lead's creation date** (a clean cohort view: of the
  leads that came in during this window, how many booked and sold).
- **KPI tiles** — leads, appointments booked (+ % of leads), VA appointments, Turning 65
  appointments, and sales. The Sales tile shows the **total** (e.g. `73`) and splits it into
  *from ads* vs *no ad creative* so it reconciles with GHL's overall sale count.
- **Active ads** — your watchlist of currently-running ads with their live leads/appts/sales.
  Add the exact Ad Creative value from GHL and its counts link automatically; remove with ×.
  Seeded from `config.json` and saved per-browser in localStorage (see **Active ads** below).
- **Which ads to scale** — ads ranked by the metric you choose: **Appt rate**, **Sales**, or
  **Sale rate**. Colored by ad family (Winning / Test / AI Test / Other). "Active ads only"
  and a "min leads" slider cut the noise.
- **Full breakdown** — a sortable, searchable table of every ad creative (★ marks active
  ads), plus a `(No Ad Creative)` row so the sales total reconciles:

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

## Active ads (`config.json`)

`config.json` holds the ads you're currently running:

```json
{ "activeAds": ["Winning Ad Non SAC | Never Free", "AI | Test ad | Still Working 1", ...] }
```

These names must match the **Ad Creative** custom-field value in GHL **exactly** — including
spacing and capitalization — because attribution is a literal string match. The dashboard
flags any active-ad name that matches zero contacts (⚠ on the chip) so typos are easy to spot.

Two ways to manage the list:

- **In the browser** (fastest) — use the *Active ads* panel to add/remove. Changes save to
  that browser's localStorage. Good for launching a new test ad and watching it immediately.
- **In the repo** (shared defaults) — edit `config.json` and redeploy. This is what everyone
  sees before they make personal tweaks, and what a fresh browser starts from.

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
| `PRODUCTION_CSV_URL` | optional — published-CSV URL of the production sheet, to attribute revenue (see **Revenue** below) |

With a token set, the service pulls fresh data on boot and every `REFRESH_HOURS`,
and `POST /refresh` forces an immediate rebuild. Without one, it just serves the
snapshot — deploys never fail for a missing token.

## Revenue (Master Production Sheet)

The dashboard can attribute **projected and confirmed revenue** to each ad by joining
GHL leads to the production sheet. It matches **by phone number first** (last 10 digits,
so `+1…` vs `1…` vs `(…)` all match) and falls back to **client full name**. A sold
lead's revenue is the sum of their policy rows (a client with two policies gets both).

- **Confirmed Revenue** = sum of the sheet's confirmed-revenue column (col **I**, "Revenue").
- **Projected Revenue** = sum of the projected-revenue column (col **H**, "Projected Rev").

Revenue shows up as two KPI tiles, `Conf $` / `Proj $` columns in the table, a
`Confirmed $` and `$ / lead` option on the "which ads to scale" chart, and a "Most
revenue" callout. Phone matching is exact on the last 10 digits; the name fallback is
case-insensitive with punctuation stripped and is **name-order sensitive** ("First Last").

### Connecting it (published CSV)

The live refresh reads the sheet as a published CSV — no Google auth needed:

1. In the sheet, **File → Share → Publish to web**.
2. Choose the tab with the revenue rows, format **CSV**, **Publish**, copy the URL.
3. Add it in Railway as `PRODUCTION_CSV_URL`. (Locally: prefix the build command with it.)

The build finds the header row automatically and looks for columns named `Client`,
`Phone Number`, `Projected Rev`, and `Revenue`. If your headers differ, override with
`PRODUCTION_CLIENT_COL`, `PRODUCTION_PHONE_COL`, `PRODUCTION_PROJECTED_COL`,
`PRODUCTION_CONFIRMED_COL`.

> ⚠️ **Privacy — do not publish the raw Production tab.** It contains client emails and
> **Medicare numbers**; "Publish to web" makes that tab public to anyone with the URL.
> Instead add a **helper tab** (e.g. `Ad Revenue Feed`) with just the four columns the
> join needs — `Client`, `Phone Number`, `Projected Rev`, `Revenue` — pulled from
> Production (e.g. an `=FILTER(...)` or `={Production!C2:C, Production!S2:S, …}`), then
> publish **that** tab. The dashboard only needs those fields, and its saved output
> never stores names or phones — only per-ad revenue totals.

## Ad spend (Meta Ads)

Daily ad spend comes from Meta Ads and is matched to each ad **by ad name** (Meta's ad
name equals the GHL "Ad Creative" value, case/space-insensitive). Spend is stored per
day, so it filters by date range like everything else. It drives:

- KPI tiles: **Ad Spend**, **ROAS (confirmed)**, **Cost / Sale**.
- Table columns: **Spend**, **Cost/Lead**, **Cost/Sale**, **ROAS**.
- The "which ads to scale" chart can rank by **ROAS**, **Spend**, or **Cost / lead**.
- **ROAS = confirmed revenue ÷ spend** (projected ROAS shown alongside).

Date basis: spend counts on the **day it was spent**; sales & revenue by **sale date**;
leads & appointments by **arrival date**. Ads that spent but produced no tracked leads
still appear (so wasted spend is visible).

The committed `data/spend_daily.json` is a snapshot pulled from Meta. To refresh spend
live on each rebuild, set two more Railway Variables:

| Variable | Value |
|----------|-------|
| `META_ACCESS_TOKEN` | a Meta (Facebook) Graph API token with `ads_read` on the ad account |
| `META_AD_ACCOUNT_ID` | `1013146170341029` (Mohr Insurance Services) |

With those set, the build pulls daily spend from the Graph API on each refresh; without
them it serves the committed `spend_daily.json` snapshot so spend still shows.

## Files

| File | Purpose |
|------|---------|
| `dashboard.html` | The rendered dashboard — open this. |
| `server.mjs` | Web server for deployment (Railway). Serves the dashboard + optional live refresh. |
| `data/dashboard_data.json` | The aggregated numbers behind the dashboard. |
| `data/spend_daily.json` | Meta ad-spend snapshot (daily, by ad) used when no Meta token is set. |
| `build-dashboard.mjs` | Pulls live data from GoHighLevel and regenerates everything. |
| `render.mjs` | Turns the dataset into the HTML (shared by the build script). |
| `config.json` | Your active-ads list (shared defaults). |
| `railway.json` | Railway build/deploy config. |

## Notes

- The date window defaults to `2025-01-01 … 2026-12-31`. Override with
  `START=YYYY-MM-DD END=YYYY-MM-DD` env vars.
- A lead is counted once per ad even if they booked multiple appointments on the
  same calendar, so booking rates never exceed 100%.
- The Appointment Status field lives on the contact, so a "sale" is attributed to the
  ad that generated that contact regardless of which calendar they booked.
