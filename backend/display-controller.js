/**
 * E-ink Display Controller
 *
 * Builds the payload for the 250x128 panel and hands it to render_display.py.
 * The payload travels as a JSON file — nothing is interpolated into a shell
 * command — and the rendered PNG is kept on disk so the web panel can mirror
 * exactly what the device is showing.
 */

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { t } = require('./i18n');

const PYTHON = '/opt/distiller-sdk/.venv/bin/python3';
const SDK_ENV = {
  ...process.env,
  PYTHONPATH: '/opt/distiller-sdk/src',
  LD_LIBRARY_PATH: '/opt/distiller-sdk/lib'
};

const RENDERER = path.join(__dirname, 'render_display.py');
const IMAGE_PATH = path.join(__dirname, '../database/display_temp.png');
const PAYLOAD_PATH = path.join(__dirname, '../database/display_payload.json');

// A full refresh flashes the whole panel and takes ~2-3s, so it is reserved for
// real content changes. The progress bar and remaining time step every 10
// minutes and ride on partial refreshes, which are quiet and fast but leave
// ghosting — so a full refresh is forced back in after a run of them.
const MAX_PARTIALS_BEFORE_FULL = 20;

let lastFrameHash = null;
let lastContentHash = null;
let partialsSinceFull = 0;

/**
 * @param {Object} payload
 * @param {boolean} contentOnly - ignore the fields that tick on their own
 * @returns {string}
 */
function payloadHash(payload, contentOnly = false) {
  const visible = { ...payload };
  delete visible.output;
  delete visible.push;
  delete visible.mode;
  if (contentOnly) {
    // Progress and remaining move in 10-minute steps: a change there is worth a
    // quiet partial refresh, not a full one that flashes the panel.
    delete visible.progress;
    delete visible.remainingText;
  }
  return crypto.createHash('sha1').update(JSON.stringify(visible)).digest('hex');
}

// Rendering shells out to Python and a full e-ink refresh takes 2-3s, so it is
// never done inline with an HTTP request. One render runs at a time; anything
// that arrives while it is busy collapses into a single pending frame, because
// only the newest state is worth drawing.
let rendering = false;
let pending = null;

/**
 * Queue a frame. Returns immediately — the caller never waits on the panel.
 * @param {Object} payload - see render_display.py for the accepted fields
 * @param {Object} [opts]
 * @param {boolean} [opts.push=true] - send the frame to the hardware
 * @param {boolean} [opts.force=false] - push (fully) even when nothing changed
 * @param {string} [opts.output] - override the PNG destination
 * @returns {Promise<{rendered: boolean, pushed: boolean, mode: string, image: string, error?: string}>}
 *          resolves when this frame (or the one that superseded it) is done
 */
function renderFrame(payload, opts = {}) {
  return new Promise((resolve) => {
    // A superseded frame resolves as "skipped" rather than hanging
    if (pending) pending.resolve({ rendered: false, pushed: false, mode: 'skipped', image: IMAGE_PATH });
    pending = { payload, opts, resolve };
    pump();
  });
}

/** Drain the pending frame, one render at a time. */
function pump() {
  if (rendering || !pending) return;

  const { payload, opts, resolve } = pending;
  pending = null;
  rendering = true;

  const { push = true, force = false, output = IMAGE_PATH } = opts;

  const frameHash = payloadHash(payload);
  const contentHash = payloadHash(payload, true);

  let mode = 'full';
  let shouldPush = push;

  if (push && !force) {
    if (frameHash === lastFrameHash) {
      shouldPush = false;
    } else if (contentHash === lastContentHash && partialsSinceFull < MAX_PARTIALS_BEFORE_FULL) {
      mode = 'partial';
    }
  }

  const job = { ...payload, output, push: shouldPush, mode };

  const finish = (result) => {
    rendering = false;
    resolve(result);
    pump();
  };

  try {
    fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(job));
  } catch (error) {
    console.error('❌ Error writing display payload:', error.message);
    return finish({ rendered: false, pushed: false, mode, image: output, error: error.message });
  }

  execFile(PYTHON, [RENDERER, PAYLOAD_PATH], {
    env: SDK_ENV,
    cwd: '/opt/distiller-sdk',
    timeout: 60000
  }, (error, _stdout, stderr) => {
    if (error) {
      const detail = (stderr || error.message).toString().trim();
      console.error('❌ Error updating display:', detail.split('\n').slice(-3).join(' '));
      return finish({ rendered: false, pushed: false, mode, image: output, error: detail });
    }

    if (shouldPush) {
      lastFrameHash = frameHash;
      lastContentHash = contentHash;
      partialsSinceFull = mode === 'partial' ? partialsSinceFull + 1 : 0;
      if (mode === 'full') {
        console.log(`🖼️  Display: "${payload.title}" | ${payload.timeText || '—'}`);
      }
    }

    finish({ rendered: true, pushed: shouldPush, mode, image: output });
  });
}

/**
 * Format a time for display according to the user's preference.
 * @param {string} time24 - "HH:MM"
 * @param {string} format - '12' or '24'
 * @returns {string}
 */
function formatTime(time24, format) {
  if (format === '12') {
    const [hours, minutes] = String(time24).split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
  }
  return time24;
}

/**
 * "45 min" / "2 h" / "1 h 20 min"
 * @param {number} minutes
 * @param {string} lang
 * @returns {string}
 */
function formatDuration(minutes, lang) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return t('display.minutesLeft', lang, { n: total });
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (m === 0) return t('display.hoursLeft', lang, { n: h });
  return t('display.hoursMinutesLeft', lang, { h, m });
}

/**
 * Human label for the active days of an all-day slot ("Lun - Vie", "Todos").
 * @param {Object} slot
 * @param {string} lang
 * @returns {string}
 */
function formatDayRange(activeDays, lang) {
  const days = (activeDays || '0,1,2,3,4,5,6')
    .split(',').map(d => parseInt(d.trim(), 10)).sort((a, b) => a - b);
  const short = [0, 1, 2, 3, 4, 5, 6].map(i => t(`days.short.${i}`, lang));

  if (days.length === 7) return t('display.allDays', lang);
  if (days.length === 1) return short[days[0]];

  const set = new Set(days);
  for (let start = 0; start < 7; start++) {
    let contiguous = true;
    for (let i = 0; i < days.length; i++) {
      if (!set.has((start + i) % 7)) { contiguous = false; break; }
    }
    if (contiguous) return `${short[start]} - ${short[(start + days.length - 1) % 7]}`;
  }
  return days.map(d => short[d]).join(' ');
}

// The panel is only worth waking for a change a human would notice. Remaining
// time and the progress bar are both derived from the same 10-minute bucket, so
// they move together and the frame stays byte-identical in between — which the
// skip-if-unchanged check then turns into no refresh at all.
const PROGRESS_STEP_MINUTES = 10;

/**
 * Short date for the header, e.g. "JUE 17 SEP". Changes once a day.
 * @param {DateTime} now - Luxon DateTime
 * @param {string} lang
 * @returns {string}
 */
function formatHeaderDate(now, lang) {
  const localised = now.setLocale(lang === 'en' ? 'en' : 'es');
  const weekday = localised.toFormat('ccc').replace(/\./g, '');
  // Spanish abbreviates September as "sept"; three letters keeps the header even
  const month = localised.toFormat('LLL').replace(/\./g, '').slice(0, 3);
  return `${weekday} ${localised.day} ${month}`;
}

/**
 * Turn an agenda snapshot into the renderer payload.
 * @param {Object} snapshot - from agenda.snapshot()
 * @param {Object} config - db config map
 * @param {Object} [task] - the local task row behind an active task slot, if any
 * @returns {Object} payload
 */
function buildPayload(snapshot, config, task = null) {
  const lang = config.language || 'es';
  const timeFormat = config.time_format || '24';
  const { active, next } = snapshot;

  const payload = {
    state: active ? 'active' : 'idle',
    dateText: formatHeaderDate(snapshot.now, lang),
    title: active ? active.name : t('display.noTasks', lang),
    statusLabel: active
      ? (active.all_day ? t('display.statusAllDay', lang) : t('display.statusActive', lang))
      : t('display.statusIdle', lang),
    sourceLabel: active && active.source === 'calendar'
      ? (active.calendar_name || t('display.calendar', lang))
      : null,
    timeText: null,
    progress: null,
    remainingText: null,
    nextLabel: null,
    nextText: null
  };

  if (active) {
    if (active.all_day) {
      payload.timeText = active.source === 'calendar'
        ? t('display.allDays', lang)
        : formatDayRange(task ? task.active_days : null, lang);
    } else {
      payload.timeText = `${formatTime(active.start_time, timeFormat)} - ${formatTime(active.end_time, timeFormat)}`;
    }
    // Round the remaining time up to the next bucket, then derive the bar from
    // that same number so the text and the bar can never disagree
    const bucketed = Math.min(
      snapshot.duration,
      Math.ceil(snapshot.remaining / PROGRESS_STEP_MINUTES) * PROGRESS_STEP_MINUTES
    );
    payload.progress = snapshot.duration > 0
      ? Math.min(1, Math.max(0, 1 - bucketed / snapshot.duration))
      : 0;
    payload.remainingText = bucketed < PROGRESS_STEP_MINUTES
      ? `< ${t('display.minutesLeft', lang, { n: PROGRESS_STEP_MINUTES })}`
      : formatDuration(bucketed, lang);
  }

  if (next) {
    payload.nextLabel = next.isTomorrow ? t('display.nextTomorrow', lang) : t('display.next', lang);
    payload.nextText = `${formatTime(next.start_time, timeFormat)}  ${next.name}`;
  } else if (!active) {
    payload.timeText = t('display.freeRestOfDay', lang);
  }

  return payload;
}

/**
 * Render and push the frame for the current snapshot.
 * @param {Object} snapshot
 * @param {Object} config
 * @param {Object} [task]
 * @param {Object} [opts] - forwarded to renderFrame
 * @returns {Object} result
 */
function showSnapshot(snapshot, config, task = null, opts = {}) {
  return renderFrame(buildPayload(snapshot, config, task), opts);
}

/**
 * Boot splash.
 * @param {string} lang
 */
function showBootScreen(lang = 'es') {
  return renderFrame({
    state: 'boot',
    title: t('display.systemStarted', lang),
    statusLabel: t('display.statusBoot', lang)
  }, { force: true });
}

/**
 * Path of the most recently rendered PNG, for the web preview endpoint.
 * @returns {string|null}
 */
function getRenderedImagePath() {
  return fs.existsSync(IMAGE_PATH) ? IMAGE_PATH : null;
}

module.exports = {
  renderFrame,
  buildPayload,
  showSnapshot,
  showBootScreen,
  formatHeaderDate,
  getRenderedImagePath,
  formatTime,
  formatDuration,
  formatDayRange,
  IMAGE_PATH
};
