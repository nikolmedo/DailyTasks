# REST API contract

Every route lives in `backend/server.js`. Base URL `http://localhost:5000`.
The frontend calls the API with a relative base (`const API = '.'`), so the app works
unchanged behind a reverse-proxy sub-path.

**Envelope.** Every response is `{ success: boolean, ... }`:

```jsonc
{ "success": true,  "data": <payload> }          // 2xx
{ "success": false, "error": "human message" }   // 4xx / 5xx
```

Errors: `400` validation, `404` unknown id or unknown `/api/*` path, `409` duplicate
calendar URL, `500` unexpected. Any handler throwing returns `500` with `error.message`.

---

## Tasks

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/tasks` | All tasks, ordered `done ASC, start_time ASC` |
| `GET` | `/api/tasks/:id` | Single task, 404 if missing |
| `POST` | `/api/tasks` | Create → `201` with the stored row |
| `PUT` | `/api/tasks/:id` | Full replace (all fields required, same validation as POST) |
| `PATCH` | `/api/tasks/:id/done` | Toggles `done`, returns the updated row |
| `DELETE` | `/api/tasks/:id` | **Echoes the deleted row back** so the client can offer undo without a second request |

Request body (POST/PUT):

```jsonc
{
  "name": "Deep work",        // required, trimmed, ≤ 120 chars
  "start_time": "09:15",      // required, /^([0-1]\d|2[0-3]):[0-5]\d$/
  "end_time": "11:30",        // required, same regex; earlier than start ⇒ crosses midnight
  "led_color": "90,209,196",  // optional, /^\d{1,3},\d{1,3},\d{1,3}$/, or the string "null"
  "active_days": "1,2,3,4,5", // optional CSV of 0..6 (0=Sunday); empty ⇒ every day
  "all_day": false            // truthy ⇒ stored as 1; start/end are still required by validation
}
```

Validation messages (exact strings, asserted by nothing — safe to reword, but keep them
in English): missing name, name too long, missing times, invalid time format, invalid
LED colour, invalid `active_days`.

All four mutating routes call `scheduler.forceUpdate()` before responding.

---

## Calendars

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/calendars` | `{ data: calendars[], sync: { syncing, lastSyncAt } }` |
| `POST` | `/api/calendars` | Subscribe. Normalises the URL, rejects duplicates (`409`), **probes the feed before storing**, then performs a first sync. `201` |
| `PUT` | `/api/calendars/:id` | Rename / recolour / enable-disable. Omitted fields keep their current value |
| `DELETE` | `/api/calendars/:id` | Unsubscribes and drops the cached events (FK cascade + explicit delete) |
| `POST` | `/api/calendars/sync` | Force-sync every enabled calendar → `{ data: results[], calendars: [...] }` |

POST body: `{ "url": "...", "name": "optional", "led_color": "r,g,b" | "null" }`.
`url` accepts `https://`, `http://` and `webcal://` (rewritten to https). A failed probe
returns `400 Could not read the calendar: <reason>`. When `name` is omitted the feed's
`X-WR-CALNAME` is used, falling back to `"Google Calendar"`.

Per-calendar sync result: `{ id, name, ok, count, error? }`.

---

## Agenda, config, device

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/agenda?date=YYYY-MM-DD` | Merged day. Defaults to today in the configured zone. Invalid date ⇒ `400`. Includes done tasks (`includeDone: true`) |
| `GET` | `/api/config` | Flat `{ key: value }` map, all values are strings |
| `PUT` | `/api/config` | Partial update; every supplied key is validated then written. Calls `forceUpdate()` **unforced**, so a brightness change drives the LED without a full e-ink flash (the panel still redraws when its frame changes, e.g. language) |
| `GET` | `/api/status` | The device snapshot (below) |
| `GET` | `/api/display/preview.png` | The exact frame last rendered for the panel. `Cache-Control: no-store`; `404` before the first render |
| `POST` | `/api/refresh` | Full refresh of display + LED |
| `GET` | `/api/health` | `{ success, status: "ok", timestamp }` |
| `GET` | `/api/events` | Server-Sent Events stream of change notifications (below) |

`GET /api/agenda` response: `{ data: { date, timezone, slots: Slot[] } }`.

`PUT /api/config` validation — anything out of range is a `400`, nothing is partially applied
after the first failure:

| Key | Rule |
|---|---|
| `brightness` | integer 0–100 |
| `time_format` | `"12"` or `"24"` |
| `language` | member of `i18n.SUPPORTED` (`es`, `en`) |
| `timezone` | any IANA id Luxon accepts |
| `calendar_sync_minutes` | integer 5–180 |

`GET /api/status` → `data`:

```jsonc
{
  "currentTime": "14:06",            // HH:MM in the configured zone
  "date": "2026-09-17",
  "timezone": "Asia/Tokyo",
  "activeTask": Slot | null,         // may be a task or a calendar event
  "nextTask": (Slot & {isTomorrow}) | null,
  "progress": 0.51,                  // 0..1
  "remainingMinutes": 54,
  "agenda": Slot[],                  // the whole day
  "schedulerRunning": true,
  "ledAvailable": true,
  "epoch": 1790290634541,            // server Date.now(); the panel ticks its clock from it
  "device": {
    "led": { "on": true, "color": "0,30,255", "brightness": 80 },   // last value sent to the LED
    "display": { "lastRenderAt": ISO | null, "lastPushAt": ISO | null } // PNG written / panel changed
  }
}
```

`GET /api/events` — `text/event-stream`. Each message is `event: <topic>` with
`data: {"topic", "at", ...}`; clients re-fetch the matching resource, no payload travels.
Topics come from `backend/events.js`: `status` (every scheduler tick), `tasks`, `calendars`
(mutations and finished syncs), `config`, `frame` (new preview PNG). A `: ping` comment is
sent every 25 s. Emit a topic with `events.emit(topic)` when you add a mutation.

`Slot` is documented in [data-model.md](data-model.md#slot-object).

---

## Adding an endpoint

1. Put the route next to its siblings in `server.js`, under the matching section comment.
2. Validate first, act second; return the envelope shape above.
3. Call `scheduler.forceUpdate()` if the change can alter what is active now.
4. Keep DB access in `database.js` as a prepared statement — no inline SQL in routes.
5. If the panel consumes it, add the call to the fetch layer in `frontend/app.js`
   (`api()` helper) rather than calling `fetch` directly.
