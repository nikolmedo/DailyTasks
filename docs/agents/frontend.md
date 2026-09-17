# Frontend map

Three files, no build step, no framework: `frontend/index.html`, `frontend/app.js`
(~1.6k lines), `frontend/i18n.js`, `frontend/styles.css`. Reload the browser to see a
change — the server does not need restarting.

---

## Conventions

- **Every control has a stable `id`.** `app.js` caches them once into the `el` object
  (`const $ = id => document.getElementById(id)`). Add a control ⇒ add an `id` in the
  HTML and an entry in `el`.
- **All mutable UI state lives in one `state` object**: `tasks`, `calendars`, `config`,
  `status`, `agendaSlots`, `scope` (`today` \| `all`), `query`, `showAllDone`,
  `editingId`, `ledOff`, `calLedOff`, `online`, and `painted`.
- **`state.painted` is a repaint guard.** Renderers build an HTML string, compare it to
  the last painted string for that list, and skip the DOM write when identical —
  otherwise the 15-second poll would restart entry animations and make the page flicker.
  Any new list renderer should use the same `paint(container, html, key)` path.
- **All fetches go through `api(path, options)`**, which unwraps the envelope, throws on
  `success: false`, and flips the connection pill via `setOnline()`.

## Loops

| Interval | Work |
|---|---|
| 15 s | `poll()` → `/api/status` → re-render "now", timeline, task list |
| 60 s | `refreshEinkPreview()` → re-request `/api/display/preview.png` with a cache-busting query |
| 60 s | `updateDateLabel()` → header date, in the **device** timezone, not the browser's |

## Render functions

| Function | Paints |
|---|---|
| `renderNow()` | The "now instrument": status tag, source tag, title, clock, range, remaining, progress, next |
| `renderTimeline()` + `packRows()` + `renderTimelineScale()` | The day strip. `packRows` greedily packs overlapping slots onto rows; all-day slots get their own full-width row |
| `renderTasks()` + `taskCard()` + `eventCard()` + `emptyState()` | The list, with Today/All scope, search filter, and a collapsed "completed" section (`DONE_LIMIT = 5`) |
| `renderCalendars()` + `calendarRow()` | Subscriptions with sync state and error badges |
| `syncConfigUI()` | Settings controls from `state.config` |
| `applyTint(ledColor)` | Re-tints the whole interface from the active slot's LED colour (`liftForScreen()` raises lightness so dark LED colours stay legible on screen) |
| `renderAll()` | All of the above |

## Sheets (dialogs)

`openSheet` / `closeSheet` manage `.is-open`, the scrim, focus restoration
(`lastFocused`) and `trapFocus()` for Tab cycling. Two sheets exist: `#taskSheet`
(`newTask()` / `editTask(id)` / `submitTask()`) and `#calendarSheet` (`newCalendar()` /
`submitCalendar()`). Validation errors surface inline through `showHint(node, message)`.

Deleting a task shows a toast with an **undo** action that re-creates the row from the
payload the API echoed back (`restoreTask`) — keep that echo if you touch `DELETE /api/tasks/:id`.

## Keyboard shortcuts

`N` new task · `/` focus search · `R` refresh device · `Esc` close sheet.
Suppressed while typing in an input and while any modifier is held.

## i18n

`frontend/i18n.js` bundles both catalogs inline (`CATALOGS.es`, `CATALOGS.en`) so the
panel needs no extra round trip. API: `i18n.load(lang)`, `i18n.t(key, vars)`,
`i18n.apply(root)`, `i18n.currentLang()`.

Markup is translated declaratively by attribute:

| Attribute | Target |
|---|---|
| `data-i18n` | `textContent` |
| `data-i18n-html` | `innerHTML` (only for strings with inline markup) |
| `data-i18n-placeholder` | `placeholder` |
| `data-i18n-aria` | `aria-label` |
| `data-i18n-title` | `title` |
| `data-i18n-option` | `<option>` label |

Interpolation is `{name}` and is filled from the `vars` object.

**The timezone picker is fed by the `TIMEZONES` const at the top of `app.js`** (38 entries,
`{ id, key }`), with labels under `tz.<key>` in the catalogs and the UTC offset / DST badge
computed at runtime. `locales/timezones.json` holds the same list but **no code reads it** —
edit the array, not the JSON.

**A new string must be added to `CATALOGS.es` *and* `CATALOGS.en`** — and additionally to
`locales/*.json` if the backend or the e-ink panel also renders it. Untranslated keys
render as the raw key, which is how you spot a miss.

## Styling

`styles.css` starts with the design tokens (colour ramp, the `--led` / `--led-2`
variables that `applyTint` rewrites live from the active task's colour, spacing, radii,
type scale) followed by component blocks in the same order as the markup. Fonts: Chakra
Petch (display), IBM Plex Sans / Mono. The layout collapses to a single column at phone
width and honours `prefers-reduced-motion`. Prefer extending a token over hard-coding a
colour.

Corners are plain `border-radius`, not `clip-path` chamfers — a clipped corner cuts the
1px border along with the fill and reads as a broken edge rather than a bevel. The HUD
language is carried by the `.bracket` corner marks on `.now` instead.

List renders (`renderTasks`, `renderTimeline`, `renderCalendars`) go through `paint()`,
which skips the `innerHTML` write when the markup is unchanged and only lets the
`.is-first-paint` entry animations run once. Polling every 15s would otherwise rewrite
identical HTML and restart those animations, which reads as the page flickering.
