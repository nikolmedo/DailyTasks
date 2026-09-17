# Architecture — scheduling, merging, sync

Load when changing *what is active*, *what comes next*, *how events are expanded*, or
*when hardware is touched*. See [AGENTS.md](../../AGENTS.md) for the shared invariants.

---

## agenda.js — the single source of truth

Everything about "what is happening" resolves here. Exported surface:

| Function | Contract |
|---|---|
| `buildAgenda(dt, {includeDone=false})` | All slots for the local day containing `dt`. Sorted: timed before all-day, then start, then name. |
| `snapshot(timezone)` | `{now, nowMinutes, currentTime, date, timezone, slots, active, next, progress, remaining}` |
| `pickActiveSlot(slots, nowMinutes)` | Overlap resolution (see below) |
| `findNextSlot(now, todaySlots)` | Next timed slot today, else the first timed slot tomorrow with `isTomorrow: true` |
| `isSlotActive` / `slotProgress` / `slotRemaining` | Per-slot predicates, midnight-aware |
| `timeToMinutes` / `minutesToTime` / `dayOfWeek` / `isTaskActiveOnDay` | Helpers |

**Day-of-week encoding:** the DB stores `0=Sunday … 6=Saturday`; Luxon uses
`1=Monday … 7=Sunday`. `dayOfWeek()` bridges them with `dt.weekday % 7`. Do not
open-code this conversion anywhere else.

### Slot shape

Tasks and calendar events are normalised into one object so downstream code never
branches on origin except for labelling. Full field list in
[data-model.md](data-model.md#slot-object).

### Overlap resolution (`pickActiveSlot`)

1. Keep only slots running at `nowMinutes`.
2. If any are timed, **discard all-day slots** — a concrete appointment beats a backdrop.
3. Among the survivors, **latest start wins** (the thing you just walked into).
4. Tie-break on shortest remaining time (the more specific slot).

### Midnight crossing

A task whose `end_time < start_time` (e.g. `23:00 → 01:00`) gets `crossesMidnight: true`.
Active/progress/remaining then shift the window by +1440 minutes when `nowMinutes` is on
the morning side. Calendar events never cross midnight — they are clamped per day
instead (`continuesBefore` / `continuesAfter` flags mark the truncation).

### All-day semantics

- All-day **task**: `startMinutes = 0`, `endMinutes = 1440`; progress tracks the whole day.
- All-day **event**: same, plus multi-day events spanning the whole local day are treated
  as all-day (`spansWholeDay`).

---

## scheduler.js — the clock

`node-cron` `* * * * *` → `schedulerTick({force})`:

1. Read config (timezone, brightness).
2. `agenda.snapshot(timezone)`.
3. LED: only touched when **colour or brightness changed** (or `force`).
4. Log line only when the active slot's `key` changed.
5. e-ink: `displayController.showSnapshot()` **every tick** — the frame carries a live
   clock and progress bar; the display controller decides whether a refresh is actually
   needed (frame hashing, below).

`forceUpdate({force})` is the hook every mutation uses. `force: true` (config changes,
`POST /api/refresh`) pushes a full refresh even if nothing changed; plain `forceUpdate()`
just re-evaluates.

`getStatus()` builds the `/api/status` payload from a fresh snapshot — the panel and the
device can therefore never disagree.

Module state that survives ticks: `lastActiveKey`, `lastLedColor`, `lastBrightness`,
`lastSnapshot`. All reset only by process restart.

---

## display-controller.js — payload + refresh policy

`buildPayload(snapshot, config, task)` → the renderer payload documented in
[eink.md](eink.md#payload-contract). It handles 12/24-hour formatting, duration strings
(`formatDuration`) and the human day-range label for all-day tasks (`formatDayRange`,
e.g. `Mon - Fri`, `All days`).

**Queue.** `renderFrame(payload, opts)` never blocks: one render at a time, and a newer
frame replaces a queued one (the superseded promise resolves with `mode: 'skipped'`).
The payload is written to `database/display_payload.json` and passed to Python as a file
path — nothing is interpolated into a shell command.

**Refresh decision** (`pump()`):

| Condition | Result |
|---|---|
| `force` | full refresh |
| frame hash identical to last pushed | **no push at all** |
| only clock / progress / remaining changed, and `partialsSinceFull < 20` | partial refresh (~0.5 s, no flash) |
| otherwise | full refresh (~2–3 s, flashes, resets the partial counter) |

Hashes are SHA-1 over the payload minus `output` / `push` / `mode`; the "content" hash
additionally drops `clock`, `progress`, `remainingText`.

---

## led-controller.js

- `checkLEDHardware()` probes the SDK **once** and caches the answer.
- `setLED("r,g,b", brightness)` scales each channel by `brightness/100` and runs
  `led.set_color_all(r,g,b)`; `turnOffLED()` runs `led.turn_off_all()`.
- Same single-slot queue idea as the display: `runLedCommand` stores the newest snippet,
  `pumpLed` drains it one process at a time.
- **After any hardware error the controller latches off** (`ledHardwareAvailable = false`)
  and stops retrying until the process restarts. If you are debugging "the LED stopped
  working", check for an earlier error in the log before assuming the colour logic.

---

## calendar-sync.js

| Constant | Value | Meaning |
|---|---|---|
| `WINDOW_BACK_DAYS` / `WINDOW_FORWARD_DAYS` | 2 / 21 | expansion window around now |
| `MAX_FEED_BYTES` | 8 MB | feed size guard |
| `MAX_OCCURRENCES` | 2000 | per-feed occurrence cap |
| `FETCH_TIMEOUT_MS` | 20 000 | download timeout |

Flow: `normalizeUrl` (accepts `webcal://`, requires http/https) → `fetchIcs` (validates
`BEGIN:VCALENDAR`) → `expandFeed` (ical-expander, `maxIterations: 1000`, dedupes
`uid|start_utc` so an override does not double an occurrence) → `db.replaceCalendarEvents`
(transactional delete + insert) → `db.setCalendarSyncResult` (stamp, error, count).

- `probe(url)` validates a feed before subscribing and lifts `X-WR-CALNAME` as the default name.
- `syncAll()` is re-entrant-safe: a concurrent call returns `[]` rather than stacking.
- `startSync()` re-reads `calendar_sync_minutes` on **every** tick, so interval changes
  take effect after the current sleep; first pass runs 5 s after boot.
- Sync failures are stored per calendar (`last_error`) and surfaced in the panel; the
  cached events from the previous successful sync stay in place.

---

## server.js

Express, `cors()`, JSON body limit `128kb`, static `frontend/` plus `/locales`.
Unknown `/api/*` paths return JSON 404 (they must not fall through to the SPA); every
other path serves `index.html`.

Validation helpers at the top: `TIME_REGEX` (`HH:MM`, 24 h), `COLOR_REGEX` (`r,g,b`),
`validateTask(body)`. Route-level rules and the full contract live in [api.md](api.md).

Graceful shutdown on SIGINT/SIGTERM: stop scheduler → stop sync → close server → close DB,
with a 3 s hard exit fallback.
