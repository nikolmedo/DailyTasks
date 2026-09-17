# Troubleshooting (agent-oriented)

Symptom → the check that actually discriminates, in order.

---

## The LED does not change

1. `curl -s localhost:5000/api/status | grep ledAvailable` — `false` means the SDK probe
   failed **or** the controller latched off after an error.
2. Look for `❌ Error controlling LED` earlier in the log. After the first hardware error
   `ledHardwareAvailable` is set to `false` and nothing is retried **until the process
   restarts** — restart before concluding the colour logic is wrong.
3. Is something actually active right now? `activeTask: null` ⇒ the LED is *supposed* to be off.
4. Does the active slot carry a colour? `led_color: null` (or the string `"null"`) ⇒ off by design.
5. The SDK path needs sudo: `create_led_with_sudo()`. A permission failure looks like a
   hardware failure in the log.

## The e-ink panel does not update

1. `GET /api/display/preview.png` — if it shows the new content, rendering works and the
   problem is the push to hardware.
2. Compare `database/display_payload.json` with what you expected: `push: false` or
   `mode: "partial"` explains a "nothing happened".
3. A frame identical to the last pushed one is **deliberately skipped**. Force it:
   `curl -X POST localhost:5000/api/refresh`.
4. Render without hardware to isolate PIL/layout errors — see
   [eink.md](eink.md#render-a-frame-without-hardware).
5. Hardware push needs the SDK and the user in the `spi` group; the failure surfaces as a
   non-zero exit from `render_display.py` with the stderr tail in the server log.

## A calendar shows a sync error

1. `GET /api/calendars` → `last_error` holds the exact message (also shown on hover in the panel).
2. `HTTP 401/404` ⇒ the secret iCal address was regenerated; the user must re-copy it.
3. `Timed out while downloading the feed` ⇒ 20 s limit; check outbound HTTPS from the device.
4. `Response is not an iCalendar feed` ⇒ an HTML login page was returned — wrong URL
   (the public "embed" URL, not the iCal one).
5. Cached events from the last good sync stay in place; the day keeps working while a
   feed is broken.

## Nothing is ever active / wrong item is active

1. `GET /api/status` → `timezone`. An empty or unexpected `config.timezone` sends the whole
   day to the default `America/Los_Angeles`.
2. `GET /api/agenda` → is the slot present at all? If not, the cause is upstream:
   `active_days` does not include today, or `done = 1` (done tasks are excluded from the
   schedule but still returned by `/api/agenda`, which passes `includeDone: true`).
3. If present but not chosen, it is overlap resolution — the rule is in
   `pickActiveSlot()` (timed beats all-day, then latest start).
4. Times near midnight: check `crossesMidnight` on the slot.

## Port already in use

```bash
ss -ltnp | grep :5000                 # find the owner
PORT=8000 node backend/server.js      # or just use another port
```

**Never kill processes on 3000, 3005, 8080 or 48081** — those are Distiller platform
services and killing them ends the session. When stopping this app, match
`backend/server.js`; a bare `pkill -f node` or a pattern that appears in your own command
line can take out the wrong process (including your own shell).

## The server will not start

- `Error: Cannot find module` ⇒ `cd backend && npm install`.
- `SQLITE_BUSY` / a stale `tasks.db-wal` ⇒ another instance is already running; find it
  before deleting anything.
- `better-sqlite3` is a native module: it must match the Node major version in use
  (`node -v`). Rebuild with `npm rebuild better-sqlite3` after a Node upgrade.
