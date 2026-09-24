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
  otherwise every live refresh would restart entry animations and make the page flicker.
  `paint()` also restores focus to the same control (matched by `data-action`/`data-id`/`data-key`).
  Any new list renderer should use the same `paint(container, html, key)` path.
- **All fetches go through `api(path, options)`**, which unwraps the envelope, throws on
  `success: false`, and flips the connection pill via `setOnline()`.

## Loops

| Interval | Work |
|---|---|
| live | `connectStream()` → `EventSource('/api/events')` → `queueRefresh(topic)` coalesces bursts and re-fetches only the changed resources |
| 1 s | `tick()` → local clock (device zone + server `epoch` skew), "now" playhead, "updated x ago" |
| 30 s | `poll()` → status + tasks + calendars — safety net if the stream drops |
| 60 s | `loadPreview()` → fetches the PNG, compares a byte hash, swaps (with an e-ink flash) only when it changed |

All loops stop while the tab is hidden (`visibilitychange`) and catch up on return; the
`.is-paused` class on `<html>` pauses CSS animations. Offline shows `#offlineBar`.
| every render | `updateDateLabel()` → header date, in the **device** timezone, not the browser's |

## Render functions

| Function | Paints |
|---|---|
| `renderNow()` | The "now instrument": status tag, source tag, title, clock, range, remaining, progress, next |
| `renderTimeline()` + `slotSegments()` + `packRows()` + `renderTimelineScale()` | The day strip. A slot crossing midnight is drawn as two pieces (00:00→end, start→24:00), matching `agenda.js`. `timelineWindow()` zooms to 12 h around now below 620 px. Task blocks can be dragged (move) or edge-dragged (resize) with a mouse/pen in 5-min steps → `updateTaskTimes()` with an undo toast; touch taps open the editor |
| `renderTasks()` + `taskCard()` + `eventCard()` + `emptyState()` | The list, with Today/All scope, search filter, and a collapsed "completed" section (`DONE_LIMIT = 5`) |
| `renderCalendars()` + `calendarRow()` | Subscriptions with sync state and error badges |
| `syncConfigUI()` | Settings controls from `state.config` |
| `renderDevice()` | LED readout (real colour + brightness from `status.device.led`), "updated x ago" from `status.device.display` |
| `applyTint(ledColor)` | Re-tints the whole interface from the active slot's LED colour. `liftForScreen()` mixes towards the bone ink until WCAG contrast ≥ 4.5 against `--bg-1`; `--on-led` picks dark/light text for accent fills. It writes the `@property`-registered channels `--led-r/g/b`, so the tint animates |
| `renderAll()` | All of the above |

## Sheets (dialogs)

`openSheet` / `closeSheet` manage `data-open` (synchronous) and `.is-open` (animation), the
scrim, focus restoration (`lastFocused`), `trapFocus()` for Tab cycling and swipe-down to
close on phones. Sheets (`SHEETS`): `#taskSheet` (`newTask()` / `editTask(id)` /
`submitTask()`, plus *Duplicate* when editing), `#calendarSheet` (`newCalendar()` /
`submitCalendar()`), `#eventSheet` (`openEvent(key)`, read-only calendar event details) and
`#shortcutsSheet`. Validation errors surface inline through `showHint(node, message)`.

Mutations re-render through `withTransition(renderAll)` — a View Transition where supported;
cards carry `view-transition-name: task-<id>` / `ev-<id>` / `cal-<id>` so they glide.

Deleting a task shows a toast with an **undo** action that re-creates the row from the
payload the API echoed back (`restoreTask`) — keep that echo if you touch `DELETE /api/tasks/:id`.
Removing a calendar works the same way (`restoreCalendar` subscribes to the URL again).

## Keyboard shortcuts

`N` new task · `/` focus search · `R` refresh device · `?` shortcuts sheet · `Esc` close sheet.
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
Petch (display), IBM Plex Sans / Mono — self-hosted in `frontend/fonts/` (latin + latin-ext
subsets, `fonts.css`), so the panel works on a LAN with no internet. The layout collapses to a single column at phone
width and honours `prefers-reduced-motion`. Prefer extending a token over hard-coding a
colour.

Corners are plain `border-radius`, not `clip-path` chamfers — a clipped corner cuts the
1px border along with the fill and reads as a broken edge rather than a bevel. The HUD
language is carried by the `.bracket` corner marks on `.now` instead.

List renders (`renderTasks`, `renderTimeline`, `renderCalendars`) go through `paint()`,
which skips the `innerHTML` write when the markup is unchanged and only lets the
`.is-first-paint` entry animations run once. Polling every 15s would otherwise rewrite
identical HTML and restart those animations, which reads as the page flickering.
