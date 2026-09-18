# E-ink renderer

`backend/render_display.py` draws the whole HUD with PIL and (optionally) pushes it to
the panel through the Distiller SDK. `backend/display-controller.js` decides *what* to
draw and *whether* a refresh is warranted — see
[architecture.md](architecture.md#display-controllerjs--payload--refresh-policy).

Canvas: **250 × 128, mode `1` (pure black/white)**. Images are authored landscape; the
vendor firmware handles rotation.

---

## Payload contract

The controller writes JSON to `database/display_payload.json` and passes the path as
`argv[1]`. Every field is optional except `state`; unknown fields are ignored.

| Field | Type | Effect |
|---|---|---|
| `state` | `"active"` \| `"idle"` \| `"boot"` | Semantic state |
| `dateText` | `"THU 17 SEP"` | Right side of the header. No clock: a live time would force a redraw every minute even when the task had not moved, so the header carries the date instead, which changes once a day |
| `title` | string | The large centred title — the one thing read across the room |
| `statusLabel` | string | Header label, upper-cased ("IN PROGRESS", "IDLE", …) |
| `sourceLabel` | string \| null | Corner tag naming the calendar an event came from |
| `timeText` | string | Bracketed chip: `"13:30 - 15:00"`, a day range, or "free for the rest of the day" |
| `remainingText` | string | Right of the chip, upper-cased ("52 MIN") |
| `progress` | 0..1 \| null | Progress track; omitted ⇒ the track is not drawn |
| `nextLabel` / `nextText` | string | Bottom row: `"NEXT|16:00  1:1 with Dana"` |
| `output` | path | Where the PNG is written (default `/tmp/daily-tasks-display.png`) |
| `push` | boolean | `false` ⇒ render only, never touch the SDK or the hardware |
| `mode` | `"full"` \| `"partial"` | Refresh type when pushing |

All display strings are already localised by the controller via `backend/i18n.js` —
the renderer never looks up a translation.

---

## The layout rules

1. **Nothing is ever clipped.** Every string goes through `fit_line()` (shrink then
   ellipsise) or `fit_block()` (shrink → wrap → hard-break long words → ellipsise). If
   the title still would not fit, `render()` drops the "next up" row to buy the title
   another line and re-flows — truncating the title is the last resort, never the first.
2. **Depth without greys.** The progress track's unfilled section is an ordered dither
   pattern drawn pixel by pixel (`dither`), so it survives 1-bit conversion exactly as
   authored. The push uses `DitheringMethod.THRESHOLD` for the same reason — any other
   dithering would re-process art that is already binary. Type is always solid — no
   screened shadows, which cost legibility and vertical space at this size.
3. **Landscape in, firmware rotates.** Author at 250 × 128; do not pre-rotate.
4. **Nothing ticks on its own.** There is no clock in the payload (see `dateText`
   above); the progress bar and remaining-time text both derive from the same
   10-minute bucket in `display-controller.js`, so the frame stays byte-identical
   between steps and a run of no-op renders never reaches the hardware.
5. **Any row mixing fonts or strings aligns on a shared baseline, not shared tops.**
   Two strings top-aligned to the same `y` only look aligned when both bounding boxes
   happen to match — an accented capital (Ó, É) grows a string's bbox upward, so
   `"PRÓXIMA"` top-aligned next to `"18:00"` visibly drops below it. `draw_baseline()`
   / `tracked_baseline()` use `font_metrics()` (constant per font+size, from
   `ImageFont.getmetrics()`) instead of `textbbox()` (varies with the string's own
   glyphs), so mixed fonts and accents land on one line. `draw_line_at()` /
   `tracked_text()` still exist for the single-font, single-string cases (the title,
   the corner source tag) where that concern does not apply — don't reach for them on
   a row with more than one text element.

Layout constants at the top of the file: `WIDTH`, `HEIGHT`, `PAD = 6`, `HEADER_H = 22`,
`CHAMFER = 9`, and the four DejaVu font paths (sans/mono × regular/bold).

Drawing helpers worth reusing instead of re-inventing: `draw_baseline` / `tracked_baseline`
(baseline-aligned text, letter-spaced or not), `font_metrics`, `fit_tracked`,
`corner_brackets`, `dotted_rule`, `split_rule`, `arrow`, `progress_bar`.

---

## Render a frame without hardware

Set `"push": false` and run the SDK's Python (needed only for the push path, but it is
the interpreter that has Pillow):

```bash
cat > /tmp/frame.json <<'JSON'
{"state":"active","title":"Deep work — API refactor","statusLabel":"In progress",
 "sourceLabel":"Work","timeText":"09:15 - 11:30","dateText":"THU 17 SEP","progress":0.24,
 "remainingText":"1 h 43 min","nextLabel":"Next","nextText":"12:00  Lunch",
 "output":"/tmp/frame.png","push":false,"mode":"full"}
JSON

PYTHONPATH=/opt/distiller-sdk/src LD_LIBRARY_PATH=/opt/distiller-sdk/lib \
  /opt/distiller-sdk/.venv/bin/python3 backend/render_display.py /tmp/frame.json
```

Then read `/tmp/frame.png`. Upscale with **nearest-neighbour** when inspecting or
documenting it — any smooth resampling blurs the dither patterns into fake greys:

```bash
python3 -c "from PIL import Image; im=Image.open('/tmp/frame.png'); \
im.resize((im.width*4, im.height*4), Image.NEAREST).save('/tmp/frame@4x.png')"
```

Iterate on layout this way; pushing to the panel for every attempt costs 2–3 s each and
wears the display.

## Inspecting what the device is actually showing

- `database/display_temp.png` — the last frame rendered for the panel.
- `database/display_payload.json` — the exact payload that produced it.
- `GET /api/display/preview.png` — the same PNG over HTTP (what the web panel mirrors).
