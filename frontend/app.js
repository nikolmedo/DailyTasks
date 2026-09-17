/**
 * Daily Tasks — control panel
 *
 * Vanilla JS against the REST API. The whole interface takes its accent colour
 * from whatever the device's LED is currently holding, so the browser and the
 * hardware always read as one system.
 */

const API = '.';

// ─────────────────────────────────────────────────────────── Timezones ──────
const TIMEZONES = [
  { id: 'America/Los_Angeles',            key: 'pacific' },
  { id: 'America/Denver',                 key: 'mountain' },
  { id: 'America/Chicago',                key: 'central' },
  { id: 'America/New_York',               key: 'eastern' },
  { id: 'America/Halifax',                key: 'atlantic' },
  { id: 'America/St_Johns',               key: 'newfoundland' },
  { id: 'America/Anchorage',              key: 'alaska' },
  { id: 'Pacific/Honolulu',               key: 'hawaii' },
  { id: 'America/Mexico_City',            key: 'mexicoCity' },
  { id: 'America/Managua',                key: 'centralAmerica' },
  { id: 'America/Panama',                 key: 'panama' },
  { id: 'America/Bogota',                 key: 'bogota' },
  { id: 'America/Caracas',                key: 'caracas' },
  { id: 'America/Lima',                   key: 'lima' },
  { id: 'America/Santiago',               key: 'santiago' },
  { id: 'America/Argentina/Buenos_Aires', key: 'buenosAires' },
  { id: 'America/Sao_Paulo',              key: 'saoPaulo' },
  { id: 'UTC',                            key: 'utc' },
  { id: 'Europe/London',                  key: 'london' },
  { id: 'Europe/Madrid',                  key: 'madrid' },
  { id: 'Europe/Berlin',                  key: 'berlin' },
  { id: 'Europe/Helsinki',                key: 'helsinki' },
  { id: 'Europe/Moscow',                  key: 'moscow' },
  { id: 'Africa/Cairo',                   key: 'cairo' },
  { id: 'Africa/Nairobi',                 key: 'nairobi' },
  { id: 'Asia/Dubai',                     key: 'dubai' },
  { id: 'Asia/Tehran',                    key: 'tehran' },
  { id: 'Asia/Karachi',                   key: 'karachi' },
  { id: 'Asia/Kolkata',                   key: 'kolkata' },
  { id: 'Asia/Dhaka',                     key: 'dhaka' },
  { id: 'Asia/Bangkok',                   key: 'bangkok' },
  { id: 'Asia/Shanghai',                  key: 'shanghai' },
  { id: 'Asia/Hong_Kong',                 key: 'hongKong' },
  { id: 'Asia/Seoul',                     key: 'seoul' },
  { id: 'Asia/Tokyo',                     key: 'tokyo' },
  { id: 'Australia/Adelaide',             key: 'adelaide' },
  { id: 'Australia/Sydney',               key: 'sydney' },
  { id: 'Pacific/Auckland',               key: 'auckland' }
];

const LED_PRESETS = ['#5ad1c4', '#e0a34a', '#e2705f', '#7f9cf5', '#a3d977', '#d987c4'];
const DEFAULT_LED = '90, 209, 196';
const DONE_LIMIT = 5;

// ─────────────────────────────────────────────────────────────── State ──────
const state = {
  tasks: [],
  calendars: [],
  config: {},
  status: null,
  agendaSlots: [],
  scope: 'today',
  query: '',
  showAllDone: false,
  editingId: null,
  ledOff: false,
  calLedOff: false,
  lastClock: null,
  online: true,
  // Markup of the last paint of each list. Polling runs every 15s and almost
  // always produces identical HTML; rewriting innerHTML anyway would restart
  // the entry animations and make the page visibly flicker.
  painted: { tasks: null, timeline: null, calendars: null }
};

// ────────────────────────────────────────────────────────────── DOM refs ────
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

const el = {
  dateLabel: $('dateLabel'),
  connPill: $('connPill'),
  connZone: $('connZone'),
  refreshStatusBtn: $('refreshStatusBtn'),
  addTaskBtn: $('addTaskBtn'),
  fabBtn: $('fabBtn'),

  nowPanel: $('nowPanel'),
  nowStatusTag: $('nowStatusTag'),
  nowSource: $('nowSource'),
  nowTitle: $('nowTitle'),
  nowClock: $('nowClock'),
  nowRange: $('nowRange'),
  nowRemaining: $('nowRemaining'),
  nowProgress: $('nowProgress'),
  nowProgressFill: $('nowProgressFill'),
  nowNext: $('nowNext'),
  nowNextText: $('nowNextText'),

  timeline: $('timeline'),
  timelineScale: $('timelineScale'),
  timelineTrack: $('timelineTrack'),
  timelineNow: $('timelineNow'),
  timelineNote: $('timelineNote'),

  tasksList: $('tasksList'),
  taskCount: $('taskCount'),
  searchInput: $('searchInput'),
  scopeSwitch: $('scopeSwitch'),

  einkPreview: $('einkPreview'),
  devRefreshBtn: $('devRefreshBtn'),
  ledChip: $('ledChip'),
  ledChipText: $('ledChipText'),
  schedulerState: $('schedulerState'),

  calendarList: $('calendarList'),
  addCalendarBtn: $('addCalendarBtn'),
  syncCalendarsBtn: $('syncCalendarsBtn'),

  brightness: $('brightness'),
  brightnessValue: $('brightnessValue'),
  timezone: $('timezone'),
  timeFormat: $('timeFormat'),
  language: $('language'),
  syncInterval: $('syncInterval'),
  saveConfigBtn: $('saveConfigBtn'),
  dstIndicator: $('dstIndicator'),

  scrim: $('scrim'),
  taskSheet: $('taskSheet'),
  taskForm: $('taskForm'),
  sheetTitle: $('sheetTitle'),
  closeSheetBtn: $('closeSheetBtn'),
  cancelSheetBtn: $('cancelSheetBtn'),
  taskId: $('taskId'),
  taskName: $('taskName'),
  startTime: $('startTime'),
  endTime: $('endTime'),
  timeRow: $('timeRow'),
  allDayCheck: $('allDayCheck'),
  dayPicker: $('dayPicker'),
  colorSwatch: $('colorSwatch'),
  ledColorPicker: $('ledColorPicker'),
  colorValue: $('colorValue'),
  colorPresets: $('colorPresets'),
  ledOffBtn: $('ledOffBtn'),
  ledColor: $('ledColor'),
  formHint: $('formHint'),

  calendarSheet: $('calendarSheet'),
  calendarForm: $('calendarForm'),
  closeCalSheetBtn: $('closeCalSheetBtn'),
  cancelCalSheetBtn: $('cancelCalSheetBtn'),
  calUrl: $('calUrl'),
  calName: $('calName'),
  calColorSwatch: $('calColorSwatch'),
  calColorPicker: $('calColorPicker'),
  calColorValue: $('calColorValue'),
  calLedOffBtn: $('calLedOffBtn'),
  calSubmitBtn: $('calSubmitBtn'),
  calFormHint: $('calFormHint'),

  toasts: $('toasts')
};

// ─────────────────────────────────────────────────────────────── Utils ──────

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : text;
  return d.innerHTML;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function parseRgb(value) {
  if (!value || value === 'null') return null;
  const parts = String(value).split(',').map(v => parseInt(v.trim(), 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

/**
 * Lift a colour until it is legible against the graphite substrate.
 *
 * The LED is driven at full brightness so a deep colour like "96,61,11" looks
 * right on the hardware, but the same value painted on a near-black panel is
 * invisible. Only the on-screen rendering is adjusted — the value sent to the
 * device is never touched.
 *
 * @param {{r:number,g:number,b:number}} rgb
 * @param {number} minL - floor for lightness, 0..1
 * @returns {{r:number,g:number,b:number}}
 */
function liftForScreen(rgb, minL = 0.52) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (l >= minL || max === min) {
    // Greys still need a floor, colours bright enough are left alone
    if (max !== min) return rgb;
    const v = Math.max(Math.round(minL * 255), rgb.r);
    return { r: v, g: v, b: v };
  }

  // Scale towards white, preserving hue
  const factor = minL / Math.max(l, 0.04);
  return {
    r: Math.min(255, Math.round(rgb.r * factor)),
    g: Math.min(255, Math.round(rgb.g * factor)),
    b: Math.min(255, Math.round(rgb.b * factor))
  };
}

/**
 * CSS-ready "r, g, b" for on-screen use, brightened when necessary.
 * @param {string} value - stored "r,g,b" or null
 * @param {string} fallback
 * @returns {string}
 */
function rgbTriplet(value, fallback = '236, 232, 221') {
  const rgb = parseRgb(value);
  if (!rgb) return fallback;
  const lifted = liftForScreen(rgb);
  return `${lifted.r}, ${lifted.g}, ${lifted.b}`;
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Render a stored 24h time in the user's chosen format.
 * @param {string} value - "HH:MM"
 * @returns {string}
 */
function fmtTime(value) {
  if (!/^\d{1,2}:\d{2}/.test(String(value))) return value || '';
  if (state.config.time_format !== '12') return value;
  const [h, m] = String(value).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * "45 min" / "2 h" / "1 h 20 min"
 * @param {number} minutes
 * @returns {string}
 */
function fmtDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return i18n.t('units.minutes', { n: total });
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? i18n.t('units.hours', { n: h }) : i18n.t('units.hoursMinutes', { h, m });
}

function fmtRelative(iso) {
  if (!iso) return i18n.t('calendar.neverSynced');
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (!Number.isFinite(diff)) return i18n.t('calendar.neverSynced');
  if (diff < 1) return i18n.t('calendar.lastSync', { time: i18n.t('units.minutesShort', { n: 0 }) });
  return i18n.t('calendar.lastSync', { time: fmtDuration(diff) });
}

/**
 * The timezone the device is actually scheduling in.
 *
 * `/api/status` reports the zone the backend resolved, defaults included, so it
 * is preferred over the raw config value — which can be blank. Falling back to
 * the browser's zone would make the panel disagree with the device whenever the
 * two differ.
 * @returns {string} IANA zone
 */
function deviceTimezone() {
  return state.status?.timezone || state.config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Day-of-week (0=Sun) in the device's timezone. */
function todayDow() {
  try {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: deviceTimezone(),
      weekday: 'short'
    }).formatToParts(new Date());
    return names.indexOf(parts.find(p => p.type === 'weekday')?.value ?? '');
  } catch {
    return new Date().getDay();
  }
}

// ──────────────────────────────────────────────────────── Timezone info ─────

function gmtOffset(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date());
    const found = parts.find(p => p.type === 'timeZoneName');
    if (!found) return 'UTC';
    return found.value.replace(/^GMT([+-])0$/, 'UTC').replace(/^GMT/, 'UTC');
  } catch {
    return 'UTC';
  }
}

function shortOffset(tz, date) {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(date);
    return parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
  } catch {
    return 'GMT';
  }
}

function offsetMinutes(value) {
  const m = String(value).match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return 0;
  return (m[1] === '+' ? 1 : -1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
}

function dstInfo(tz) {
  const year = new Date().getFullYear();
  const jan = shortOffset(tz, new Date(year, 0, 15));
  const jul = shortOffset(tz, new Date(year, 6, 15));
  if (jan === jul) return { observes: false, active: false };
  const std = offsetMinutes(jan) <= offsetMinutes(jul) ? jan : jul;
  return { observes: true, active: shortOffset(tz, new Date()) !== std };
}

function updateDst(tz) {
  const { observes, active } = dstInfo(tz);
  el.dstIndicator.hidden = !observes;
  if (!observes) return;
  el.dstIndicator.textContent = active ? i18n.t('settings.dst') : i18n.t('settings.dstInactive');
  el.dstIndicator.className = `dst${active ? ' on' : ''}`;
}

function fillTimezones(selected) {
  el.timezone.innerHTML = '';
  for (const zone of TIMEZONES) {
    const opt = document.createElement('option');
    opt.value = zone.id;
    opt.textContent = `${i18n.t(`tz.${zone.key}`)} (${gmtOffset(zone.id)})`;
    el.timezone.appendChild(opt);
  }
  el.timezone.value = selected || 'America/Los_Angeles';
  if (!el.timezone.value) el.timezone.selectedIndex = 0;
  updateDst(el.timezone.value);
}

// ────────────────────────────────────────────────────────────── Toasts ──────

let toastSeq = 0;

/**
 * Show a toast. When `action` is given the toast stays long enough to be used
 * and shows a countdown hairline.
 * @param {string} message
 * @param {Object} [opts]
 * @param {'success'|'error'} [opts.type]
 * @param {{label: string, onClick: Function}} [opts.action]
 * @param {number} [opts.duration]
 */
function toast(message, opts = {}) {
  const { type = 'success', action = null, duration = action ? 6000 : 3200 } = opts;
  const id = `toast-${++toastSeq}`;

  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.id = id;
  node.innerHTML = `
    <span class="toast-mark" aria-hidden="true"></span>
    <span class="toast-text">${escapeHtml(message)}</span>
    ${action ? `<button type="button" class="toast-action">${escapeHtml(action.label)}</button>` : ''}
    <span class="toast-timer" style="--dur:${duration}ms" aria-hidden="true"></span>
  `;

  const dismiss = () => {
    if (!node.isConnected) return;
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  };

  if (action) {
    node.querySelector('.toast-action').addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
  }

  el.toasts.appendChild(node);
  setTimeout(dismiss, duration);
  return dismiss;
}

// ───────────────────────────────────────────────────────────────── API ──────

/**
 * Fetch JSON with uniform error handling and connection tracking.
 * @param {string} path
 * @param {Object} [options]
 * @returns {Promise<Object>} the parsed body
 * @throws {Error} on network failure or a non-success payload
 */
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, options);
  } catch (error) {
    setOnline(false);
    throw new Error(i18n.t('app.offline'));
  }
  setOnline(true);

  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  if (!res.ok || body.success === false) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  el.connPill.dataset.state = online ? 'ok' : 'down';
  if (online) toast(i18n.t('app.reconnected'));
}

async function loadConfig() {
  const { data } = await api('/api/config');
  state.config = data;
  await i18n.load(data.language || 'es');
  i18n.apply();
  syncConfigUI();
}

async function loadTasks() {
  const { data } = await api('/api/tasks');
  state.tasks = data;
}

async function loadStatus() {
  const { data } = await api('/api/status');
  state.status = data;
  state.agendaSlots = data.agenda || [];
}

async function loadCalendars() {
  const { data } = await api('/api/calendars');
  state.calendars = data;
}

// ────────────────────────────────────────────────────── Colour plumbing ─────

/**
 * Push the active task's colour into the CSS custom properties that the whole
 * interface reads from.
 * @param {string|null} ledColor - "r,g,b"
 */
function applyTint(ledColor) {
  const rgb = parseRgb(ledColor);
  if (rgb) {
    const ui = liftForScreen(rgb, 0.58);
    root.style.setProperty('--led', `${ui.r}, ${ui.g}, ${ui.b}`);
    // A complementary-ish partner for the second ambient glow
    root.style.setProperty('--led-2', `${ui.b}, ${Math.round(ui.r * 0.6 + 60)}, ${Math.round(ui.g * 0.7 + 40)}`);
  } else {
    // A task with the LED disabled still needs legible chrome, so the house
    // accent stays. The LED readout in the device panel is what reports "off".
    root.style.setProperty('--led', DEFAULT_LED);
    root.style.setProperty('--led-2', '224, 163, 74');
  }
}

// ───────────────────────────────────────────────────────── Now instrument ───

function renderNow() {
  const status = state.status;
  if (!status) return;

  // Clock, with a roll animation when the minute changes
  const clock = fmtTime(status.currentTime || '--:--');
  if (clock !== state.lastClock) {
    el.nowClock.textContent = clock;
    el.nowClock.classList.remove('tick');
    void el.nowClock.offsetWidth;
    el.nowClock.classList.add('tick');
    state.lastClock = clock;
  }

  el.connZone.textContent = (status.timezone || '').split('/').pop().replace(/_/g, ' ');

  const active = status.activeTask;
  el.nowPanel.dataset.active = active ? 'true' : 'false';

  const tagText = el.nowStatusTag.querySelector('span:last-child');
  if (active) {
    el.nowTitle.textContent = active.name;
    el.nowTitle.removeAttribute('data-i18n');
    tagText.textContent = active.all_day ? i18n.t('app.statusAllDay') : i18n.t('app.statusActive');

    el.nowSource.hidden = active.source !== 'calendar';
    if (active.source === 'calendar') {
      el.nowSource.textContent = active.calendar_name || i18n.t('calendar.title');
    }

    el.nowRange.textContent = active.all_day
      ? i18n.t('tasks.allDays')
      : `${fmtTime(active.start_time)} → ${fmtTime(active.end_time)}`;
    el.nowRemaining.textContent = i18n.t('app.remaining', { time: fmtDuration(status.remainingMinutes || 0) });

    el.nowProgress.hidden = false;
    el.nowProgressFill.style.setProperty('--p', String(status.progress || 0));
  } else {
    el.nowTitle.textContent = i18n.t('app.freeNow');
    el.nowTitle.setAttribute('data-i18n', 'app.freeNow');
    tagText.textContent = i18n.t('app.statusIdle');
    el.nowSource.hidden = true;
    el.nowRange.textContent = '';
    el.nowRemaining.textContent = '';
    el.nowProgress.hidden = true;
  }

  const next = status.nextTask;
  el.nowNext.hidden = !next;
  if (next) {
    el.nowNext.querySelector('.now-next-label').textContent =
      next.isTomorrow ? i18n.t('app.nextTomorrow') : i18n.t('app.nextUp');
    el.nowNextText.textContent = `${fmtTime(next.start_time)} · ${next.name}`;
  }

  applyTint(active ? active.led_color : null);

  // Device readouts
  const lit = Boolean(active && active.led_color);
  el.ledChip.dataset.on = String(lit);
  el.ledChipText.textContent = status.ledAvailable === false
    ? i18n.t('device.ledUnavailable')
    : (lit ? i18n.t('device.ledOn') : i18n.t('device.ledOff'));
  el.schedulerState.textContent = status.schedulerRunning
    ? i18n.t('device.schedulerOn')
    : i18n.t('device.schedulerOff');
}

// ──────────────────────────────────────────────────────────── Timeline ──────

function renderTimelineScale() {
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  el.timelineScale.innerHTML = hours.map((h, idx) => {
    const minor = idx % 2 === 1;
    const label = state.config.time_format === '12'
      ? (h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : (h > 12 ? `${h - 12}p` : `${h}a`))
      : String(h).padStart(2, '0');
    return `<span class="timeline-tick${minor ? ' minor' : ''}" style="--x:${(h / 24) * 100}%">${label}</span>`;
  }).join('');
}

/**
 * Lay the day's slots onto rows so overlapping blocks never sit on top of
 * each other (a simple greedy interval-packing).
 * @param {Array<Object>} slots
 * @returns {Array<Array<Object>>} rows
 */
function packRows(slots) {
  const rows = [];
  for (const slot of slots) {
    const start = slot.startMinutes;
    const end = slot.crossesMidnight ? 1440 : slot.endMinutes;
    const row = rows.find(r => r.every(s => {
      const sEnd = s.crossesMidnight ? 1440 : s.endMinutes;
      return start >= sEnd || end <= s.startMinutes;
    }));
    if (row) row.push(slot);
    else rows.push([slot]);
  }
  return rows;
}

function renderTimeline() {
  const slots = state.agendaSlots.filter(s => !s.done);
  const nowMinutes = state.status ? timeToMinutes(state.status.currentTime) : 0;

  el.timelineNow.style.setProperty('--x', `${(nowMinutes / 1440) * 100}%`);
  el.timelineNote.textContent = slots.length
    ? `${slots.length} · ${i18n.t('tasks.filterToday')}`
    : '';

  if (slots.length === 0) {
    paint(el.timelineTrack, `<div class="timeline-empty">${escapeHtml(i18n.t('timeline.empty'))}</div>`, 'timeline');
    return;
  }

  const rows = packRows(slots.slice().sort((a, b) => a.startMinutes - b.startMinutes));
  let index = 0;

  const html = rows.map(row => {
    const blocks = row.map(slot => {
      const end = slot.crossesMidnight ? 1440 : slot.endMinutes;
      const left = (slot.startMinutes / 1440) * 100;
      const width = Math.max(0.6, ((end - slot.startMinutes) / 1440) * 100);
      const isNow = state.status?.activeTask?.key === slot.key;
      const classes = [
        'timeline-block',
        width > 11 ? 'wide' : '',
        isNow ? 'is-now' : '',
        slot.source === 'calendar' ? 'is-calendar' : ''
      ].filter(Boolean).join(' ');

      return `<button type="button" class="${classes}"
        style="--a:${left}%; --w:${width}%; --c:${rgbTriplet(slot.led_color)}; --i:${index++}"
        data-key="${escapeHtml(slot.key)}"
        title="${escapeHtml(`${slot.name} · ${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)}`)}">
        <span class="timeline-block-label">${escapeHtml(slot.name)}</span>
      </button>`;
    }).join('');
    return `<div class="timeline-row">${blocks}</div>`;
  }).join('');

  paint(el.timelineTrack, html, 'timeline');
}

// ─────────────────────────────────────────────────────────── Task cards ─────

function formatDays(daysStr) {
  if (!daysStr) return i18n.t('tasks.allDays');
  const days = daysStr.split(',').map(d => parseInt(d.trim(), 10)).sort((a, b) => a - b);
  if (days.length === 7) return i18n.t('tasks.allDays');
  if (days.length === 0) return i18n.t('tasks.noDays');
  if (days.join(',') === '1,2,3,4,5') return i18n.t('tasks.weekdays');
  if (days.join(',') === '0,6') return i18n.t('tasks.weekends');
  const letters = [0, 1, 2, 3, 4, 5, 6].map(i => i18n.t(`days.letter.${i}`));
  return days.map(d => letters[d]).join(' · ');
}

function isScheduledToday(task) {
  if (!task.active_days) return true;
  return task.active_days.split(',').map(d => parseInt(d.trim(), 10)).includes(todayDow());
}

function isPastToday(task) {
  if (task.all_day || !state.status?.currentTime) return false;
  const now = timeToMinutes(state.status.currentTime);
  const start = timeToMinutes(task.start_time);
  const end = timeToMinutes(task.end_time);
  return end < start ? (now >= end && now < start) : now >= end;
}

/**
 * Does this task's window collide with another task scheduled on a shared day?
 * @param {Object} task
 * @returns {boolean}
 */
function hasOverlap(task) {
  if (task.all_day || task.done) return false;
  const days = new Set((task.active_days || '0,1,2,3,4,5,6').split(',').map(d => d.trim()));
  const start = timeToMinutes(task.start_time);
  const end = timeToMinutes(task.end_time);
  if (end <= start) return false;

  return state.tasks.some(other => {
    if (other.id === task.id || other.done || other.all_day) return false;
    const otherDays = (other.active_days || '0,1,2,3,4,5,6').split(',').map(d => d.trim());
    if (!otherDays.some(d => days.has(d))) return false;
    const oStart = timeToMinutes(other.start_time);
    const oEnd = timeToMinutes(other.end_time);
    if (oEnd <= oStart) return false;
    return start < oEnd && oStart < end;
  });
}

const ICONS = {
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  power: `<svg viewBox="0 0 24 24"><path d="M12 3v9"/><path d="M6.3 6.3a8.5 8.5 0 1 0 11.4 0"/></svg>`
};

/**
 * @param {Object} task - row from /api/tasks
 * @param {number} index - for the stagger delay
 * @returns {string} HTML
 */
function taskCard(task, index) {
  const done = Boolean(task.done);
  const isNow = !done && state.status?.activeTask?.key === `task:${task.id}`;
  const past = !done && isPastToday(task);
  const overlap = hasOverlap(task);
  const tint = rgbTriplet(task.led_color);
  const lit = task.led_color && task.led_color !== 'null' ? 0.5 : 0.14;

  const badges = [
    isNow ? `<span class="badge badge-now">${escapeHtml(i18n.t('app.statusActive'))}</span>` : '',
    overlap ? `<span class="badge badge-warn" title="${escapeHtml(i18n.t('task.overlaps'))}">${ICONS.warn}</span>` : ''
  ].join('');

  const when = task.all_day
    ? i18n.t('task.allDay')
    : `${fmtTime(task.start_time)} → ${fmtTime(task.end_time)}`;

  return `
    <article class="task${done ? ' is-done' : ''}${past ? ' is-past' : ''}"
             data-id="${task.id}" data-now="${isNow}"
             style="--c:${tint}; --lit:${lit}; --i:${index}">
      <label class="task-check" aria-label="${escapeHtml(i18n.t(done ? 'task.unmarkDone' : 'task.markDone'))}">
        <input type="checkbox" ${done ? 'checked' : ''} data-action="toggle" data-id="${task.id}">
        <span class="task-box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      </label>

      <div class="task-body">
        <div class="task-name-row">
          <span class="task-name">${escapeHtml(task.name)}</span>
          ${badges}
        </div>
        <div class="task-meta mono">
          <span>${escapeHtml(when)}</span>
          <span class="sep" aria-hidden="true"></span>
          <span class="task-days">${escapeHtml(formatDays(task.active_days))}</span>
        </div>
      </div>

      <div class="task-actions">
        <button class="task-action" type="button" data-action="edit" data-id="${task.id}"
                aria-label="${escapeHtml(i18n.t('task.editAction'))}">${ICONS.edit}</button>
        <button class="task-action danger" type="button" data-action="delete" data-id="${task.id}"
                aria-label="${escapeHtml(i18n.t('task.deleteAction'))}">${ICONS.trash}</button>
      </div>
    </article>`;
}

/**
 * Calendar occurrences render as read-only rows alongside the local tasks.
 * @param {Object} slot - from the agenda
 * @param {number} index
 * @returns {string} HTML
 */
function eventCard(slot, index) {
  const isNow = state.status?.activeTask?.key === slot.key;
  const tint = rgbTriplet(slot.led_color);
  const when = slot.all_day
    ? i18n.t('task.allDay')
    : `${fmtTime(slot.start_time)} → ${fmtTime(slot.end_time)}`;

  return `
    <article class="task is-calendar" data-now="${isNow}"
             style="--c:${tint}; --lit:0.45; --i:${index}">
      <span class="task-check" aria-hidden="true">
        <span class="task-box">${ICONS.calendar}</span>
      </span>
      <div class="task-body">
        <div class="task-name-row">
          <span class="task-name">${escapeHtml(slot.name)}</span>
          ${isNow ? `<span class="badge badge-now">${escapeHtml(i18n.t('app.statusActive'))}</span>` : ''}
          <span class="badge badge-cal">${ICONS.calendar}${escapeHtml(slot.calendar_name || i18n.t('calendar.title'))}</span>
        </div>
        <div class="task-meta mono">
          <span>${escapeHtml(when)}</span>
          <span class="sep" aria-hidden="true"></span>
          <span class="task-days">${escapeHtml(i18n.t('calendar.readOnly'))}</span>
        </div>
      </div>
      <div class="task-actions"></div>
    </article>`;
}

function emptyState(text, hint) {
  return `
    <div class="empty">
      <div class="empty-mark" aria-hidden="true"></div>
      <p class="empty-text">${escapeHtml(text)}</p>
      <p class="empty-hint">${escapeHtml(hint)}</p>
    </div>`;
}

function renderTasks() {
  const query = state.query.trim().toLowerCase();
  const matches = (name) => !query || String(name).toLowerCase().includes(query);

  const todayScope = state.scope === 'today';

  let tasks = state.tasks.filter(t => matches(t.name));
  if (todayScope) tasks = tasks.filter(t => isScheduledToday(t));

  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  // Calendar occurrences only make sense inside the "today" scope
  const events = todayScope
    ? state.agendaSlots.filter(s => s.source === 'calendar' && matches(s.name))
    : [];

  el.taskCount.textContent = pending.length + events.length === 0
    ? '—'
    : String(pending.length + events.length).padStart(2, '0');

  if (pending.length === 0 && events.length === 0 && done.length === 0) {
    paint(el.tasksList, query
      ? emptyState(i18n.t('tasks.noResults', { q: state.query }), i18n.t('tasks.noResultsHint'))
      : todayScope
        ? emptyState(i18n.t('tasks.todayEmptyText'), i18n.t('tasks.todayEmptyHint'))
        : emptyState(i18n.t('tasks.emptyText'), i18n.t('tasks.emptyHint')), 'tasks');
    return;
  }

  // Interleave tasks and events by start time so the list reads as one day
  const merged = [
    ...pending.map(t => ({ kind: 'task', sort: t.all_day ? -1 : timeToMinutes(t.start_time), item: t })),
    ...events.map(s => ({ kind: 'event', sort: s.all_day ? -1 : s.startMinutes, item: s }))
  ].sort((a, b) => a.sort - b.sort);

  let index = 0;
  let html = merged
    .map(entry => entry.kind === 'task' ? taskCard(entry.item, index++) : eventCard(entry.item, index++))
    .join('');

  if (done.length > 0) {
    const visible = state.showAllDone ? done : done.slice(0, DONE_LIMIT);
    const hidden = done.length - visible.length;

    html += `<div class="done-group">
      <div class="done-head">${escapeHtml(i18n.t('tasks.completed'))} · ${done.length}</div>
      ${visible.map(task => taskCard(task, index++)).join('')}
      ${hidden > 0
        ? `<button class="more-btn" type="button" data-action="show-more">${escapeHtml(i18n.t('tasks.showMore', { n: hidden }))}</button>`
        : state.showAllDone && done.length > DONE_LIMIT
          ? `<button class="more-btn" type="button" data-action="show-more">${escapeHtml(i18n.t('tasks.hideOld'))}</button>`
          : ''}
    </div>`;
  }

  paint(el.tasksList, html, 'tasks');
}

// ───────────────────────────────────────────────────────────── Calendars ────

function calendarRow(cal) {
  const tint = rgbTriplet(cal.led_color, '224, 163, 74');
  const meta = [
    cal.last_error
      ? `<span class="err" title="${escapeHtml(cal.last_error)}">${escapeHtml(i18n.t('calendar.error'))}</span>`
      : escapeHtml(i18n.t('calendar.events', { n: cal.event_count })),
    cal.enabled ? escapeHtml(fmtRelative(cal.last_sync)) : escapeHtml(i18n.t('calendar.paused'))
  ].join(' <span class="sep" aria-hidden="true">·</span> ');

  return `
    <div class="cal${cal.enabled ? '' : ' is-off'}" style="--c:${tint}" data-id="${cal.id}">
      <span class="cal-dot" aria-hidden="true"></span>
      <div class="cal-body">
        <span class="cal-name">${escapeHtml(cal.name)}</span>
        <span class="cal-meta mono">${meta}</span>
      </div>
      <div class="cal-actions">
        <button class="task-action" type="button" data-cal-action="toggle" data-id="${cal.id}"
                aria-label="${escapeHtml(i18n.t(cal.enabled ? 'calendar.disable' : 'calendar.enable'))}"
                title="${escapeHtml(i18n.t(cal.enabled ? 'calendar.disable' : 'calendar.enable'))}">${ICONS.power}</button>
        <button class="task-action danger" type="button" data-cal-action="delete" data-id="${cal.id}"
                aria-label="${escapeHtml(i18n.t('calendar.remove'))}"
                title="${escapeHtml(i18n.t('calendar.remove'))}">${ICONS.trash}</button>
      </div>
    </div>`;
}

function renderCalendars() {
  const html = state.calendars.length === 0
    ? `<div class="empty" style="padding:22px 10px">
        <p class="empty-text">${escapeHtml(i18n.t('calendar.empty'))}</p>
        <p class="empty-hint">${escapeHtml(i18n.t('calendar.emptyHint'))}</p>
      </div>`
    : state.calendars.map(calendarRow).join('');

  paint(el.calendarList, html, 'calendars');
}

/**
 * Write markup only when it actually changed, and mark the container so the
 * CSS entry animations run on the first paint instead of on every poll.
 * @param {HTMLElement} container
 * @param {string} html
 * @param {string} key - slot in `state.painted`
 */
function paint(container, html, key) {
  if (state.painted[key] === html) return;

  const first = state.painted[key] === null;
  state.painted[key] = html;
  container.innerHTML = html;
  container.classList.toggle('is-first-paint', first);
}

// ───────────────────────────────────────────────────────── Config panel ─────

function syncConfigUI() {
  const brightness = state.config.brightness || 100;
  el.brightness.value = brightness;
  el.brightnessValue.textContent = `${brightness}%`;
  paintSlider(el.brightness);

  el.timeFormat.value = state.config.time_format || '24';
  el.language.value = state.config.language || 'es';
  el.syncInterval.value = state.config.calendar_sync_minutes || '15';

  fillTimezones(state.config.timezone || deviceTimezone());
  renderTimelineScale();
}

function paintSlider(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.backgroundSize = `${pct}% 100%`;
}

function updateDateLabel() {
  const locale = i18n.currentLang() === 'en' ? 'en-US' : 'es-ES';
  // The device's timezone, not the browser's — otherwise the header can claim a
  // different day from the tasks, the timeline and the e-ink panel.
  const opts = { weekday: 'long', day: 'numeric', month: 'long', timeZone: deviceTimezone() };

  let text;
  try {
    text = new Intl.DateTimeFormat(locale, opts).format(new Date());
  } catch {
    text = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  el.dateLabel.textContent = i18n.t('app.today', { date: text.charAt(0).toUpperCase() + text.slice(1) });
}

/**
 * Re-fetch the e-ink mirror.
 *
 * The device renders the frame asynchronously, so after a change the preview is
 * fetched again a moment later to pick up the new artwork rather than the frame
 * that was on screen when the request went out.
 * @param {boolean} [afterChange=false]
 */
function refreshEinkPreview(afterChange = false) {
  // Decode into a detached Image first and only swap the visible src once it is
  // ready — assigning src directly blanks the frame while the new PNG loads.
  const load = () => {
    const url = `${API}/api/display/preview.png?t=${Date.now()}`;
    const probe = new Image();
    probe.onload = () => {
      el.einkPreview.src = url;
      el.einkPreview.style.visibility = 'visible';
    };
    probe.src = url;
  };
  load();
  if (afterChange) {
    setTimeout(load, 1200);
    setTimeout(load, 3500);
  }
}

// ────────────────────────────────────────────────────────── Full render ─────

function renderAll() {
  renderNow();
  renderTimeline();
  renderTasks();
  renderCalendars();
  updateDateLabel();
  positionSegmentThumb();
}

// ─────────────────────────────────────────────────────── Task mutations ─────

async function toggleDone(id) {
  try {
    const { data } = await api(`/api/tasks/${id}/done`, { method: 'PATCH' });
    const index = state.tasks.findIndex(t => t.id === Number(id));
    if (index !== -1) state.tasks[index] = data;
    await loadStatus();
    renderAll();
    refreshEinkPreview(true);
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorUpdateTask'), { type: 'error' });
  }
}

/**
 * Delete without a blocking confirm: the row animates out and the toast offers
 * an undo that re-creates it.
 * @param {number|string} id
 */
async function deleteTask(id) {
  const card = el.tasksList.querySelector(`.task[data-id="${id}"]`);
  if (card) card.classList.add('removing');

  try {
    const { data: removed } = await api(`/api/tasks/${id}`, { method: 'DELETE' });
    await Promise.all([loadTasks(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);

    toast(i18n.t('notifications.taskDeleted'), {
      action: {
        label: i18n.t('notifications.undo'),
        onClick: () => restoreTask(removed)
      }
    });
  } catch (error) {
    if (card) card.classList.remove('removing');
    toast(error.message || i18n.t('notifications.errorDeleteTask'), { type: 'error' });
  }
}

async function restoreTask(task) {
  if (!task) return;
  try {
    await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: task.name,
        start_time: task.start_time,
        end_time: task.end_time,
        led_color: task.led_color,
        active_days: task.active_days,
        all_day: task.all_day
      })
    });
    await Promise.all([loadTasks(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);
    toast(i18n.t('notifications.taskRestored'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCreateTask'), { type: 'error' });
  }
}

// ─────────────────────────────────────────────────────────── Task sheet ─────

let lastFocused = null;

function openSheet(sheet) {
  lastFocused = document.activeElement;
  sheet.hidden = false;
  el.scrim.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add('is-open');
    el.scrim.classList.add('is-open');
  });
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const first = sheet.querySelector('input:not([type="hidden"]):not([type="color"]), button');
    first?.focus();
  }, 280);
}

function closeSheet(sheet) {
  sheet.classList.remove('is-open');
  el.scrim.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => {
    sheet.hidden = true;
    el.scrim.hidden = true;
    lastFocused?.focus?.();
  }, 260);
}

function openSheets() {
  return [el.taskSheet, el.calendarSheet].filter(s => s.classList.contains('is-open'));
}

/** Keep Tab inside an open dialog. */
function trapFocus(event) {
  const sheet = openSheets()[0];
  if (!sheet || event.key !== 'Tab') return;
  const focusables = [...sheet.querySelectorAll(
    'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'
  )].filter(node => node.offsetParent !== null);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setAllDay(on) {
  el.allDayCheck.checked = on;
  el.timeRow.hidden = on;
  el.startTime.required = !on;
  el.endTime.required = !on;
}

function setDays(daysStr) {
  const days = daysStr ? daysStr.split(',').map(d => d.trim()) : [];
  el.dayPicker.querySelectorAll('input[name="activeDays"]').forEach(cb => {
    cb.checked = days.includes(cb.value);
  });
}

function getDays() {
  return [...el.dayPicker.querySelectorAll('input[name="activeDays"]:checked')]
    .map(cb => parseInt(cb.value, 10))
    .sort((a, b) => a - b)
    .join(',');
}

function setLedOff(off) {
  state.ledOff = off;
  el.ledOffBtn.dataset.on = String(off);
  el.ledOffBtn.querySelector('.toggle-text').textContent = i18n.t(off ? 'task.ledOn' : 'task.ledOff');
  if (off) {
    el.ledColor.value = 'null';
  } else {
    const rgb = hexToRgb(el.ledColorPicker.value);
    if (rgb) el.ledColor.value = `${rgb.r},${rgb.g},${rgb.b}`;
  }
}

function syncColor() {
  const hex = el.ledColorPicker.value;
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  if (!state.ledOff) el.ledColor.value = `${rgb.r},${rgb.g},${rgb.b}`;
  el.colorValue.textContent = hex.toUpperCase();
  el.colorSwatch.style.setProperty('--glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`);
}

function buildPresets() {
  el.colorPresets.innerHTML = LED_PRESETS.map(hex =>
    `<button type="button" class="preset" style="background:${hex}; color:${hex}" data-hex="${hex}" aria-label="${hex}"></button>`
  ).join('');
}

function showHint(node, message) {
  if (!message) {
    node.hidden = true;
    return;
  }
  node.textContent = message;
  node.hidden = false;
  node.classList.remove('form-hint');
  void node.offsetWidth;
  node.classList.add('form-hint');
}

function newTask() {
  state.editingId = null;
  el.taskForm.reset();
  el.taskId.value = '';
  el.sheetTitle.textContent = i18n.t('task.new');
  el.ledColorPicker.value = LED_PRESETS[Math.floor(Math.random() * LED_PRESETS.length)];
  setLedOff(false);
  syncColor();
  setAllDay(false);
  setDays('0,1,2,3,4,5,6');
  showHint(el.formHint, null);

  // Pre-fill a sensible window: the next round hour on the *device's* clock,
  // one hour long. Using the device time matters when the browser sits in a
  // different timezone from the Pi.
  const deviceHour = state.status?.currentTime
    ? parseInt(state.status.currentTime.split(':')[0], 10)
    : new Date().getHours();
  const pad = (n) => String(n).padStart(2, '0');
  el.startTime.value = `${pad((deviceHour + 1) % 24)}:00`;
  el.endTime.value = `${pad((deviceHour + 2) % 24)}:00`;

  openSheet(el.taskSheet);
}

function editTask(id) {
  const task = state.tasks.find(t => t.id === Number(id));
  if (!task) return;

  state.editingId = task.id;
  el.taskId.value = task.id;
  el.sheetTitle.textContent = i18n.t('task.edit');
  el.taskName.value = task.name;
  setAllDay(Boolean(task.all_day));
  el.startTime.value = task.all_day ? '' : task.start_time;
  el.endTime.value = task.all_day ? '' : task.end_time;
  setDays(task.active_days || '0,1,2,3,4,5,6');
  showHint(el.formHint, null);

  const rgb = parseRgb(task.led_color);
  if (rgb) {
    el.ledColorPicker.value = rgbToHex(rgb.r, rgb.g, rgb.b);
    setLedOff(false);
    syncColor();
  } else {
    setLedOff(true);
    syncColor();
  }

  openSheet(el.taskSheet);
}

async function submitTask(event) {
  event.preventDefault();

  const name = el.taskName.value.trim();
  if (!name) {
    showHint(el.formHint, i18n.t('task.name'));
    el.taskName.focus();
    return;
  }

  const days = getDays();
  if (!days) {
    showHint(el.formHint, i18n.t('notifications.selectOneDay'));
    return;
  }

  const allDay = el.allDayCheck.checked;
  if (!allDay && el.startTime.value === el.endTime.value) {
    showHint(el.formHint, i18n.t('notifications.endBeforeStart'));
    return;
  }
  if (!allDay && (!el.startTime.value || !el.endTime.value)) {
    showHint(el.formHint, i18n.t('notifications.endBeforeStart'));
    return;
  }

  const payload = {
    name,
    start_time: allDay ? '00:00' : el.startTime.value,
    end_time: allDay ? '23:59' : el.endTime.value,
    led_color: state.ledOff ? 'null' : el.ledColor.value,
    active_days: days,
    all_day: allDay ? 1 : 0
  };

  const editing = state.editingId;
  try {
    await api(editing ? `/api/tasks/${editing}` : '/api/tasks', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await Promise.all([loadTasks(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);
    closeSheet(el.taskSheet);
    toast(i18n.t(editing ? 'notifications.taskUpdated' : 'notifications.taskCreated'));
  } catch (error) {
    showHint(el.formHint, error.message);
  }
}

// ─────────────────────────────────────────────────────── Calendar sheet ─────

function syncCalColor() {
  const hex = el.calColorPicker.value;
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  el.calColorValue.textContent = hex.toUpperCase();
  el.calColorSwatch.style.setProperty('--glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`);
}

function setCalLedOff(off) {
  state.calLedOff = off;
  el.calLedOffBtn.dataset.on = String(off);
  el.calLedOffBtn.querySelector('.toggle-text').textContent = i18n.t(off ? 'task.ledOn' : 'task.ledOff');
}

function newCalendar() {
  el.calendarForm.reset();
  el.calColorPicker.value = '#e0a34a';
  setCalLedOff(false);
  syncCalColor();
  showHint(el.calFormHint, null);
  openSheet(el.calendarSheet);
}

async function submitCalendar(event) {
  event.preventDefault();

  const url = el.calUrl.value.trim();
  if (!url) return;

  const rgb = hexToRgb(el.calColorPicker.value);
  const payload = {
    url,
    name: el.calName.value.trim() || undefined,
    led_color: state.calLedOff || !rgb ? 'null' : `${rgb.r},${rgb.g},${rgb.b}`
  };

  el.calSubmitBtn.disabled = true;
  el.calSubmitBtn.textContent = i18n.t('calendar.connecting');
  showHint(el.calFormHint, null);

  try {
    await api('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await Promise.all([loadCalendars(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);
    closeSheet(el.calendarSheet);
    toast(i18n.t('notifications.calendarAdded'));
  } catch (error) {
    showHint(el.calFormHint, error.message);
  } finally {
    el.calSubmitBtn.disabled = false;
    el.calSubmitBtn.textContent = i18n.t('calendar.connect');
  }
}

async function toggleCalendar(id) {
  const cal = state.calendars.find(c => c.id === Number(id));
  if (!cal) return;
  try {
    await api(`/api/calendars/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: cal.enabled ? 0 : 1 })
    });
    await Promise.all([loadCalendars(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);
    toast(i18n.t('notifications.calendarUpdated'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCalendar'), { type: 'error' });
  }
}

async function removeCalendar(id) {
  const cal = state.calendars.find(c => c.id === Number(id));
  if (!cal || !confirm(i18n.t('calendar.removeConfirm'))) return;
  try {
    await api(`/api/calendars/${id}`, { method: 'DELETE' });
    await Promise.all([loadCalendars(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);
    toast(i18n.t('notifications.calendarRemoved'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCalendar'), { type: 'error' });
  }
}

async function syncCalendars() {
  el.syncCalendarsBtn.disabled = true;
  el.syncCalendarsBtn.textContent = i18n.t('calendar.syncing');
  try {
    const { data } = await api('/api/calendars/sync', { method: 'POST' });
    await Promise.all([loadCalendars(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);

    const failed = (data || []).filter(r => !r.ok);
    if (failed.length > 0) {
      toast(`${i18n.t('calendar.error')}: ${failed[0].error}`, { type: 'error' });
    } else {
      toast(i18n.t('notifications.calendarSynced'));
    }
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCalendar'), { type: 'error' });
  } finally {
    el.syncCalendarsBtn.disabled = false;
    el.syncCalendarsBtn.textContent = i18n.t('calendar.syncNow');
  }
}

// ──────────────────────────────────────────────────────────── Settings ──────

async function saveConfig() {
  el.saveConfigBtn.disabled = true;
  try {
    const { data } = await api('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brightness: el.brightness.value,
        timezone: el.timezone.value,
        time_format: el.timeFormat.value,
        language: el.language.value,
        calendar_sync_minutes: el.syncInterval.value
      })
    });
    state.config = data;
    await loadStatus();
    renderAll();
    refreshEinkPreview(true);
    toast(i18n.t('notifications.configSaved'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorSaveConfig'), { type: 'error' });
  } finally {
    el.saveConfigBtn.disabled = false;
  }
}

async function refreshDevice() {
  el.refreshStatusBtn.classList.add('spin');
  el.refreshStatusBtn.disabled = true;
  try {
    await api('/api/refresh', { method: 'POST' });
    await loadStatus();
    renderAll();
    refreshEinkPreview(true);
    toast(i18n.t('notifications.displayUpdated'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorRefresh'), { type: 'error' });
  } finally {
    setTimeout(() => {
      el.refreshStatusBtn.classList.remove('spin');
      el.refreshStatusBtn.disabled = false;
    }, 500);
  }
}

// ──────────────────────────────────────────────── Segmented control ─────────

function positionSegmentThumb() {
  const active = el.scopeSwitch.querySelector('.segmented-btn.is-on');
  const thumb = el.scopeSwitch.querySelector('.segmented-thumb');
  if (!active || !thumb) return;
  thumb.style.setProperty('--x', `${active.offsetLeft}px`);
  thumb.style.setProperty('--w', `${active.offsetWidth}px`);
}

// ───────────────────────────────────────────────────────────── Events ───────

el.addTaskBtn.addEventListener('click', newTask);
el.fabBtn.addEventListener('click', newTask);
el.closeSheetBtn.addEventListener('click', () => closeSheet(el.taskSheet));
el.cancelSheetBtn.addEventListener('click', () => closeSheet(el.taskSheet));
el.taskForm.addEventListener('submit', submitTask);

el.addCalendarBtn.addEventListener('click', newCalendar);
el.closeCalSheetBtn.addEventListener('click', () => closeSheet(el.calendarSheet));
el.cancelCalSheetBtn.addEventListener('click', () => closeSheet(el.calendarSheet));
el.calendarForm.addEventListener('submit', submitCalendar);
el.syncCalendarsBtn.addEventListener('click', syncCalendars);

el.scrim.addEventListener('click', () => openSheets().forEach(closeSheet));

el.allDayCheck.addEventListener('change', () => setAllDay(el.allDayCheck.checked));
el.ledColorPicker.addEventListener('input', syncColor);
el.ledOffBtn.addEventListener('click', () => setLedOff(!state.ledOff));
el.calColorPicker.addEventListener('input', syncCalColor);
el.calLedOffBtn.addEventListener('click', () => setCalLedOff(!state.calLedOff));

el.colorPresets.addEventListener('click', (event) => {
  const hex = event.target.closest('.preset')?.dataset.hex;
  if (!hex) return;
  el.ledColorPicker.value = hex;
  if (state.ledOff) setLedOff(false);
  syncColor();
});

document.querySelectorAll('.day-presets .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.days;
    setDays(preset === 'weekdays' ? '1,2,3,4,5' : preset === 'weekend' ? '0,6' : '0,1,2,3,4,5,6');
  });
});

// Delegated task list actions
el.tasksList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'edit') editTask(id);
  else if (action === 'delete') deleteTask(id);
  else if (action === 'show-more') {
    state.showAllDone = !state.showAllDone;
    renderTasks();
  }
});

el.tasksList.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-action="toggle"]');
  if (input) toggleDone(input.dataset.id);
});

// Timeline blocks jump to the matching task
el.timelineTrack.addEventListener('click', (event) => {
  const block = event.target.closest('.timeline-block');
  if (!block) return;
  const key = block.dataset.key;
  if (key?.startsWith('task:')) editTask(key.slice(5));
});

// Calendar row actions
el.calendarList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cal-action]');
  if (!button) return;
  const { calAction, id } = button.dataset;
  if (calAction === 'toggle') toggleCalendar(id);
  else if (calAction === 'delete') removeCalendar(id);
});

// Scope switch
el.scopeSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('.segmented-btn');
  if (!button) return;
  el.scopeSwitch.querySelectorAll('.segmented-btn').forEach(b => b.classList.toggle('is-on', b === button));
  state.scope = button.dataset.scope;
  positionSegmentThumb();
  renderTasks();
});

// Search (debounced)
let searchTimer;
el.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = el.searchInput.value;
    renderTasks();
  }, 140);
});

el.brightness.addEventListener('input', (event) => {
  el.brightnessValue.textContent = `${event.target.value}%`;
  paintSlider(event.target);
});

el.timezone.addEventListener('change', () => updateDst(el.timezone.value));
el.timeFormat.addEventListener('change', () => {
  state.config.time_format = el.timeFormat.value;
  renderTimelineScale();
  renderAll();
});

el.language.addEventListener('change', async () => {
  await i18n.load(el.language.value);
  i18n.apply();
  fillTimezones(el.timezone.value || state.config.timezone);
  setLedOff(state.ledOff);
  setCalLedOff(state.calLedOff);
  renderAll();
});

el.saveConfigBtn.addEventListener('click', saveConfig);
el.refreshStatusBtn.addEventListener('click', refreshDevice);
el.devRefreshBtn.addEventListener('click', refreshDevice);

// A broken preview image should not leave an empty frame
el.einkPreview.addEventListener('error', () => { el.einkPreview.style.visibility = 'hidden'; });
el.einkPreview.addEventListener('load', () => { el.einkPreview.style.visibility = 'visible'; });

window.addEventListener('resize', positionSegmentThumb);

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  trapFocus(event);

  if (event.key === 'Escape') {
    const open = openSheets();
    if (open.length) {
      open.forEach(closeSheet);
      return;
    }
  }

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (openSheets().length) return;

  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    newTask();
  } else if (event.key === '/') {
    event.preventDefault();
    el.searchInput.focus();
  } else if (event.key === 'r' || event.key === 'R') {
    event.preventDefault();
    refreshDevice();
  }
});

// ─────────────────────────────────────────────────────────────── Boot ───────

async function poll() {
  try {
    await loadStatus();
    renderNow();
    renderTimeline();
    renderTasks();
  } catch {
    /* setOnline already flagged it; the next tick will retry */
  }
}

async function init() {
  buildPresets();
  syncColor();
  syncCalColor();

  try {
    await loadConfig();
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorLoadConfig'), { type: 'error' });
  }

  try {
    await Promise.all([loadTasks(), loadStatus(), loadCalendars()]);
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorLoadTasks'), { type: 'error' });
  }

  renderAll();
  refreshEinkPreview();

  // The device ticks once a minute; polling a little faster keeps the clock,
  // the progress bar and the playhead honest without hammering the Pi.
  setInterval(poll, 15000);
  setInterval(refreshEinkPreview, 60000);
  setInterval(updateDateLabel, 60000);
}

init();
