# Data model

SQLite at `database/tasks.db` (WAL, `foreign_keys = ON`). All access goes through
prepared statements in `backend/database.js`; routes never write SQL.

---

## Tables

```sql
CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  start_time   TEXT NOT NULL,                     -- "HH:MM", 24h
  end_time     TEXT NOT NULL,                     -- "HH:MM"; < start_time ⇒ crosses midnight
  led_color    TEXT,                              -- "r,g,b" | NULL | the literal string "null"
  active_days  TEXT DEFAULT '0,1,2,3,4,5,6',      -- CSV, 0=Sunday … 6=Saturday
  all_day      INTEGER DEFAULT 0,
  done         INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE calendars (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,              -- iCal feed (https, or webcal rewritten)
  led_color    TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_sync    DATETIME,                          -- ISO string, set on success *and* failure
  last_error   TEXT,                              -- NULL when the last sync succeeded
  event_count  INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE calendar_events (                    -- cache of expanded occurrences
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id  INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  uid          TEXT NOT NULL,                     -- source VEVENT uid (not unique: recurrences)
  title        TEXT NOT NULL,                     -- trimmed to 200 chars, "—" when empty
  location     TEXT,                              -- trimmed to 200 chars
  description  TEXT,                              -- trimmed to 2000 chars; may be HTML (Google)
  start_utc    TEXT NOT NULL,                     -- ISO UTC; all-day ⇒ bare date at UTC midnight
  end_utc      TEXT NOT NULL,                     -- iCalendar DTEND is exclusive
  all_day      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_window   ON calendar_events (start_utc, end_utc);
CREATE INDEX idx_events_calendar ON calendar_events (calendar_id);

CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

### `config` keys

| Key | Default | Range / values |
|---|---|---|
| `brightness` | `100` | `0`–`100` (LED only; scales each RGB channel) |
| `timezone` | `America/Los_Angeles` | any IANA id |
| `time_format` | `24` | `24` \| `12` |
| `language` | `es` | `es` \| `en` |
| `calendar_sync_minutes` | `15` | `5`–`180` |

All values are stored and returned as **strings** — parse before comparing numerically.
Defaults are inserted with `INSERT OR IGNORE` on every boot, so a missing key heals itself.

### Migrations

`initDatabase()` creates tables `IF NOT EXISTS`, then replays additive `ALTER TABLE`s
through the `migrate(sql, label)` helper, which swallows only `duplicate column name`.
**To add a column: add both the `CREATE TABLE` field and a `migrate()` line** — existing
installations only get the latter.

---

## Slot object

Produced by `agenda.js`; consumed by the scheduler, the e-ink payload builder, the API
and the frontend. The shared fields are identical for both origins so downstream code
does not branch except for labels.

| Field | Type | Notes |
|---|---|---|
| `key` | `"task:<id>"` \| `"event:<id>"` | Stable identity; change detection compares these |
| `id` | number | Row id in its own table |
| `source` | `"task"` \| `"calendar"` | |
| `name` | string | Task name or event title |
| `all_day` | boolean | All-day task, all-day event, or an event covering the whole local day |
| `led_color` | `"r,g,b"` \| null | Task colour, or the parent calendar's colour |
| `done` | boolean | Always `false` for events |
| `start_time` / `end_time` | `"HH:MM"` | Display values; all-day ⇒ `00:00` / `23:59` |
| `startMinutes` / `endMinutes` | number | Minutes since local midnight, 0–1440. **The values logic uses** |
| `crossesMidnight` | boolean | Tasks only |
| `editable` | boolean | `true` for tasks, `false` for calendar events (read-only in the UI) |

Calendar-only extras: `location`, `calendar_id`, `calendar_name`, `continuesBefore`,
`continuesAfter` (multi-day event clamped to this day).
`findNextSlot()` adds `isTomorrow: boolean`.

---

## Storage conventions worth remembering

- **`led_color` may be the four-character string `"null"`**, not just SQL `NULL` — the
  frontend sends it for "LED off". Every consumer must treat `'null'` as absent
  (`agenda.js`, `led-controller.parseColor`, the route validators all do).
- **All-day events are floating dates.** They are pinned to UTC midnight on write and
  read back with `setZone(zone, { keepLocalTime: true })`, so "all day" means the user's
  day, not a 24-hour UTC window.
- **`event_count` is not decremented on failure.** A failed sync keeps the previous
  count and the previously cached rows.
- **Deleting a calendar deletes its events twice over** — explicit delete plus FK cascade.
  Harmless, but do not "clean it up" by removing the explicit delete: it also runs when
  foreign keys are unavailable.
