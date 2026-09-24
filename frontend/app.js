/**
 * Daily Tasks — control panel
 *
 * Vanilla JS against the REST API. The whole interface takes its accent colour
 * from whatever the device's LED is currently holding, so the browser and the
 * hardware always read as one system.
 *
 * Updates arrive over Server-Sent Events (`/api/events`); a slow poll stays on
 * as a safety net for proxies that drop the stream.
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
const DEFAULT_LED = { r: 90, g: 209, b: 196 };
const DEFAULT_LED_2 = { r: 224, g: 163, b: 74 };
const DONE_LIMIT = 5;
const DAY = 1440;
// Drag granularity on the timeline, in minutes
const SNAP = 5;
// With a live stream the poll is only a safety net
const POLL_MS = 30000;

// The surface every accent is read against (--bg-1) and the ink it lifts towards
const SURFACE = { r: 16, g: 18, b: 22 };
const BONE = { r: 236, g: 232, b: 221 };
const DARK_INK = { r: 10, g: 11, b: 13 };

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');

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
  online: true,
  saving: false,
  // Browser-to-server clock offset, so the local clock matches the device
  clockSkew: 0,
  lastClock: null,
  lastMinute: null,
  lastActiveKey: undefined,
  stream: null,
  streamOpen: false,
  // Markup of the last paint of each list. Refreshes almost always produce
  // identical HTML; rewriting innerHTML anyway would restart the entry
  // animations and make the page visibly flicker.
  painted: { tasks: null, timeline: null, calendars: null }
};

// ────────────────────────────────────────────────────────────── DOM refs ────
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

const el = {
  themeColor: $('themeColor'),
  offlineBar: $('offlineBar'),
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
  timelineTip: $('timelineTip'),

  tasksList: $('tasksList'),
  taskCount: $('taskCount'),
  searchInput: $('searchInput'),
  scopeSwitch: $('scopeSwitch'),

  einkBezel: $('einkBezel'),
  einkPreview: $('einkPreview'),
  einkStatus: $('einkStatus'),
  ledChip: $('ledChip'),
  ledChipText: $('ledChipText'),
  displayState: $('displayState'),

  calendarList: $('calendarList'),
  addCalendarBtn: $('addCalendarBtn'),
  syncCalendarsBtn: $('syncCalendarsBtn'),

  brightness: $('brightness'),
  brightnessValue: $('brightnessValue'),
  timezone: $('timezone'),
  timeFormat: $('timeFormat'),
  language: $('language'),
  syncInterval: $('syncInterval'),
  saveState: $('saveState'),
  dstIndicator: $('dstIndicator'),
  shortcutsBtn: $('shortcutsBtn'),

  scrim: $('scrim'),
  taskSheet: $('taskSheet'),
  taskForm: $('taskForm'),
  sheetTitle: $('sheetTitle'),
  closeSheetBtn: $('closeSheetBtn'),
  cancelSheetBtn: $('cancelSheetBtn'),
  duplicateTaskBtn: $('duplicateTaskBtn'),
  taskSubmitBtn: $('taskSubmitBtn'),
  taskId: $('taskId'),
  taskName: $('taskName'),
  startTime: $('startTime'),
  endTime: $('endTime'),
  timeRow: $('timeRow'),
  timeSummary: $('timeSummary'),
  timeSummaryText: $('timeSummaryText'),
  timeSummaryWarn: $('timeSummaryWarn'),
  allDayCheck: $('allDayCheck'),
  dayPicker: $('dayPicker'),
  colorRow: $('colorRow'),
  colorSwatch: $('colorSwatch'),
  ledColorPicker: $('ledColorPicker'),
  colorValue: $('colorValue'),
  colorPresets: $('colorPresets'),
  ledOnCheck: $('ledOnCheck'),
  ledColor: $('ledColor'),
  formHint: $('formHint'),

  calendarSheet: $('calendarSheet'),
  calendarForm: $('calendarForm'),
  closeCalSheetBtn: $('closeCalSheetBtn'),
  cancelCalSheetBtn: $('cancelCalSheetBtn'),
  calUrl: $('calUrl'),
  calName: $('calName'),
  calColorRow: $('calColorRow'),
  calColorSwatch: $('calColorSwatch'),
  calColorPicker: $('calColorPicker'),
  calColorValue: $('calColorValue'),
  calLedOnCheck: $('calLedOnCheck'),
  calSubmitBtn: $('calSubmitBtn'),
  calFormHint: $('calFormHint'),

  eventSheet: $('eventSheet'),
  closeEventSheetBtn: $('closeEventSheetBtn'),
  eventTitle: $('eventTitle'),
  eventWhen: $('eventWhen'),
  eventCalendar: $('eventCalendar'),
  eventCalendarName: $('eventCalendarName'),
  eventLocationRow: $('eventLocationRow'),
  eventLocation: $('eventLocation'),
  eventDescriptionRow: $('eventDescriptionRow'),
  eventDescription: $('eventDescription'),

  shortcutsSheet: $('shortcutsSheet'),
  closeShortcutsBtn: $('closeShortcutsBtn'),

  toasts: $('toasts')
};

const SHEETS = [el.taskSheet, el.calendarSheet, el.eventSheet, el.shortcutsSheet];

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

const triplet = (rgb) => `${rgb.r}, ${rgb.g}, ${rgb.b}`;

/** WCAG relative luminance, 0..1 */
function luminance({ r, g, b }) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

/**
 * Lift a colour until it is legible against the graphite substrate.
 *
 * The LED is driven at full brightness so a deep colour like "0,30,255" looks
 * right on the hardware, but the same value painted on a near-black panel is
 * unreadable. Measured by WCAG contrast rather than HSL lightness — a pure blue
 * has 50% lightness yet almost no luminance — and mixed towards the bone ink
 * until the target is met. Only the on-screen rendering is adjusted; the value
 * sent to the device is never touched.
 *
 * @param {{r:number,g:number,b:number}} rgb
 * @param {number} minContrast - against --bg-1
 * @returns {{r:number,g:number,b:number}}
 */
function liftForScreen(rgb, minContrast = 4.5) {
  if (contrast(rgb, SURFACE) >= minContrast) return rgb;
  for (let t = 0.05; t < 1; t += 0.05) {
    const lifted = mix(rgb, BONE, t);
    if (contrast(lifted, SURFACE) >= minContrast) return lifted;
  }
  return BONE;
}

/** Dark or light ink, whichever reads better on the given fill. */
function inkOn(rgb) {
  return contrast(rgb, DARK_INK) >= contrast(rgb, { r: 255, g: 255, b: 255 }) ? DARK_INK : { r: 255, g: 255, b: 255 };
}

/**
 * CSS-ready "r, g, b" for on-screen use, brightened when necessary.
 * @param {string} value - stored "r,g,b" or null
 * @param {string} fallback
 * @returns {string}
 */
function rgbTriplet(value, fallback = '236, 232, 221') {
  const rgb = parseRgb(value);
  return rgb ? triplet(liftForScreen(rgb)) : fallback;
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(minutes) {
  const wrapped = ((Math.round(minutes) % DAY) + DAY) % DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
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

/** Elapsed time since an ISO stamp: "12 s" / "3 min" / "1 h 5 min" */
function fmtSince(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 60) return i18n.t('units.seconds', { n: Math.max(0, Math.round(seconds)) });
  return fmtDuration(seconds / 60);
}

function fmtRelative(iso) {
  if (!iso) return i18n.t('calendar.neverSynced');
  const since = fmtSince(iso);
  return since ? i18n.t('calendar.lastSync', { time: since }) : i18n.t('calendar.neverSynced');
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

const clockFormatters = new Map();

/**
 * The device's wall clock, computed locally from the server's epoch so it can
 * tick every second without a round trip.
 * @returns {{minutes: number, hhmm: string}}
 */
function deviceClock() {
  const tz = deviceTimezone();
  let fmt = clockFormatters.get(tz);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    } catch {
      fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    }
    clockFormatters.set(tz, fmt);
  }
  const parts = fmt.formatToParts(new Date(Date.now() + state.clockSkew));
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return { minutes: h * 60 + m, hhmm: minutesToTime(h * 60 + m) };
}

/** Day-of-week (0=Sun) in the device's timezone. */
function todayDow() {
  try {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: deviceTimezone(),
      weekday: 'short'
    }).formatToParts(new Date(Date.now() + state.clockSkew));
    return names.indexOf(parts.find(p => p.type === 'weekday')?.value ?? '');
  } catch {
    return new Date().getDay();
  }
}

function nowMinutes() {
  return deviceClock().minutes;
}

const motionOk = () => !reducedMotion.matches;

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

const jsonBody = (method, payload) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  el.connPill.dataset.state = online ? 'ok' : 'down';
  el.offlineBar.hidden = online;
  if (online) {
    toast(i18n.t('app.reconnected'));
    // Anything may have changed while we were away
    refreshAll();
  }
}

async function loadConfig() {
  const { data } = await api('/api/config');
  const langChanged = data.language !== state.config.language;
  state.config = data;
  if (langChanged) {
    await i18n.load(data.language || 'es');
    i18n.apply();
  }
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
  if (data.epoch) state.clockSkew = data.epoch - Date.now();
}

async function loadCalendars() {
  const { data } = await api('/api/calendars');
  state.calendars = data;
}

/** Reload everything the panel shows and repaint. */
async function refreshAll() {
  try {
    await Promise.all([loadTasks(), loadStatus(), loadCalendars()]);
    renderAll();
    refreshEinkPreview();
  } catch {
    /* setOnline already flagged it; the next tick will retry */
  }
}

// ────────────────────────────────────────────────────── Colour plumbing ─────

/**
 * Push the active task's colour into the CSS custom properties that the whole
 * interface reads from. The channels are registered with @property, so the
 * whole panel glides from one colour to the next.
 * @param {string|null} ledColor - "r,g,b"
 */
function applyTint(ledColor) {
  const rgb = parseRgb(ledColor);
  // A task with the LED disabled still needs legible chrome, so the house
  // accent stays. The LED readout in the device panel is what reports "off".
  const ui = rgb ? liftForScreen(rgb, 5) : DEFAULT_LED;
  const partner = rgb
    // A complementary-ish partner for the second ambient glow
    ? { r: ui.b, g: Math.min(255, Math.round(ui.r * 0.6 + 60)), b: Math.min(255, Math.round(ui.g * 0.7 + 40)) }
    : DEFAULT_LED_2;
  const on = inkOn(ui);

  const set = (name, value) => root.style.setProperty(name, String(value));
  set('--led-r', ui.r); set('--led-g', ui.g); set('--led-b', ui.b);
  set('--led2-r', partner.r); set('--led2-g', partner.g); set('--led2-b', partner.b);
  set('--on-led', triplet(on));

  // Browser chrome picks up a whisper of the accent
  const chrome = mix({ r: 11, g: 12, b: 14 }, ui, 0.14);
  el.themeColor.setAttribute('content', rgbToHex(chrome.r, chrome.g, chrome.b));
}

// ───────────────────────────────────────────────────────── Now instrument ───

/**
 * Paint the clock character by character so only the digits that changed roll.
 * @param {string} text
 */
function renderClock(text) {
  if (text === state.lastClock) return;
  const previous = state.lastClock || '';
  state.lastClock = text;

  el.nowClock.innerHTML = [...text].map((ch, i) => {
    if (ch === ':') return '<span class="clock-colon">:</span>';
    const changed = previous && previous[i] !== ch;
    return `<span class="clock-ch${changed ? ' roll' : ''}">${escapeHtml(ch)}</span>`;
  }).join('');
}

/**
 * One-second heartbeat: the clock, the playhead and the "x ago" readouts run
 * locally so they never lag the device by a poll interval.
 */
function tick() {
  if (!state.status) return;
  const clock = deviceClock();
  renderClock(fmtTime(clock.hhmm));

  if (clock.minutes !== state.lastMinute) {
    const first = state.lastMinute === null;
    state.lastMinute = clock.minutes;
    if (!first) {
      positionNowMarker();
      // The device ticks on the minute; give it a moment and pick up the result
      if (!state.streamOpen) setTimeout(poll, 2500);
    }
  }
  renderDeviceTimes();
}

function renderNow() {
  const status = state.status;
  if (!status) return;

  renderClock(fmtTime(deviceClock().hhmm));
  el.connZone.textContent = (status.timezone || '').split('/').pop().replace(/_/g, ' ');

  const active = status.activeTask;
  const activeKey = active ? active.key : null;
  el.nowPanel.dataset.active = active ? 'true' : 'false';

  // A new slot took over: swap the title in and restart the progress sweep
  if (state.lastActiveKey !== undefined && state.lastActiveKey !== activeKey && motionOk()) {
    el.nowPanel.classList.remove('is-swapping');
    void el.nowPanel.offsetWidth;
    el.nowPanel.classList.add('is-swapping');
    el.nowProgressFill.style.transition = 'none';
    el.nowProgressFill.style.setProperty('--p', '0');
    void el.nowProgressFill.offsetWidth;
    el.nowProgressFill.style.transition = '';
  }
  state.lastActiveKey = activeKey;

  const tagText = el.nowStatusTag.querySelector('span:last-child');
  const next = status.nextTask;

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
    // Idle: count down to whatever starts next today
    el.nowRemaining.textContent = next && !next.isTomorrow
      ? i18n.t('app.startsIn', { time: fmtDuration(next.startMinutes - timeToMinutes(status.currentTime)) })
      : '';
    el.nowProgress.hidden = true;
  }

  el.nowNext.hidden = false;
  const label = el.nowNext.querySelector('.now-next-label');
  if (next) {
    label.textContent = next.isTomorrow ? i18n.t('app.nextTomorrow') : i18n.t('app.nextUp');
    el.nowNextText.textContent = `${fmtTime(next.start_time)} · ${next.name}`;
  } else {
    label.textContent = i18n.t('app.nextUp');
    el.nowNextText.textContent = i18n.t('app.nothingNext');
  }

  applyTint(active ? active.led_color : null);
  renderDevice();
}

// ─────────────────────────────────────────────────────────── Device panel ───

function renderDevice() {
  const status = state.status;
  if (!status) return;

  const led = status.device?.led;
  const rgb = led?.on ? parseRgb(led.color) : null;
  el.ledChip.dataset.on = String(Boolean(rgb));
  if (rgb) el.ledChip.style.setProperty('--dev', triplet(liftForScreen(rgb)));

  if (status.ledAvailable === false) {
    el.ledChipText.textContent = i18n.t('device.ledUnavailable');
  } else if (rgb) {
    el.ledChipText.textContent = `${rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase()} · ${i18n.t('device.brightness', { n: led.brightness })}`;
  } else {
    el.ledChipText.textContent = i18n.t('device.ledOff');
  }

  const active = status.activeTask;
  el.einkPreview.alt = i18n.t('device.previewAlt', {
    text: active
      ? `${active.name}${active.all_day ? '' : ` · ${fmtTime(active.start_time)}–${fmtTime(active.end_time)}`}`
      : i18n.t('app.freeNow')
  });

  renderDeviceTimes();
}

/** The "updated x ago" readout, refreshed by the one-second heartbeat. */
function renderDeviceTimes() {
  const status = state.status;
  if (!status) return;
  const pushedAt = status.device?.display?.lastPushAt;
  const since = pushedAt ? fmtSince(pushedAt) : null;

  let text = !pushedAt
    ? i18n.t('device.neverUpdated')
    : (Date.now() - new Date(pushedAt).getTime() < 5000
      ? i18n.t('device.updatedJustNow')
      : i18n.t('device.updatedAgo', { time: since }));
  if (!status.schedulerRunning) text = `${i18n.t('device.schedulerStopped')} · ${text}`;

  if (el.displayState.textContent !== text) el.displayState.textContent = text;
  el.displayState.classList.toggle('is-warn', !status.schedulerRunning);
}

// ──────────────────────────────────────────────────────────── Timeline ──────

/**
 * The slice of the day the timeline shows. Phones get a 12-hour window around
 * now — a whole day in 350px leaves ten-minute blocks three pixels wide.
 * @returns {{from: number, to: number}}
 */
function timelineWindow() {
  if (window.innerWidth >= 620) return { from: 0, to: DAY };
  const span = 12 * 60;
  const centre = state.status ? nowMinutes() : 12 * 60;
  const from = Math.min(DAY - span, Math.max(0, Math.round((centre - span / 2) / 60) * 60));
  return { from, to: from + span };
}

const pct = (minutes, win) => ((minutes - win.from) / (win.to - win.from)) * 100;

function hourLabel(h) {
  if (state.config.time_format !== '12') return String(h).padStart(2, '0');
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  return h > 12 ? `${h - 12}p` : `${h}a`;
}

function renderTimelineScale() {
  const win = timelineWindow();
  const step = win.to - win.from === DAY ? 3 : 2;
  const hours = [];
  for (let h = Math.ceil(win.from / 60); h <= win.to / 60; h += step) hours.push(h);

  el.timelineScale.innerHTML = hours.map((h, idx) =>
    `<span class="timeline-tick${idx % 2 === 1 ? ' minor' : ''}" style="--x:${pct(h * 60, win)}%">${hourLabel(h)}</span>`
  ).join('');
}

function positionNowMarker() {
  const win = timelineWindow();
  const x = pct(nowMinutes(), win);
  el.timelineNow.style.setProperty('--x', `${x}%`);
  // Keep the "Now" label inside the track at the edges of the day
  el.timelineNow.dataset.edge = x < 5 ? 'start' : x > 95 ? 'end' : '';
}

/**
 * A slot as the pieces it occupies on today's strip. A task that runs through
 * midnight owns both the early morning (carried over from yesterday) and the
 * late evening, exactly as agenda.js treats it.
 * @param {Object} slot
 * @returns {Array<{start: number, end: number, cont: string}>}
 */
function slotSegments(slot) {
  if (slot.crossesMidnight) {
    return [
      { start: 0, end: slot.endMinutes, cont: 'before' },
      { start: slot.startMinutes, end: DAY, cont: 'after' }
    ].filter(seg => seg.end > seg.start);
  }
  return [{ start: slot.startMinutes, end: slot.endMinutes, cont: '' }];
}

/**
 * Lay the day's segments onto rows so overlapping blocks never sit on top of
 * each other (a simple greedy interval-packing).
 * @param {Array<Object>} segments
 * @returns {Array<Array<Object>>} rows
 */
function packRows(segments) {
  const rows = [];
  for (const seg of segments) {
    const row = rows.find(r => r.every(s => seg.start >= s.end || seg.end <= s.start));
    if (row) row.push(seg);
    else rows.push([seg]);
  }
  return rows;
}

function segmentTip(slot, seg) {
  const range = slot.all_day
    ? i18n.t('task.allDay')
    : `${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)}`;
  const note = seg.cont === 'before' ? ` · ${i18n.t('timeline.fromYesterday')}`
    : seg.cont === 'after' ? ` · ${i18n.t('timeline.untilTomorrow')}` : '';
  return `${slot.name} · ${range}${note}`;
}

function renderTimeline() {
  const slots = state.agendaSlots.filter(s => !s.done);
  const win = timelineWindow();
  const now = nowMinutes();

  positionNowMarker();
  el.timelineNote.textContent = slots.length
    ? `${slots.length} · ${i18n.t('tasks.filterToday')}`
    : '';

  if (slots.length === 0) {
    paint(el.timelineTrack, `<div class="timeline-empty">${escapeHtml(i18n.t('timeline.empty'))}</div>`, 'timeline');
    return;
  }

  const segments = slots
    .flatMap(slot => slotSegments(slot).map(seg => ({ ...seg, slot })))
    .map(seg => ({ ...seg, start: Math.max(seg.start, win.from), end: Math.min(seg.end, win.to) }))
    .filter(seg => seg.end > seg.start)
    .sort((a, b) => a.start - b.start);

  const rows = packRows(segments);
  let index = 0;
  const activeKey = state.status?.activeTask?.key;

  const html = rows.map(row => {
    const blocks = row.map(seg => {
      const { slot } = seg;
      const left = pct(seg.start, win);
      const width = Math.max(0.6, pct(seg.end, win) - left);
      const isNow = activeKey === slot.key && now >= seg.start && now < seg.end;
      const draggable = slot.source === 'task' && !slot.all_day && !slot.crossesMidnight;
      const classes = [
        'timeline-block',
        width > 11 ? 'wide' : '',
        isNow ? 'is-now' : '',
        slot.source === 'calendar' ? 'is-calendar' : '',
        seg.cont ? `is-cont-${seg.cont}` : ''
      ].filter(Boolean).join(' ');
      const tip = segmentTip(slot, seg);

      return `<button type="button" class="${classes}"
        style="--a:${left}%; --w:${width}%; --c:${rgbTriplet(slot.led_color)}; --i:${index++}"
        data-key="${escapeHtml(slot.key)}" data-tip="${escapeHtml(tip)}"
        ${draggable ? `data-draggable="true" data-start="${slot.startMinutes}" data-end="${slot.endMinutes}"` : ''}
        aria-label="${escapeHtml(tip)}">
        <span class="timeline-block-label">${escapeHtml(slot.name)}</span>
      </button>`;
    }).join('');
    return `<div class="timeline-row">${blocks}</div>`;
  }).join('');

  paint(el.timelineTrack, html, 'timeline');
}

// Floating tooltip shared by every block

function showTip(block, text) {
  const host = el.timeline.getBoundingClientRect();
  const rect = block.getBoundingClientRect();
  el.timelineTip.textContent = text ?? block.dataset.tip;
  el.timelineTip.hidden = false;

  const tipWidth = el.timelineTip.offsetWidth;
  const centre = rect.left + rect.width / 2 - host.left;
  const x = Math.min(host.width - tipWidth / 2, Math.max(tipWidth / 2, centre));
  el.timelineTip.style.setProperty('--tx', `${x}px`);
  el.timelineTip.style.setProperty('--ty', `${rect.top - host.top}px`);
}

function hideTip() {
  el.timelineTip.hidden = true;
}

// ─────────────────────────────────────────────── Timeline drag & resize ─────

let drag = null;
let suppressClick = false;

function dragRange(d) {
  return `${fmtTime(minutesToTime(d.start))}–${fmtTime(minutesToTime(d.end === DAY ? DAY - 1 : d.end))}`;
}

function onTimelinePointerDown(event) {
  const block = event.target.closest('.timeline-block[data-draggable]');
  // Touch keeps its scroll gesture; blocks are tapped to edit instead
  if (!block || event.pointerType === 'touch' || event.button !== 0) return;

  const rect = block.getBoundingClientRect();
  const handle = Math.min(8, rect.width / 3);
  const edge = event.clientX - rect.left < handle ? 'start'
    : rect.right - event.clientX < handle ? 'end' : 'move';
  const win = timelineWindow();

  drag = {
    block,
    edge,
    id: block.dataset.key.slice(5),
    x0: event.clientX,
    start0: Number(block.dataset.start),
    end0: Number(block.dataset.end),
    start: Number(block.dataset.start),
    end: Number(block.dataset.end),
    moved: false,
    win,
    pxPerMin: el.timelineTrack.getBoundingClientRect().width / (win.to - win.from)
  };
  block.setPointerCapture(event.pointerId);
}

function onTimelinePointerMove(event) {
  // Hover affordance: the edges resize, the body moves
  const hover = event.target.closest('.timeline-block[data-draggable]');
  if (!drag && hover && event.pointerType !== 'touch') {
    const rect = hover.getBoundingClientRect();
    const handle = Math.min(8, rect.width / 3);
    const nearEdge = event.clientX - rect.left < handle || rect.right - event.clientX < handle;
    hover.style.cursor = nearEdge ? 'ew-resize' : 'grab';
  }
  if (!drag) return;

  const dx = event.clientX - drag.x0;
  if (!drag.moved && Math.abs(dx) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.block.classList.add('is-dragging');
    root.classList.add('is-dragging-block');
  }

  const delta = Math.round(dx / drag.pxPerMin / SNAP) * SNAP;
  const length = drag.end0 - drag.start0;
  if (drag.edge === 'move') {
    drag.start = Math.min(DAY - length, Math.max(0, drag.start0 + delta));
    drag.end = drag.start + length;
  } else if (drag.edge === 'start') {
    drag.start = Math.min(drag.end0 - SNAP, Math.max(0, drag.start0 + delta));
  } else {
    drag.end = Math.min(DAY, Math.max(drag.start0 + SNAP, drag.end0 + delta));
  }

  const left = pct(Math.max(drag.start, drag.win.from), drag.win);
  const right = pct(Math.min(drag.end, drag.win.to), drag.win);
  drag.block.style.setProperty('--a', `${left}%`);
  drag.block.style.setProperty('--w', `${Math.max(0.6, right - left)}%`);
  showTip(drag.block, `${drag.block.querySelector('.timeline-block-label').textContent} · ${dragRange(drag)}`);
}

async function onTimelinePointerUp() {
  if (!drag) return;
  const d = drag;
  drag = null;
  root.classList.remove('is-dragging-block');
  if (!d.moved) return;

  suppressClick = true;
  hideTip();
  if (d.start === d.start0 && d.end === d.end0) {
    d.block.classList.remove('is-dragging');
    return;
  }

  const task = state.tasks.find(t => t.id === Number(d.id));
  if (!task) return;
  const before = { start_time: task.start_time, end_time: task.end_time };
  const after = {
    start_time: minutesToTime(d.start),
    end_time: d.end === DAY ? '23:59' : minutesToTime(d.end)
  };

  const saved = await updateTaskTimes(task, after);
  d.block.classList.remove('is-dragging');
  if (!saved) {
    // Put the block back where the server still has it
    state.painted.timeline = null;
    renderTimeline();
    return;
  }

  toast(i18n.t('notifications.taskMoved', { range: dragRange(d) }), {
    action: {
      label: i18n.t('notifications.undo'),
      onClick: () => updateTaskTimes(saved, before)
    }
  });
}

/**
 * PUT a task back with new times, keeping everything else as it was.
 * @returns {Promise<Object|null>} the saved task, or null on failure
 */
async function updateTaskTimes(task, times) {
  try {
    const { data } = await api(`/api/tasks/${task.id}`, jsonBody('PUT', {
      name: task.name,
      start_time: times.start_time,
      end_time: times.end_time,
      led_color: task.led_color,
      active_days: task.active_days,
      all_day: task.all_day
    }));
    await Promise.all([loadTasks(), loadStatus()]);
    await withTransition(renderAll);
    refreshEinkPreview(true);
    return data;
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorUpdateTask'), { type: 'error' });
    return null;
  }
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

/**
 * Has today's run of this task finished?
 *
 * A task that runs through midnight is never "over" during the day: its early
 * hours belong to last night's run and its evening is still to come.
 */
function isPastToday(task) {
  if (task.all_day || !state.status || !isScheduledToday(task)) return false;
  const start = timeToMinutes(task.start_time);
  const end = timeToMinutes(task.end_time);
  if (end < start) return false;
  return nowMinutes() >= end;
}

/**
 * The minute ranges a window covers on its own day.
 * @returns {Array<[number, number]>}
 */
function windowIntervals(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end === start) return [];
  return end > start ? [[start, end]] : [[start, DAY], [0, end]];
}

/**
 * Tasks whose window collides with the given one on a shared day.
 * @param {{id?: number, start_time: string, end_time: string, active_days: string}} task
 * @returns {Array<Object>}
 */
function overlappingTasks(task) {
  const days = new Set((task.active_days || '0,1,2,3,4,5,6').split(',').map(d => d.trim()));
  const mine = windowIntervals(task.start_time, task.end_time);
  if (mine.length === 0) return [];

  return state.tasks.filter(other => {
    if (other.id === task.id || other.done || other.all_day) return false;
    const otherDays = (other.active_days || '0,1,2,3,4,5,6').split(',').map(d => d.trim());
    if (!otherDays.some(d => days.has(d))) return false;
    const theirs = windowIntervals(other.start_time, other.end_time);
    return mine.some(([a1, a2]) => theirs.some(([b1, b2]) => a1 < b2 && b1 < a2));
  });
}

function hasOverlap(task) {
  if (task.all_day || task.done) return false;
  return overlappingTasks(task).length > 0;
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
    overlap ? `<span class="badge badge-warn" title="${escapeHtml(i18n.t('task.overlaps'))}" aria-label="${escapeHtml(i18n.t('task.overlaps'))}">${ICONS.warn}</span>` : ''
  ].join('');

  const when = task.all_day
    ? i18n.t('task.allDay')
    : `${fmtTime(task.start_time)} → ${fmtTime(task.end_time)}`;

  return `
    <article class="task${done ? ' is-done' : ''}${past ? ' is-past' : ''}"
             data-id="${task.id}" data-now="${isNow}"
             style="--c:${tint}; --lit:${lit}; --i:${index}; view-transition-name: task-${task.id}">
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
 * The whole row opens the event's details.
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
    <article class="task is-calendar" data-now="${isNow}" data-key="${escapeHtml(slot.key)}"
             role="button" tabindex="0" aria-label="${escapeHtml(`${i18n.t('event.open')}: ${slot.name}`)}"
             style="--c:${tint}; --lit:0.45; --i:${index}; view-transition-name: ev-${slot.id}">
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
          <span class="task-days">${escapeHtml(slot.location || i18n.t('calendar.readOnly'))}</span>
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
      ? `<span class="err">${escapeHtml(i18n.t('calendar.error'))}</span>`
      : escapeHtml(i18n.t('calendar.events', { n: cal.event_count })),
    cal.enabled ? escapeHtml(fmtRelative(cal.last_sync)) : escapeHtml(i18n.t('calendar.paused'))
  ].join(' <span class="sep" aria-hidden="true">·</span> ');

  return `
    <div class="cal${cal.enabled ? '' : ' is-off'}" style="--c:${tint}; view-transition-name: cal-${cal.id}" data-id="${cal.id}">
      <span class="cal-dot" aria-hidden="true"></span>
      <div class="cal-body">
        <span class="cal-name">${escapeHtml(cal.name)}</span>
        <span class="cal-meta mono">${meta}</span>
        ${cal.last_error ? `<span class="cal-error">${escapeHtml(cal.last_error)}</span>` : ''}
      </div>
      <div class="cal-actions">
        <button class="task-action" type="button" data-cal-action="toggle" data-id="${cal.id}"
                aria-pressed="${cal.enabled ? 'true' : 'false'}"
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
 * CSS entry animations run on the first paint instead of on every refresh.
 *
 * Rewriting innerHTML destroys the focused element, so whatever control had
 * focus inside the container is found again in the new markup and refocused —
 * otherwise ticking a checkbox with the keyboard throws focus to <body>.
 * @param {HTMLElement} container
 * @param {string} html
 * @param {string} key - slot in `state.painted`
 */
function paint(container, html, key) {
  if (state.painted[key] === html) return;

  const focused = document.activeElement;
  let selector = null;
  if (focused && focused !== container && container.contains(focused)) {
    const { id, key: slotKey, action, calAction } = focused.dataset;
    if (action && id) selector = `[data-action="${action}"][data-id="${id}"]`;
    else if (calAction && id) selector = `[data-cal-action="${calAction}"][data-id="${id}"]`;
    else if (slotKey) selector = `[data-key="${CSS.escape(slotKey)}"]`;
    else if (action) selector = `[data-action="${action}"]`;
  }

  const first = state.painted[key] === null;
  state.painted[key] = html;
  container.innerHTML = html;
  container.classList.toggle('is-first-paint', first);

  if (selector) container.querySelector(selector)?.focus({ preventScroll: true });
}

/**
 * Run a DOM update inside a View Transition when the browser supports it, so
 * cards glide to their new place (e.g. into "Completed") instead of jumping.
 * @param {Function} update
 * @returns {Promise<void>}
 */
function withTransition(update) {
  if (!document.startViewTransition || !motionOk() || document.hidden) {
    update();
    return Promise.resolve();
  }
  const transition = document.startViewTransition(update);
  // A transition is skipped when another one starts; that is not an error
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
  // Resolve once the DOM is updated — callers must not wait for the animation
  return transition.updateCallbackDone.catch(() => {});
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
  const p = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.backgroundSize = `${p}% 100%`;
}

function updateDateLabel() {
  const locale = i18n.currentLang() === 'en' ? 'en-US' : 'es-ES';
  // The device's timezone, not the browser's — otherwise the header can claim a
  // different day from the tasks, the timeline and the e-ink panel.
  const opts = { weekday: 'long', day: 'numeric', month: 'long', timeZone: deviceTimezone() };

  let text;
  try {
    text = new Intl.DateTimeFormat(locale, opts).format(new Date(Date.now() + state.clockSkew));
  } catch {
    text = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  el.dateLabel.textContent = i18n.t('app.today', { date: text.charAt(0).toUpperCase() + text.slice(1) });
}

// ─────────────────────────────────────────────────────── E-ink mirror ───────

let previewSignature = null;
let previewUrl = null;
let previewLoading = false;
let previewQueued = false;
let updatingTimer = null;

/** Cheap FNV-1a over the PNG bytes — frames are a few KB. */
function signature(buffer) {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return `${bytes.length}:${hash >>> 0}`;
}

/** Flag the mirror as "updating" until the next frame lands. */
function markUpdating() {
  el.einkStatus.textContent = i18n.t('device.updating');
  el.einkStatus.classList.add('is-on');
  clearTimeout(updatingTimer);
  updatingTimer = setTimeout(clearUpdating, 8000);
}

function clearUpdating() {
  clearTimeout(updatingTimer);
  el.einkStatus.classList.remove('is-on');
  el.einkStatus.textContent = '';
}

/**
 * Re-fetch the e-ink mirror.
 *
 * The frame is downloaded and compared byte-for-byte with the one on screen;
 * only a real change is swapped in, with the black/white flash of a physical
 * e-ink refresh. After a mutation the device renders asynchronously — the
 * `frame` event on the live stream announces the new artwork; without a stream
 * the preview is re-fetched a couple of times instead.
 * @param {boolean} [afterChange=false]
 */
function refreshEinkPreview(afterChange = false) {
  if (afterChange) {
    markUpdating();
    if (!state.streamOpen) {
      setTimeout(loadPreview, 1200);
      setTimeout(() => loadPreview({ settle: true }), 3500);
    }
  }
  loadPreview();
}

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.settle=false] - the device has finished rendering, so
 *        drop the "updating" flag even if the frame turned out identical
 */
async function loadPreview(opts = {}) {
  const { settle = false } = opts;
  if (previewLoading) {
    // A newer frame was announced mid-download: fetch again right after
    previewQueued = true;
    return;
  }
  previewLoading = true;
  try {
    const res = await fetch(`${API}/api/display/preview.png?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const sig = signature(buffer);
    if (sig === previewSignature) return;

    const first = previewSignature === null;
    previewSignature = sig;
    const url = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));

    // Decode off-screen first so the swap never shows a blank frame
    const probe = new Image();
    probe.src = url;
    await probe.decode();

    const swap = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = url;
      el.einkPreview.src = url;
      el.einkPreview.style.visibility = 'visible';
    };

    if (first || !motionOk()) {
      swap();
    } else {
      el.einkBezel.classList.remove('is-flashing');
      void el.einkBezel.offsetWidth;
      el.einkBezel.classList.add('is-flashing');
      // Swap at the peak of the flash, when the panel is fully inverted
      setTimeout(swap, 180);
    }
    clearUpdating();
  } catch {
    if (previewSignature === null) el.einkPreview.style.visibility = 'hidden';
  } finally {
    previewLoading = false;
    if (settle) clearUpdating();
    if (previewQueued) {
      previewQueued = false;
      loadPreview(opts);
    }
  }
}

// ────────────────────────────────────────────────────────── Full render ─────

function renderAll() {
  renderNow();
  renderTimelineScale();
  renderTimeline();
  renderTasks();
  renderCalendars();
  updateDateLabel();
  positionSegmentThumb();
}

// ─────────────────────────────────────────────────────── Task mutations ─────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function toggleDone(id, input) {
  const card = input?.closest('.task');
  const completing = input?.checked;
  // Let the tick draw and the strike-through sweep before the card moves
  if (card && completing && motionOk()) card.classList.add('is-completing');

  try {
    const [{ data }] = await Promise.all([
      api(`/api/tasks/${id}/done`, { method: 'PATCH' }),
      completing && motionOk() ? sleep(420) : null
    ]);
    const index = state.tasks.findIndex(t => t.id === Number(id));
    if (index !== -1) state.tasks[index] = data;
    await loadStatus();
    await withTransition(renderAll);
    refreshEinkPreview(true);
  } catch (error) {
    card?.classList.remove('is-completing');
    if (input) input.checked = !input.checked;
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
  const animated = Boolean(document.startViewTransition) && motionOk();
  // Without View Transitions the card fades out on its own
  if (card && !animated) card.classList.add('removing');

  try {
    const { data: removed } = await api(`/api/tasks/${id}`, { method: 'DELETE' });
    await Promise.all([loadTasks(), loadStatus()]);
    await withTransition(renderAll);
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

function taskPayload(task, overrides = {}) {
  return {
    name: task.name,
    start_time: task.start_time,
    end_time: task.end_time,
    led_color: task.led_color,
    active_days: task.active_days,
    all_day: task.all_day,
    ...overrides
  };
}

async function restoreTask(task) {
  if (!task) return;
  try {
    await api('/api/tasks', jsonBody('POST', taskPayload(task)));
    await Promise.all([loadTasks(), loadStatus()]);
    await withTransition(renderAll);
    refreshEinkPreview(true);
    toast(i18n.t('notifications.taskRestored'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCreateTask'), { type: 'error' });
  }
}

async function duplicateTask(id) {
  const task = state.tasks.find(t => t.id === Number(id));
  if (!task) return;
  try {
    const name = i18n.t('task.copySuffix', { name: task.name }).slice(0, 80);
    const { data } = await api('/api/tasks', jsonBody('POST', taskPayload(task, { name })));
    await Promise.all([loadTasks(), loadStatus()]);
    closeSheet(el.taskSheet);
    await withTransition(renderAll);
    refreshEinkPreview(true);
    toast(i18n.t('notifications.taskDuplicated'), {
      action: { label: i18n.t('task.editAction'), onClick: () => editTask(data.id) }
    });
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCreateTask'), { type: 'error' });
  }
}

// ─────────────────────────────────────────────────────────────── Sheets ─────

let lastFocused = null;

function openSheet(sheet) {
  // One dialog at a time
  openSheets().filter(s => s !== sheet).forEach(s => closeSheet(s, { restoreFocus: false }));
  if (!openSheets().length) lastFocused = document.activeElement;
  clearTimeout(sheet._closeTimer);
  // Tracked synchronously: the .is-open class only lands on the next frame
  sheet.dataset.open = 'true';
  sheet.hidden = false;
  el.scrim.hidden = false;
  sheet.style.translate = '';
  requestAnimationFrame(() => {
    sheet.classList.add('is-open');
    el.scrim.classList.add('is-open');
  });
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    // Straight into the first field with a keyboard; on touch the sheet itself
    // takes focus so the on-screen keyboard does not jump up uninvited
    const field = sheet.querySelector('input:not([type="hidden"]):not([type="color"]):not([type="checkbox"])');
    if (field && !coarsePointer.matches) {
      field.focus();
    } else {
      sheet.setAttribute('tabindex', '-1');
      sheet.focus({ preventScroll: true });
    }
  }, 280);
}

function closeSheet(sheet, opts = {}) {
  const { restoreFocus = true } = opts;
  if (sheet.dataset.open !== 'true') return;
  delete sheet.dataset.open;
  sheet.classList.remove('is-open');
  sheet.style.translate = '';
  const others = openSheets().length > 0;
  if (!others) {
    el.scrim.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  sheet._closeTimer = setTimeout(() => {
    sheet.hidden = true;
    if (!openSheets().length) {
      el.scrim.hidden = true;
      if (restoreFocus) lastFocused?.focus?.();
    }
  }, 260);
}

function openSheets() {
  return SHEETS.filter(s => s.dataset.open === 'true');
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

/**
 * Bottom sheets on phones can be dragged down by their grip or header to close.
 * @param {HTMLElement} sheet
 */
function enableSwipeToClose(sheet) {
  const handles = [sheet.querySelector('.sheet-grip'), sheet.querySelector('.sheet-head')].filter(Boolean);
  let start = null;

  const onDown = (event) => {
    if (window.innerWidth >= 720 || event.target.closest('button')) return;
    start = { y: event.clientY, t: performance.now(), dy: 0 };
    sheet.classList.add('is-dragging');
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event) => {
    if (!start) return;
    start.dy = Math.max(0, event.clientY - start.y);
    sheet.style.translate = `0 ${start.dy}px`;
  };
  const onUp = () => {
    if (!start) return;
    const { dy, t } = start;
    start = null;
    sheet.classList.remove('is-dragging');
    const velocity = dy / Math.max(1, performance.now() - t);
    if (dy > 110 || velocity > 0.6) closeSheet(sheet);
    else sheet.style.translate = '';
  };

  handles.forEach(handle => {
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

// ─────────────────────────────────────────────────────────── Task sheet ─────

function setAllDay(on) {
  el.allDayCheck.checked = on;
  el.timeRow.hidden = on;
  el.startTime.required = !on;
  el.endTime.required = !on;
  updateTimeSummary();
}

function setDays(daysStr) {
  const days = daysStr ? daysStr.split(',').map(d => d.trim()) : [];
  el.dayPicker.querySelectorAll('input[name="activeDays"]').forEach(cb => {
    cb.checked = days.includes(cb.value);
  });
  updateTimeSummary();
}

function getDays() {
  return [...el.dayPicker.querySelectorAll('input[name="activeDays"]:checked')]
    .map(cb => parseInt(cb.value, 10))
    .sort((a, b) => a - b)
    .join(',');
}

/** Live "lasts 1 h · crosses midnight" line plus any clash with other tasks. */
function updateTimeSummary() {
  const start = el.startTime.value;
  const end = el.endTime.value;
  if (el.allDayCheck.checked || !start || !end || start === end) {
    el.timeSummary.hidden = true;
    return;
  }

  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const crosses = e < s;
  const parts = [i18n.t('task.duration', { time: fmtDuration(crosses ? e + DAY - s : e - s) })];
  if (crosses) parts.push(i18n.t('task.crossesMidnight'));
  el.timeSummaryText.textContent = parts.join(' · ');

  const clashes = overlappingTasks({
    id: state.editingId,
    start_time: start,
    end_time: end,
    active_days: getDays()
  });
  el.timeSummaryWarn.hidden = clashes.length === 0;
  el.timeSummaryWarn.textContent = clashes.length
    ? i18n.t('task.overlapsWith', { names: clashes.map(t => t.name).join(', ') })
    : '';
  el.timeSummary.hidden = false;
}

function setLedOff(off) {
  state.ledOff = off;
  el.ledOnCheck.checked = !off;
  el.colorRow.classList.toggle('is-off', off);
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
  el.colorPresets.querySelectorAll('.preset').forEach(preset => {
    const on = preset.dataset.hex === hex.toLowerCase();
    preset.classList.toggle('is-on', on);
    preset.setAttribute('aria-pressed', String(on));
  });
}

function buildPresets() {
  el.colorPresets.innerHTML = LED_PRESETS.map(hex =>
    `<button type="button" class="preset" style="background:${hex}; color:${hex}" data-hex="${hex}" aria-label="${hex}" aria-pressed="false"></button>`
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

function setTaskSaving(saving) {
  state.saving = saving;
  el.taskSubmitBtn.disabled = saving;
  el.duplicateTaskBtn.disabled = saving;
  el.taskSubmitBtn.textContent = i18n.t(saving ? 'task.saving' : 'task.save');
}

function newTask() {
  state.editingId = null;
  el.taskForm.reset();
  el.taskId.value = '';
  el.sheetTitle.textContent = i18n.t('task.new');
  el.duplicateTaskBtn.hidden = true;
  el.ledColorPicker.value = LED_PRESETS[Math.floor(Math.random() * LED_PRESETS.length)];
  setLedOff(false);
  syncColor();
  showHint(el.formHint, null);
  setTaskSaving(false);

  // Pre-fill a sensible window: the next round hour on the *device's* clock,
  // one hour long. Using the device time matters when the browser sits in a
  // different timezone from the Pi.
  const deviceHour = Math.floor(nowMinutes() / 60);
  const pad = (n) => String(n).padStart(2, '0');
  el.startTime.value = `${pad((deviceHour + 1) % 24)}:00`;
  el.endTime.value = `${pad((deviceHour + 2) % 24)}:00`;
  setAllDay(false);
  setDays('0,1,2,3,4,5,6');

  openSheet(el.taskSheet);
}

function editTask(id) {
  const task = state.tasks.find(t => t.id === Number(id));
  if (!task) return;

  state.editingId = task.id;
  el.taskId.value = task.id;
  el.sheetTitle.textContent = i18n.t('task.edit');
  el.duplicateTaskBtn.hidden = false;
  el.taskName.value = task.name;
  el.startTime.value = task.all_day ? '' : task.start_time;
  el.endTime.value = task.all_day ? '' : task.end_time;
  setAllDay(Boolean(task.all_day));
  setDays(task.active_days || '0,1,2,3,4,5,6');
  showHint(el.formHint, null);
  setTaskSaving(false);

  const rgb = parseRgb(task.led_color);
  if (rgb) el.ledColorPicker.value = rgbToHex(rgb.r, rgb.g, rgb.b);
  setLedOff(!rgb);
  syncColor();

  openSheet(el.taskSheet);
}

async function submitTask(event) {
  event.preventDefault();
  if (state.saving) return;

  const name = el.taskName.value.trim();
  if (!name) {
    showHint(el.formHint, i18n.t('task.nameRequired'));
    el.taskName.focus();
    return;
  }

  const days = getDays();
  if (!days) {
    showHint(el.formHint, i18n.t('notifications.selectOneDay'));
    return;
  }

  const allDay = el.allDayCheck.checked;
  if (!allDay && (!el.startTime.value || !el.endTime.value)) {
    showHint(el.formHint, i18n.t('task.timesRequired'));
    (el.startTime.value ? el.endTime : el.startTime).focus();
    return;
  }
  if (!allDay && el.startTime.value === el.endTime.value) {
    showHint(el.formHint, i18n.t('notifications.endBeforeStart'));
    el.endTime.focus();
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
  setTaskSaving(true);
  try {
    await api(editing ? `/api/tasks/${editing}` : '/api/tasks', jsonBody(editing ? 'PUT' : 'POST', payload));
    await Promise.all([loadTasks(), loadStatus()]);
    closeSheet(el.taskSheet);
    await withTransition(renderAll);
    refreshEinkPreview(true);
    toast(i18n.t(editing ? 'notifications.taskUpdated' : 'notifications.taskCreated'));
  } catch (error) {
    showHint(el.formHint, error.message);
  } finally {
    setTaskSaving(false);
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
  el.calLedOnCheck.checked = !off;
  el.calColorRow.classList.toggle('is-off', off);
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
  if (el.calSubmitBtn.disabled) return;

  const url = el.calUrl.value.trim();
  if (!url) {
    showHint(el.calFormHint, i18n.t('calendar.urlLabel'));
    el.calUrl.focus();
    return;
  }

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
    await api('/api/calendars', jsonBody('POST', payload));
    await Promise.all([loadCalendars(), loadStatus()]);
    closeSheet(el.calendarSheet);
    await withTransition(renderAll);
    refreshEinkPreview(true);
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
    await api(`/api/calendars/${id}`, jsonBody('PUT', { enabled: cal.enabled ? 0 : 1 }));
    await Promise.all([loadCalendars(), loadStatus()]);
    renderAll();
    refreshEinkPreview(true);
    toast(i18n.t('notifications.calendarUpdated'));
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCalendar'), { type: 'error' });
  }
}

/**
 * Remove without a blocking confirm, like tasks: the toast offers an undo that
 * subscribes to the same feed again.
 * @param {number|string} id
 */
async function removeCalendar(id) {
  const cal = state.calendars.find(c => c.id === Number(id));
  if (!cal) return;
  try {
    await api(`/api/calendars/${id}`, { method: 'DELETE' });
    await Promise.all([loadCalendars(), loadStatus()]);
    await withTransition(renderAll);
    refreshEinkPreview(true);
    toast(i18n.t('notifications.calendarRemoved'), {
      action: { label: i18n.t('notifications.undo'), onClick: () => restoreCalendar(cal) }
    });
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorCalendar'), { type: 'error' });
  }
}

async function restoreCalendar(cal) {
  try {
    const { data } = await api('/api/calendars', jsonBody('POST', {
      url: cal.url,
      name: cal.name,
      led_color: cal.led_color || 'null'
    }));
    if (!cal.enabled) await api(`/api/calendars/${data.id}`, jsonBody('PUT', { enabled: 0 }));
    await Promise.all([loadCalendars(), loadStatus()]);
    await withTransition(renderAll);
    refreshEinkPreview(true);
    toast(i18n.t('notifications.calendarRestored'));
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

// ──────────────────────────────────────────────────────── Event details ─────

/**
 * iCal descriptions are plain text from most sources but HTML from Google;
 * either way only the text is shown.
 */
function plainText(value) {
  const withBreaks = String(value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function openEvent(key) {
  const slot = state.agendaSlots.find(s => s.key === key);
  if (!slot) return;

  el.eventTitle.textContent = slot.name;
  el.eventWhen.textContent = slot.all_day
    ? i18n.t('task.allDay')
    : `${fmtTime(slot.start_time)} → ${fmtTime(slot.end_time)}`;
  el.eventCalendarName.textContent = slot.calendar_name || i18n.t('calendar.title');
  el.eventCalendar.style.setProperty('--c', rgbTriplet(slot.led_color, '224, 163, 74'));

  el.eventLocationRow.hidden = !slot.location;
  el.eventLocation.textContent = slot.location || '';

  const description = plainText(slot.description);
  el.eventDescriptionRow.hidden = !description;
  el.eventDescription.textContent = description;

  openSheet(el.eventSheet);
}

// ──────────────────────────────────────────────────────────── Settings ──────

let saveStateTimer = null;

function setSaveState(kind) {
  clearTimeout(saveStateTimer);
  el.saveState.dataset.state = kind;
  el.saveState.textContent = kind === 'saving' ? i18n.t('settings.saving')
    : kind === 'saved' ? i18n.t('settings.saved')
      : i18n.t('settings.autosave');
  if (kind === 'saved') saveStateTimer = setTimeout(() => setSaveState('idle'), 2200);
}

/**
 * Settings save as soon as they change — there is no "save" button to forget.
 * @param {Object} patch - config keys to write
 */
async function saveConfig(patch) {
  setSaveState('saving');
  try {
    const { data } = await api('/api/config', jsonBody('PUT', patch));
    state.config = data;
    await loadStatus();
    renderAll();
    refreshEinkPreview(true);
    setSaveState('saved');
  } catch (error) {
    setSaveState('idle');
    toast(error.message || i18n.t('notifications.errorSaveConfig'), { type: 'error' });
    // Put the controls back to what the device actually has
    syncConfigUI();
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

// ───────────────────────────────────────────────────────── Live updates ─────

let refreshTimer = null;
const pendingTopics = new Set();

/**
 * Coalesce bursts of change notifications (a mutation emits tasks + status +
 * frame within milliseconds) into one fetch per resource.
 * @param {string} topic
 */
function queueRefresh(topic) {
  pendingTopics.add(topic);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const topics = new Set(pendingTopics);
    pendingTopics.clear();

    if (topics.has('frame')) loadPreview({ settle: true });

    const loads = [];
    if (topics.has('config')) loads.push(loadConfig());
    if (topics.has('tasks')) loads.push(loadTasks());
    if (topics.has('calendars')) loads.push(loadCalendars());
    if (topics.has('status') || topics.has('tasks') || topics.has('calendars') || topics.has('config')) {
      loads.push(loadStatus());
    }
    if (loads.length === 0) return;

    try {
      await Promise.all(loads);
      renderAll();
    } catch {
      /* flagged by api() */
    }
  }, 150);
}

function connectStream() {
  if (!window.EventSource || state.stream) return;
  const stream = new EventSource(`${API}/api/events`);
  state.stream = stream;

  stream.onopen = () => {
    state.streamOpen = true;
  };
  stream.onerror = () => {
    // EventSource reconnects on its own; the poll covers the gap
    state.streamOpen = false;
  };
  ['status', 'tasks', 'calendars', 'config', 'frame'].forEach(topic => {
    stream.addEventListener(topic, () => queueRefresh(topic));
  });
}

function disconnectStream() {
  state.stream?.close();
  state.stream = null;
  state.streamOpen = false;
}

// ───────────────────────────────────────────────────────────── Events ───────

el.addTaskBtn.addEventListener('click', newTask);
el.fabBtn.addEventListener('click', newTask);
el.closeSheetBtn.addEventListener('click', () => closeSheet(el.taskSheet));
el.cancelSheetBtn.addEventListener('click', () => closeSheet(el.taskSheet));
el.duplicateTaskBtn.addEventListener('click', () => duplicateTask(state.editingId));
el.taskForm.addEventListener('submit', submitTask);

el.addCalendarBtn.addEventListener('click', newCalendar);
el.closeCalSheetBtn.addEventListener('click', () => closeSheet(el.calendarSheet));
el.cancelCalSheetBtn.addEventListener('click', () => closeSheet(el.calendarSheet));
el.calendarForm.addEventListener('submit', submitCalendar);
el.syncCalendarsBtn.addEventListener('click', syncCalendars);

el.closeEventSheetBtn.addEventListener('click', () => closeSheet(el.eventSheet));
el.shortcutsBtn.addEventListener('click', () => openSheet(el.shortcutsSheet));
el.closeShortcutsBtn.addEventListener('click', () => closeSheet(el.shortcutsSheet));

el.scrim.addEventListener('click', () => openSheets().forEach(s => closeSheet(s)));
SHEETS.forEach(enableSwipeToClose);

el.allDayCheck.addEventListener('change', () => setAllDay(el.allDayCheck.checked));
el.startTime.addEventListener('input', updateTimeSummary);
el.endTime.addEventListener('input', updateTimeSummary);
el.dayPicker.addEventListener('change', updateTimeSummary);
el.ledColorPicker.addEventListener('input', () => {
  if (state.ledOff) setLedOff(false);
  syncColor();
});
el.ledOnCheck.addEventListener('change', () => setLedOff(!el.ledOnCheck.checked));
el.calColorPicker.addEventListener('input', () => {
  if (state.calLedOff) setCalLedOff(false);
  syncCalColor();
});
el.calLedOnCheck.addEventListener('change', () => setCalLedOff(!el.calLedOnCheck.checked));

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

// Delegated task list actions; a click anywhere else on a row opens it
el.tasksList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) {
    const { action, id } = button.dataset;
    if (action === 'edit') editTask(id);
    else if (action === 'delete') deleteTask(id);
    else if (action === 'show-more') {
      state.showAllDone = !state.showAllDone;
      withTransition(renderTasks);
    }
    return;
  }
  if (event.target.closest('.task-check')) return;

  const card = event.target.closest('.task');
  if (!card) return;
  if (card.dataset.key) openEvent(card.dataset.key);
  else if (card.dataset.id) editTask(card.dataset.id);
});

el.tasksList.addEventListener('keydown', (event) => {
  const card = event.target.closest('.task.is-calendar');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openEvent(card.dataset.key);
  }
});

el.tasksList.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-action="toggle"]');
  if (input) toggleDone(input.dataset.id, input);
});

// Timeline: click opens the task or event, drag reschedules
el.timelineTrack.addEventListener('click', (event) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const block = event.target.closest('.timeline-block');
  if (!block) return;
  const key = block.dataset.key;
  if (key?.startsWith('task:')) editTask(key.slice(5));
  else if (key?.startsWith('event:')) openEvent(key);
});
el.timelineTrack.addEventListener('pointerdown', onTimelinePointerDown);
el.timelineTrack.addEventListener('pointermove', onTimelinePointerMove);
el.timelineTrack.addEventListener('pointerup', onTimelinePointerUp);
el.timelineTrack.addEventListener('pointercancel', onTimelinePointerUp);
el.timelineTrack.addEventListener('pointerover', (event) => {
  const block = event.target.closest('.timeline-block');
  if (block && !drag) showTip(block, block.dataset.draggable
    ? `${block.dataset.tip} — ${i18n.t('timeline.dragHint')}`
    : block.dataset.tip);
});
el.timelineTrack.addEventListener('pointerout', (event) => {
  if (!drag && event.target.closest('.timeline-block')) hideTip();
});
el.timelineTrack.addEventListener('focusin', (event) => {
  const block = event.target.closest('.timeline-block');
  if (block) showTip(block);
});
el.timelineTrack.addEventListener('focusout', hideTip);

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
  el.scopeSwitch.querySelectorAll('.segmented-btn').forEach(b => {
    b.classList.toggle('is-on', b === button);
    b.setAttribute('aria-pressed', String(b === button));
  });
  state.scope = button.dataset.scope;
  positionSegmentThumb();
  withTransition(renderTasks);
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

// Settings save themselves; the slider waits for the hand to settle
let brightnessTimer;
el.brightness.addEventListener('input', (event) => {
  el.brightnessValue.textContent = `${event.target.value}%`;
  paintSlider(event.target);
  clearTimeout(brightnessTimer);
  brightnessTimer = setTimeout(() => saveConfig({ brightness: event.target.value }), 250);
});

el.timezone.addEventListener('change', () => {
  updateDst(el.timezone.value);
  saveConfig({ timezone: el.timezone.value });
});
el.timeFormat.addEventListener('change', () => {
  state.config.time_format = el.timeFormat.value;
  state.lastClock = null;
  renderAll();
  saveConfig({ time_format: el.timeFormat.value });
});
el.language.addEventListener('change', async () => {
  await i18n.load(el.language.value);
  i18n.apply();
  state.config.language = el.language.value;
  fillTimezones(el.timezone.value || state.config.timezone);
  setTaskSaving(state.saving);
  renderAll();
  saveConfig({ language: el.language.value });
});
el.syncInterval.addEventListener('change', () => saveConfig({ calendar_sync_minutes: el.syncInterval.value }));

el.refreshStatusBtn.addEventListener('click', refreshDevice);

// A broken preview image should not leave an empty frame
el.einkPreview.addEventListener('error', () => { el.einkPreview.style.visibility = 'hidden'; });

let resizeTimer;
window.addEventListener('resize', () => {
  positionSegmentThumb();
  clearTimeout(resizeTimer);
  // The timeline zooms to 12 h on narrow screens
  resizeTimer = setTimeout(() => {
    renderTimelineScale();
    renderTimeline();
  }, 120);
});

// The compose button slides away while scrolling down so it never hides a row
let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (Math.abs(y - lastScrollY) < 8) return;
  el.fabBtn.classList.toggle('is-hidden', y > lastScrollY && y > 120);
  lastScrollY = y;
}, { passive: true });

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  trapFocus(event);

  if (event.key === 'Escape') {
    const open = openSheets();
    if (open.length) {
      open.forEach(s => closeSheet(s));
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
  } else if (event.key === '?') {
    event.preventDefault();
    openSheet(el.shortcutsSheet);
  }
});

// ─────────────────────────────────────────────────────────────── Boot ───────

async function poll() {
  try {
    await Promise.all([loadStatus(), loadTasks(), loadCalendars()]);
    renderAll();
  } catch {
    /* setOnline already flagged it; the next tick will retry */
  }
}

const timers = { poll: null, preview: null, tick: null };

function startLoops() {
  stopLoops();
  timers.poll = setInterval(poll, POLL_MS);
  timers.preview = setInterval(loadPreview, 60000);
  timers.tick = setInterval(tick, 1000);
  connectStream();
}

function stopLoops() {
  Object.keys(timers).forEach(key => {
    clearInterval(timers[key]);
    timers[key] = null;
  });
  disconnectStream();
}

// A hidden tab stops polling, streaming and animating; coming back catches up
document.addEventListener('visibilitychange', () => {
  root.classList.toggle('is-paused', document.hidden);
  if (document.hidden) {
    stopLoops();
  } else {
    startLoops();
    refreshAll();
  }
});

async function init() {
  buildPresets();
  syncColor();
  syncCalColor();

  try {
    await loadConfig();
  } catch (error) {
    await i18n.load('es');
    i18n.apply();
    toast(error.message || i18n.t('notifications.errorLoadConfig'), { type: 'error' });
  }

  try {
    await Promise.all([loadTasks(), loadStatus(), loadCalendars()]);
  } catch (error) {
    toast(error.message || i18n.t('notifications.errorLoadTasks'), { type: 'error' });
  }

  renderAll();
  loadPreview();
  if (!document.hidden) startLoops();
}

init();
