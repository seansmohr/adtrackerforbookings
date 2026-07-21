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
server, no build step needed just to view it.

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

## Files

| File | Purpose |
|------|---------|
| `dashboard.html` | The rendered dashboard — open this. |
| `data/dashboard_data.json` | The aggregated numbers behind the dashboard. |
| `build-dashboard.mjs` | Pulls live data from GoHighLevel and regenerates everything. |
| `render.mjs` | Turns aggregated data into the HTML (shared by the build script). |

## Notes

- The date window defaults to `2025-01-01 … 2026-12-31`. Override with
  `START=YYYY-MM-DD END=YYYY-MM-DD` env vars.
- A lead is counted once per ad even if they booked multiple appointments on the
  same calendar, so booking rates never exceed 100%.
- The Appointment Status field lives on the contact, so a "sale" is attributed to the
  ad that generated that contact regardless of which calendar they booked.
