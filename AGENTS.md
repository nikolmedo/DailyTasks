# AGENTS.md — agent entrypoint

Machine-oriented context for this repository. **Read this file first, then load only
the reference page you need** (routing table below). The whole set is ~1/10 the tokens
of reading the source.

Written for agents, not humans. Humans: see [README.md](README.md).

---

## 1. What this is, in one paragraph

`daily-tasks` is a single-device scheduling appliance for **Distiller** hardware
(Raspberry Pi based). A Node/Express server keeps a day's agenda in SQLite, merges it
with read-only iCal calendar subscriptions, and every minute drives two outputs: an
**RGB LED** (colour of whatever is running now) and a **250×128 1-bit e-ink panel**
(HUD with title, time range, progress, next item). A vanilla-JS web panel on port
**5000** is the control surface and mirrors the e-ink frame live.

No build step. No bundler. No framework. No test suite. No TypeScript.

---

## 2. Facts you will need on almost any task

| Fact | Value |
|---|---|
| Server entry | `backend/server.js`, `PORT` env, default **5000** |
| Start | `bash start.sh` (runs `PORT=5000 node backend/server.js`) |
| Restart after backend edits | **Required and manual** — no systemd unit, no watcher |
| Frontend edits | No restart, no build — just reload the browser |
| DB | `database/tasks.db`, SQLite via `better-sqlite3`, WAL, foreign keys ON |
| Schema creation + migrations | `backend/database.js` → `initDatabase()` |
| Timezone | Always from the `config.timezone` row, never the host clock |
| Language | `config.language` (`es` \| `en`), default `es` |
| Hardware Python | `/opt/distiller-sdk/.venv/bin/python3`, `PYTHONPATH=/opt/distiller-sdk/src` |
| Version control | **This directory is not a git repo.** Edits are unrecoverable — do not mass-rewrite files |
| Protected ports (never kill) | 3000, 3005, 8080, 48081 — killing them ends the agent session |

---

## 3. Runtime data flow

```
                    ┌──────────────────────────────────────────┐
  iCal feeds ──────▶│ calendar-sync.js   (timer, 5–180 min)    │
  (read-only)       │  fetch → ical-expander → calendar_events │
                    └───────────────┬──────────────────────────┘
                                    │  cached occurrences
  web panel ──REST──▶ server.js ───▶│                    ┌──────────────┐
   (frontend/)       (mutations     ▼                    │ tasks table  │
                      call          agenda.js  ◀─────────┴──────────────┘
                      forceUpdate)  buildAgenda() → slots[]
                                    snapshot()   → {active, next, progress, remaining}
                                        │
                        ┌───────────────┴────────────────┐
                        ▼                                ▼
                 led-controller.js              display-controller.js
                 (queued, 1 slot)               buildPayload() → render_display.py
                        │                                │
                      RGB LED                    e-ink panel + database/display_temp.png
                                                        (served as /api/display/preview.png)
```

`scheduler.js` is the clock: `node-cron` `* * * * *` → `schedulerTick()` → the two
controllers. Every API mutation additionally calls `scheduler.forceUpdate()` so the
device never lags the panel.

---

## 4. Invariants — breaking these breaks the product

1. **`agenda.js` is the single source of truth.** The scheduler, `/api/status` and
   `/api/agenda` all read from it. Never compute "what is active now" anywhere else.
2. **Hardware is never driven inline with an HTTP request.** Both controllers own a
   single-slot queue: a newer frame/colour replaces a queued one. Keep API latency in
   milliseconds.
3. **Every user-facing string is translated twice**: `locales/{es,en}.json` (backend +
   e-ink) and the inline `CATALOGS` in `frontend/i18n.js` (panel). Adding one and not
   the other ships a raw key to the UI.
4. **The e-ink frame is 250×128 and strictly 1-bit.** No greys, no anti-aliased fills —
   depth comes from ordered dither patterns. Text must pass through `fit_line()` /
   `fit_block()`; nothing may be clipped.
5. **Full e-ink refreshes are expensive (~2–3 s and they flash).** Only content changes
   earn one; clock/progress ticks ride partial refreshes, with a forced full refresh
   every 20 partials to clear ghosting.
6. **Calendar subscriptions are read-only.** Nothing is ever written back to Google.
   There is no OAuth, no token, no Google Cloud project — only an `.ics` URL.
7. **Times inside a day are integer minutes since local midnight** (`startMinutes`,
   `endMinutes`, 0–1440). `HH:MM` strings are for storage and display only.
8. **Calendar events are stored in UTC ISO**, except all-day events which are pinned to
   UTC midnight as bare dates and converted with `keepLocalTime`.

---

## 5. Routing table — what to read for what task

| Your task | Read |
|---|---|
| Add/change a REST endpoint, request/response shape, validation | [docs/agents/api.md](docs/agents/api.md) |
| Touch the DB, add a config key, understand a `slot` object | [docs/agents/data-model.md](docs/agents/data-model.md) |
| Change scheduling, overlap resolution, midnight/all-day logic, calendar sync | [docs/agents/architecture.md](docs/agents/architecture.md) |
| Change the web panel: rendering, DOM ids, i18n, shortcuts, styling | [docs/agents/frontend.md](docs/agents/frontend.md) |
| Change the e-ink layout or renderer, preview a frame without hardware | [docs/agents/eink.md](docs/agents/eink.md) |
| Do a common chore end to end (add a field, a string, an endpoint, a language) | [docs/agents/recipes.md](docs/agents/recipes.md) |
| Debug LED / e-ink / sync / port problems | [docs/agents/troubleshooting.md](docs/agents/troubleshooting.md) |

Each page is self-contained; you should not need to open the source to plan a change,
only to make it.

---

## 6. File map

```
backend/
  server.js             Express app, all routes, payload validation, static serving
  database.js           schema, migrations, prepared statements, exported CRUD
  agenda.js             tasks + events → slots; active/next/progress resolution
  scheduler.js          cron tick, change detection, drives both controllers
  calendar-sync.js      iCal fetch, recurrence expansion, cache replacement
  led-controller.js     RGB LED, hardware probe, coalescing queue
  display-controller.js e-ink payload building, frame hashing, render queue
  render_display.py     PIL renderer for the 1-bit HUD + SDK push
  i18n.js               backend t(key, lang, vars)
frontend/
  index.html            full markup; every control has a stable id
  app.js                state, fetch layer, renderers, sheets, shortcuts
  i18n.js               bundled es/en catalogs + data-i18n* application
  styles.css            design tokens + all components
locales/
  es.json / en.json     backend + e-ink strings
  timezones.json        curated IANA list — dead file, no code reads it; the picker uses
                        the TIMEZONES const in frontend/app.js
database/
  tasks.db              SQLite
  display_temp.png      last rendered frame (served as the live preview)
  display_payload.json  last payload handed to the renderer (useful for debugging)
docs/agents/            these reference pages
docs/images/            README screenshots
```

---

## 7. Behavioural rules for agents working here

- **Restart the server yourself after backend changes** (`bash start.sh`), and say so.
  The user expects the app to be left running.
- **Never kill processes on the protected ports** in §2. To stop this app, find its PID
  by matching `backend/server.js`, not by a broad `pkill -f node`.
- **Don't add dependencies casually.** The runtime is deliberately six packages
  (`express`, `cors`, `better-sqlite3`, `node-cron`, `ical-expander`, `luxon`).
- **Write code and comments in English**, matching the existing JSDoc style: a short
  block comment on exported functions explaining *why*, not *what*.
- **Never invent Google OAuth.** Calendars are iCal URLs (see invariant 6).
- **The user's real DB contains personal data.** For demos/screenshots, copy the app to
  a scratch directory and seed a separate database — do not mutate `database/tasks.db`.
