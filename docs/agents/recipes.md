# Recipes — common changes, end to end

Each recipe lists every file that must change. Follow the order given; the last step of
every backend recipe is the restart.

---

## Restart the server (needed after any `backend/**` edit)

```bash
# stop: match the entry file, never a broad "pkill -f node" (that can kill system services)
kill $(ps aux | grep "[b]ackend/server.js" | awk '{print $2}') 2>/dev/null
cd /home/distiller/projects/daily-tasks && nohup bash start.sh > /tmp/daily-tasks.log 2>&1 &
sleep 4 && curl -s http://localhost:5000/api/health
```

Frontend-only edits need no restart — the files are served statically.

---

## Add a field to `tasks`

1. `backend/database.js` → add the column to the `CREATE TABLE tasks` block **and** add a
   `migrate("ALTER TABLE tasks ADD COLUMN …", "label")` line (existing DBs only get the latter).
2. Same file: extend `createTask` / `updateTask` prepared statements and their wrappers.
3. `backend/server.js` → extend `validateTask()` and destructure the field in POST and PUT.
4. `backend/agenda.js` → surface it on the slot in `taskToSlot()` if scheduling or the UI needs it.
5. `frontend/index.html` → the input, with an `id`; `frontend/app.js` → add to `el`,
   `newTask()`, `editTask()`, `submitTask()`, and the card renderer.
6. Strings → both catalogs (see below). Restart.

## Add a config key

1. `backend/database.js` → add to `defaultConfig` in `initDatabase()`.
2. `backend/server.js` → add a validation branch in `PUT /api/config` (reject out-of-range with 400).
3. Consumer: `scheduler.js` / `display-controller.js` / `calendar-sync.js` reads it from
   `db.getAllConfig()` or `db.getConfig()`. Remember values are **strings**.
4. `frontend/index.html` → the control with an `id`; `frontend/app.js` → `el` entry,
   `syncConfigUI()` (read) and `saveConfig()` (write).
5. Strings → both catalogs. Restart.
6. Document it in [data-model.md](data-model.md#config-keys) and in the README settings list.

## Add a user-facing string

| Where it is rendered | Add it to |
|---|---|
| Web panel | `CATALOGS.es` **and** `CATALOGS.en` in `frontend/i18n.js`, then reference it with a `data-i18n*` attribute or `i18n.t()` |
| Backend / e-ink | `locales/es.json` **and** `locales/en.json`, then `t('key', lang, vars)` from `backend/i18n.js` |

Both places when both render it. A missing key renders as the literal key.

## Add a REST endpoint

See [api.md](api.md#adding-an-endpoint). Short version: route beside its siblings →
validate → prepared statement in `database.js` → `scheduler.forceUpdate()` if it can
change what is active → `api()` call in `frontend/app.js`.

## Change what wins when items overlap

Only `pickActiveSlot()` in `backend/agenda.js`. Current rule: timed beats all-day, then
latest start, then shortest remaining. Nothing else encodes priority — do not add a
second rule elsewhere.

## Change the e-ink layout

`backend/render_display.py` only (`render()`, `draw_header()`, `draw_footer()`,
`footer_height()`). Preview with `"push": false` as described in
[eink.md](eink.md#render-a-frame-without-hardware). If a new payload field is needed, add
it in `buildPayload()` in `display-controller.js` too — and remember the frame hash is
computed over the payload, so a new field automatically participates in change detection.

## Add a language

1. `backend/i18n.js` → add the code to `SUPPORTED`.
2. `locales/<code>.json` → full copy of `en.json`, translated.
3. `frontend/i18n.js` → add a `CATALOGS.<code>` entry (same key tree).
4. `frontend/index.html` → an `<option>` in `#language` with `data-i18n-option`.
5. Translate the `tz.*` block too — those are the timezone labels shown in the picker.
6. `PUT /api/config` already validates against `SUPPORTED`, so no route change. Restart.

## Add a timezone to the picker

1. `frontend/app.js` → append `{ id: 'Area/City', key: 'shortKey' }` to the `TIMEZONES`
   const. **That array is the list the UI renders** — `locales/timezones.json` is a
   leftover that no code reads.
2. `frontend/i18n.js` → add `tz.shortKey` to `CATALOGS.es` and `CATALOGS.en`.
3. Nothing else: the offset and the DST badge are computed at runtime from the IANA id,
   and `PUT /api/config` accepts any zone Luxon knows.

## Seed a demo/screenshot environment (without touching real data)

The live database holds the user's personal schedule. Work on a copy:

```bash
cp -r backend frontend locales /tmp/dt-demo/          # node_modules can be symlinked
# stub the hardware in the copy: display-controller (never push), led-controller (report
# available, do nothing), calendar-sync (skip the timer so fake feeds don't error)
PORT=5055 node /tmp/dt-demo/backend/server.js
```

Seed the copy's `database/tasks.db` directly with `better-sqlite3`, then drive a headless
browser against `localhost:5055`. Never point a demo instance at `database/tasks.db`, and
never let it push to the panel while the real instance is running.

---

## Manual API checks

```bash
curl -s localhost:5000/api/health
curl -s localhost:5000/api/status  | python3 -m json.tool
curl -s localhost:5000/api/agenda  | python3 -m json.tool

curl -s -X POST localhost:5000/api/tasks -H 'Content-Type: application/json' \
  -d '{"name":"Test","start_time":"10:00","end_time":"11:00","led_color":"255,0,0"}'

curl -s -X POST localhost:5000/api/calendars/sync
curl -s -X POST localhost:5000/api/refresh
```

There is no automated test suite. Verify changes by driving the API and reading
`database/display_temp.png` / `/api/display/preview.png`.
