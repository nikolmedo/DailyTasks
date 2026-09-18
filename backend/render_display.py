#!/usr/bin/env python3
"""
Daily Tasks — e-ink renderer for the EPD128x250 panel.

Draws a 250x128 landscape, pure 1-bit "HUD" frame and (optionally) pushes it to
the display. Reads a JSON payload from a file so nothing is ever interpolated
into a shell command.

Design constraints this file is built around:
  * The panel is 250x128 and strictly black/white — no greys. Depth is faked
    with ordered dither patterns drawn pixel by pixel, which survive the 1-bit
    conversion intact.
  * Nothing on the frame ticks on its own. There is no clock, because a live
    time would force a redraw every minute even when the task has not changed.
  * Text must never be clipped. Every string goes through fit_line() or
    fit_block(), which shrink, wrap and finally ellipsise so the result always
    fits its box.
  * Images are authored landscape; the vendor firmware handles the rotation.

Usage:
    python3 render_display.py payload.json
"""

import json
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH = 250
HEIGHT = 128

BLACK = 0
WHITE = 1

PAD = 6
HEADER_H = 22
CHAMFER = 9

FONT_SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

ELLIPSIS = "..."

_font_cache = {}


def font(path, size):
    """Load a TrueType font, falling back to PIL's bitmap font."""
    key = (path, size)
    if key not in _font_cache:
        try:
            _font_cache[key] = ImageFont.truetype(path, size)
        except OSError:
            _font_cache[key] = ImageFont.load_default()
    return _font_cache[key]


# ──────────────────────────────────────────────────────────────────────────────
# Text measuring / fitting
# ──────────────────────────────────────────────────────────────────────────────

def text_width(draw, text, fnt):
    if not text:
        return 0
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0]


def line_height(fnt):
    """
    Vertical advance for one line.

    DejaVu's ascent+descent reserves room for glyphs no UI string uses, which on
    a 128px-tall panel costs a whole extra line. 1.16em still clears accented
    capitals (Á, Ñ) while keeping two lines readable.
    """
    size = getattr(fnt, "size", None)
    if not size:
        return 10
    return max(8, round(size * 1.16))


def fit_line(draw, text, fnt, max_width):
    """Shorten a single line with an ellipsis until it fits `max_width`."""
    text = (text or "").strip()
    if not text or text_width(draw, text, fnt) <= max_width:
        return text

    ell_w = text_width(draw, ELLIPSIS, fnt)
    if ell_w > max_width:
        return ""

    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if text_width(draw, text[:mid], fnt) + ell_w <= max_width:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo].rstrip() + ELLIPSIS


def wrap_text(draw, text, fnt, max_width):
    """
    Greedy word wrap that also hard-breaks words wider than the box, so a single
    long word can never overflow.
    """
    lines = []
    current = ""

    def break_long_word(word):
        """Split a word that is wider than max_width into chunks that fit."""
        chunks = []
        chunk = ""
        for char in word:
            probe = chunk + char
            if text_width(draw, probe, fnt) <= max_width or not chunk:
                chunk = probe
            else:
                chunks.append(chunk)
                chunk = char
        if chunk:
            chunks.append(chunk)
        return chunks

    for word in (text or "").split():
        if text_width(draw, word, fnt) > max_width:
            if current:
                lines.append(current)
                current = ""
            pieces = break_long_word(word)
            lines.extend(pieces[:-1])
            current = pieces[-1] if pieces else ""
            continue

        probe = f"{current} {word}".strip()
        if text_width(draw, probe, fnt) <= max_width:
            current = probe
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)
    return lines or [""]


def fit_block(draw, text, fonts, max_width, max_height, gap=3, max_lines=3):
    """
    Pick the largest font from `fonts` whose wrapped text fits the box.

    Returns (lines, font, block_height, truncated). With the smallest font the
    block is cut to the number of lines that fit and the last line is
    ellipsised, so the caller always gets something renderable — and `truncated`
    tells it whether freeing more room would be worthwhile.
    """
    fallback = None

    for fnt in fonts:
        lines = wrap_text(draw, text, fnt, max_width)
        lh = line_height(fnt)
        allowed = max(1, min(max_lines, (max_height + gap) // (lh + gap)))

        if len(lines) <= allowed:
            height = len(lines) * lh + (len(lines) - 1) * gap
            if height <= max_height:
                return lines, fnt, height, False

        if fallback is None or fnt is fonts[-1]:
            fallback = (lines, fnt, lh, allowed)

    lines, fnt, lh, allowed = fallback
    kept = lines[:allowed]
    truncated = len(lines) > allowed
    if truncated:
        tail = kept[-1]
        # Re-flow the dropped words into the last visible line, then ellipsise
        remainder = " ".join(lines[allowed - 1:])
        kept[-1] = fit_line(draw, remainder, fnt, max_width) or fit_line(draw, tail, fnt, max_width)
    height = len(kept) * lh + (len(kept) - 1) * gap
    return kept, fnt, height, truncated


def draw_line_at(draw, text, fnt, x, y, fill=BLACK):
    """Draw text with the glyph box top-aligned at `y` (PIL anchors vary)."""
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x - box[0], y - box[1]), text, font=fnt, fill=fill)
    return box[2] - box[0]


def font_metrics(fnt):
    """(ascent, descent) for a font — constant per font+size, unlike a string's
    own bounding box, which grows upward for an accented capital (Ó, Á) and
    shrinks for one without. Baseline alignment across strings needs this, not
    textbbox."""
    try:
        return fnt.getmetrics()
    except AttributeError:
        size = getattr(fnt, "size", 10)
        return (size, max(1, size // 4))


def draw_baseline(draw, text, fnt, x, baseline, fill=BLACK):
    """
    Draw text with its typographic baseline at `baseline`.

    Two strings in different fonts — or the same font with and without an
    accented capital — land on the same line, which top-aligning their own
    bounding boxes cannot guarantee (PRÓXIMA's accent pushes its bbox top
    above a plain string's, so top-aligning both drops PRÓXIMA's letters
    below the other string's).
    """
    if not text:
        return 0
    draw.text((x, baseline), text, font=fnt, fill=fill, anchor="ls")
    return text_width(draw, text, fnt)


def tracked_baseline(draw, text, fnt, x, baseline, tracking=1, fill=BLACK):
    """Letter-spaced text, baseline-aligned — the tracked counterpart of
    draw_baseline(). Safe with accented capitals: every glyph sits on the same
    baseline regardless of its own bounding box."""
    if not text:
        return 0
    cursor = x
    for char in text:
        draw.text((cursor, baseline), char, font=fnt, fill=fill, anchor="ls")
        cursor += draw.textlength(char, font=fnt) + tracking
    return cursor - x - tracking


def tracked_text(draw, text, fnt, x, y, tracking=1, fill=BLACK):
    """
    Draw text with extra letter spacing — reads as 'technical' on e-ink.

    Every glyph is placed against one shared origin taken from the whole string.
    Aligning each glyph to its own bounding box instead would drop accented
    capitals (Ó, Á) below the others, which Spanish labels hit constantly.
    """
    if not text:
        return 0
    top = draw.textbbox((0, 0), text, font=fnt)[1]
    cursor = x
    for char in text:
        draw.text((cursor, y - top), char, font=fnt, fill=fill)
        cursor += draw.textlength(char, font=fnt) + tracking
    return cursor - x - tracking


def tracked_width(draw, text, fnt, tracking=1):
    if not text:
        return 0
    total = sum(draw.textlength(ch, font=fnt) for ch in text)
    return int(total + tracking * (len(text) - 1))


def fit_tracked(draw, text, fnt, max_width, tracking=1):
    """Ellipsise a letter-spaced string so it fits `max_width`."""
    text = (text or "").strip()
    while text and tracked_width(draw, text, fnt, tracking) > max_width:
        text = text[:-1]
        if text and tracked_width(draw, text + ELLIPSIS, fnt, tracking) <= max_width:
            return text.rstrip() + ELLIPSIS
    return text


# ──────────────────────────────────────────────────────────────────────────────
# Decorative primitives — all pure 1-bit
# ──────────────────────────────────────────────────────────────────────────────

def dither(draw, box, density="50", fill=BLACK):
    """
    Fill a box with an ordered pixel pattern. On a 1-bit panel this is the only
    honest way to suggest a mid-tone.
    """
    x0, y0, x1, y1 = box
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            if density == "50":
                on = (x + y) % 2 == 0
            elif density == "25":
                on = (x % 2 == 0) and (y % 2 == 0)
            elif density == "12":
                on = (x % 4 == 0) and (y % 2 == 0)
            else:  # "75"
                on = (x + y) % 4 != 0
            if on:
                draw.point((x, y), fill=fill)


def corner_brackets(draw, box, length=9, thickness=2, fill=BLACK):
    """HUD-style L marks at the four corners of a region."""
    x0, y0, x1, y1 = box
    for i in range(thickness):
        draw.line([(x0, y0 + i), (x0 + length, y0 + i)], fill=fill)
        draw.line([(x0 + i, y0), (x0 + i, y0 + length)], fill=fill)

        draw.line([(x1 - length, y0 + i), (x1, y0 + i)], fill=fill)
        draw.line([(x1 - i, y0), (x1 - i, y0 + length)], fill=fill)

        draw.line([(x0, y1 - i), (x0 + length, y1 - i)], fill=fill)
        draw.line([(x0 + i, y1 - length), (x0 + i, y1)], fill=fill)

        draw.line([(x1 - length, y1 - i), (x1, y1 - i)], fill=fill)
        draw.line([(x1 - i, y1 - length), (x1 - i, y1)], fill=fill)


def dotted_rule(draw, y, x0, x1, step=3, fill=BLACK):
    for x in range(int(x0), int(x1), step):
        draw.point((x, y), fill=fill)


def arrow(draw, x, y, size=5, fill=BLACK):
    """Solid right-pointing triangle — drawn, not typed, so no font can fail."""
    draw.polygon(
        [(x, y - size // 2), (x, y + size // 2), (x + size - 1, y)],
        fill=fill,
    )
    return size


def progress_bar(draw, box, ratio, fill=BLACK):
    """
    Segmented progress track: elapsed is solid, remaining is a light dither, and
    a solid caret marks the playhead.
    """
    x0, y0, x1, y1 = box
    draw.rectangle([x0, y0, x1, y1], outline=fill, width=1)

    inner_x0, inner_y0 = x0 + 2, y0 + 2
    inner_x1, inner_y1 = x1 - 1, y1 - 1
    span = inner_x1 - inner_x0
    if span <= 0:
        return

    filled = int(span * max(0.0, min(1.0, ratio)))

    if filled > 0:
        draw.rectangle([inner_x0, inner_y0, inner_x0 + filled, inner_y1 - 1], fill=fill)
    if filled < span:
        dither(draw, (inner_x0 + filled, inner_y0, inner_x1, inner_y1), density="25", fill=fill)

    # Playhead caret above the track, kept inside the frame at both extremes
    caret_x = min(inner_x1 - 2, max(inner_x0 + 2, inner_x0 + filled))
    draw.polygon(
        [(caret_x - 2, y0 - 3), (caret_x + 2, y0 - 3), (caret_x, y0)],
        fill=fill,
    )


def split_rule(draw, y, x0, x1, fill=BLACK):
    """
    Asymmetric separator: a solid run on the left that decays into dots.
    Reads as a HUD divider rather than as the edge of a table.
    """
    solid_end = x0 + (x1 - x0) // 4
    draw.line([(x0, y), (solid_end, y)], fill=fill)
    draw.line([(x0, y - 2), (x0, y + 2)], fill=fill)

    x = solid_end + 3
    step = 3
    while x < x1:
        draw.point((x, y), fill=fill)
        step += 1
        x += step
    draw.line([(x1, y - 2), (x1, y + 2)], fill=fill)


# ──────────────────────────────────────────────────────────────────────────────
# Layout
# ──────────────────────────────────────────────────────────────────────────────

def draw_header(draw, data):
    """
    Inverted status bar with a chamfered corner, status label and date.

    Deliberately no clock: a live time would change every minute and force the
    panel to redraw even when the task itself has not moved. The date changes
    once a day, so the header stays put.
    """
    draw.polygon(
        [
            (0, 0),
            (WIDTH, 0),
            (WIDTH, HEADER_H - CHAMFER),
            (WIDTH - CHAMFER, HEADER_H),
            (0, HEADER_H),
        ],
        fill=BLACK,
    )

    label_font = font(FONT_MONO_BOLD, 10)
    date_font = font(FONT_MONO_BOLD, 11)

    # One shared baseline for both strings. Top-aligning each string's own
    # bounding box instead — as a naive draw_line_at/tracked_text pairing would —
    # breaks the moment either string's accents differ from the other's (a plain
    # status label next to a date like "MIÉ", whose É sits taller than a bare M).
    label_ascent, label_descent = font_metrics(label_font)
    date_ascent, date_descent = font_metrics(date_font)
    ascent = max(label_ascent, date_ascent)
    descent = max(label_descent, date_descent)
    baseline = (HEADER_H - ascent - descent) // 2 + ascent

    # Live marker: a filled block for an active task, a hollow one when idle
    marker_x = PAD
    marker_y = baseline - ascent
    marker_h = ascent + descent - 1
    if data.get("state") == "active":
        draw.rectangle([marker_x, marker_y, marker_x + 3, marker_y + marker_h], fill=WHITE)
    else:
        draw.rectangle([marker_x, marker_y, marker_x + 3, marker_y + marker_h], outline=WHITE, width=1)
        mid = marker_y + marker_h // 2
        draw.point((marker_x + 1, mid), fill=WHITE)
        draw.point((marker_x + 2, mid + 1), fill=WHITE)

    date_text = (data.get("dateText") or "").upper()
    date_w = tracked_width(draw, date_text, date_font, 1) if date_text else 0
    date_x = WIDTH - PAD - CHAMFER - date_w

    label_max = (date_x if date_text else WIDTH - PAD - CHAMFER) - (marker_x + 8) - 8
    label = fit_tracked(draw, (data.get("statusLabel") or "").upper(), label_font, label_max, tracking=1)
    tracked_baseline(draw, label, label_font, marker_x + 8, baseline, tracking=1, fill=WHITE)

    if date_text:
        tracked_baseline(draw, date_text, date_font, date_x, baseline, tracking=1, fill=WHITE)


def draw_footer(draw, data, top):
    """
    Time chip, progress track and the 'next up' line.
    Returns the y where the footer starts so the title can claim the rest.
    """
    y = top
    inner_x0, inner_x1 = PAD + 10, WIDTH - PAD - 10

    time_text = data.get("timeText") or ""
    remaining = (data.get("remainingText") or "").upper()
    progress = data.get("progress")

    if time_text:
        time_font = font(FONT_MONO_BOLD, 12)
        small_font = font(FONT_MONO, 9)

        rem_w = tracked_width(draw, remaining, small_font, 1) if remaining else 0
        chip_max = (inner_x1 - inner_x0) - (rem_w + 10 if rem_w else 0) - 10

        # Time range lives inside a bracketed chip
        label = fit_line(draw, time_text, time_font, chip_max)
        label_w = text_width(draw, label, time_font)
        chip_h = 15
        chip_x1 = inner_x0 + label_w + 10

        draw.rectangle([inner_x0, y, chip_x1, y + chip_h], outline=BLACK, width=1)
        draw.rectangle([inner_x0, y, inner_x0 + 2, y + chip_h], fill=BLACK)

        # One baseline for the chip label and the remaining-time text — they are
        # different fonts, so top-aligning each string's own bbox (as before)
        # let accents or size differences knock one off the other's line.
        chip_ascent, chip_descent = font_metrics(time_font)
        baseline = y + (chip_h - chip_ascent - chip_descent) // 2 + chip_ascent
        draw_baseline(draw, label, time_font, inner_x0 + 7, baseline)

        if remaining:
            tracked_baseline(draw, remaining, small_font, inner_x1 - rem_w, baseline, tracking=1)

        y += chip_h + 6

    if isinstance(progress, (int, float)):
        progress_bar(draw, (inner_x0, y, inner_x1, y + 7), float(progress))
        y += 11

    next_text = data.get("nextText")
    if next_text:
        next_label_font = font(FONT_MONO_BOLD, 9)
        next_font = font(FONT_MONO, 10)

        # Shared baseline again: the arrow, the "NEXT" label and the value text
        # all key off it so the row reads as one line instead of three floating
        # pieces at slightly different heights.
        label_ascent, label_descent = font_metrics(next_label_font)
        value_ascent, value_descent = font_metrics(next_font)
        ascent = max(label_ascent, value_ascent)
        descent = max(label_descent, value_descent)
        baseline = y + ascent
        row_bottom = baseline + descent

        cursor = inner_x0
        arrow_cy = baseline - ascent // 2
        cursor += arrow(draw, cursor, arrow_cy, size=5) + 4

        label = (data.get("nextLabel") or "").upper()
        if label:
            cursor += tracked_width(draw, label, next_label_font, 1)
            tracked_baseline(draw, label, next_label_font, inner_x0 + 9, baseline, tracking=1)
            cursor += 6
            draw.line([(cursor - 3, y), (cursor - 3, row_bottom)], fill=BLACK)

        text = fit_line(draw, next_text, next_font, inner_x1 - cursor)
        draw_baseline(draw, text, next_font, cursor, baseline)


def footer_height(data):
    """How much vertical room the footer needs, so the title gets the rest."""
    height = 0
    if data.get("timeText"):
        height += 15 + 6
    if isinstance(data.get("progress"), (int, float)):
        height += 11
    if data.get("nextText"):
        # Matches the baseline math in draw_footer: ascent(10) + descent(3)
        label_ascent, label_descent = font_metrics(font(FONT_MONO_BOLD, 9))
        value_ascent, value_descent = font_metrics(font(FONT_MONO, 10))
        height += max(label_ascent, value_ascent) + max(label_descent, value_descent)
    return height


def render(data):
    """Compose the full 250x128 frame."""
    img = Image.new("1", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    draw_header(draw, data)

    # Dotted rule + source tag directly under the header
    rule_y = HEADER_H + 4
    dotted_rule(draw, rule_y, PAD, WIDTH - PAD, step=3)

    source = (data.get("sourceLabel") or "").upper()
    if source:
        tag_font = font(FONT_MONO_BOLD, 8)
        # Stay clear of the right-hand corner bracket
        tag_right = WIDTH - PAD - 14
        source = fit_tracked(draw, source, tag_font, WIDTH // 2, tracking=1)
        tag_w = tracked_width(draw, source, tag_font, 1)
        # Knock the rule out behind the tag, then invert the tag itself
        draw.rectangle([tag_right - tag_w - 8, rule_y - 5, tag_right, rule_y + 6], fill=BLACK)
        tracked_text(draw, source, tag_font, tag_right - tag_w - 4, rule_y - 3, tracking=1, fill=WHITE)

    content_top = rule_y + 9
    content_bottom = HEIGHT - PAD

    title_max_w = WIDTH - 2 * (PAD + 10)
    title_fonts = [font(FONT_SANS_BOLD, size) for size in (30, 26, 23, 20, 17, 15, 13)]

    def layout_title(payload):
        fh = footer_height(payload)
        top = content_top + 4
        bottom = content_bottom - fh - (4 if fh else 0)
        box_h = max(12, bottom - top)
        lines, fnt, block_h, truncated = fit_block(
            draw, payload.get("title") or "", title_fonts,
            title_max_w, box_h, gap=2, max_lines=3,
        )
        return fh, top, box_h, lines, fnt, block_h, truncated

    fh, title_box_top, title_max_h, lines, title_font, block_h, truncated = layout_title(data)

    # The title is the one thing the user reads across the room. If it would be
    # cut, give up the "next up" hint — it is the least important row — and
    # re-flow with the reclaimed space.
    if truncated and data.get("nextText"):
        relaxed = dict(data)
        relaxed.pop("nextText", None)
        candidate = layout_title(relaxed)
        if not candidate[6] or candidate[5] > block_h:
            data = relaxed
            fh, title_box_top, title_max_h, lines, title_font, block_h, truncated = candidate

    footer_top = content_bottom - fh

    corner_brackets(draw, (PAD - 2, content_top, WIDTH - PAD + 1, content_bottom), length=8, thickness=2)

    lh = line_height(title_font)
    y = title_box_top + max(0, (title_max_h - block_h) // 2)

    for line in lines:
        w = text_width(draw, line, title_font)
        draw_line_at(draw, line, title_font, (WIDTH - w) // 2, y)
        y += lh + 2

    if fh:
        split_rule(draw, footer_top - 6, PAD + 10, WIDTH - PAD - 10)
        draw_footer(draw, data, footer_top + 1)

    return img


def push_to_display(path, mode="full"):
    """
    Send the rendered PNG to the panel. The import is local so rendering alone
    never requires the SDK.

    `partial` is used for minute-to-minute clock and progress updates: it takes
    ~0.5s and does not flash the whole panel. `full` is used whenever the
    content itself changes, which also clears the ghosting partials leave behind.
    """
    from distiller_sdk.hardware.eink import (
        Display,
        DisplayMode,
        DitheringMethod,
        ScalingMethod,
    )

    with Display() as display:
        display.display_image_auto(
            path,
            mode=DisplayMode.PARTIAL if mode == "partial" else DisplayMode.FULL,
            scaling=ScalingMethod.LETTERBOX,
            # The frame is already pure 1-bit art, so thresholding keeps the
            # hairlines and dither patterns exactly as authored.
            dithering=DitheringMethod.THRESHOLD,
        )


def main():
    if len(sys.argv) < 2:
        print("usage: render_display.py <payload.json>", file=sys.stderr)
        return 2

    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        data = json.load(fh)

    out = data.get("output") or "/tmp/daily-tasks-display.png"
    img = render(data)
    img.save(out)

    if data.get("push"):
        push_to_display(out, data.get("mode") or "full")

    return 0


if __name__ == "__main__":
    sys.exit(main())
