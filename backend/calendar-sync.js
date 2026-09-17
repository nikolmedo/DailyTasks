/**
 * Calendar Sync Module
 *
 * Subscribes to iCalendar (.ics) feeds — typically the "Secret address in iCal
 * format" of a Google Calendar, which works for shared/team calendars too — and
 * caches the expanded occurrences in SQLite so the scheduler can treat them as
 * read-only tasks.
 *
 * Read-only by design: nothing is ever written back to Google.
 */

const IcalExpander = require('ical-expander');
const db = require('./database');

// How far around "now" we expand recurring events, in days
const WINDOW_BACK_DAYS = 2;
const WINDOW_FORWARD_DAYS = 21;

// Hard limits so a pathological feed can't exhaust memory
const MAX_FEED_BYTES = 8 * 1024 * 1024;
const MAX_OCCURRENCES = 2000;
const FETCH_TIMEOUT_MS = 20000;

let syncTimer = null;
let syncing = false;
let lastSyncAt = null;

/**
 * Normalise a user-supplied calendar URL.
 * Google hands out `webcal://` links for "subscribe" and `https://` for the
 * secret iCal address; both are accepted.
 * @param {string} raw
 * @returns {string} an https/http URL
 */
function normalizeUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) throw new Error('Calendar URL is required');
  const normalized = url.replace(/^webcal:\/\//i, 'https://');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Invalid calendar URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Calendar URL must use http(s) or webcal');
  }
  return parsed.toString();
}

/**
 * Download an .ics feed.
 * @param {string} url
 * @returns {Promise<string>} raw iCalendar text
 */
async function fetchIcs(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'Accept': 'text/calendar, text/plain;q=0.9, */*;q=0.5',
      'User-Agent': 'daily-tasks/2.0 (+distiller)'
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FEED_BYTES) {
    throw new Error(`Feed too large (${Math.round(buf.length / 1024)} KB)`);
  }

  const text = buf.toString('utf8');
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error('Response is not an iCalendar feed (missing BEGIN:VCALENDAR)');
  }
  return text;
}

/**
 * Build the UTC ISO pair for an occurrence.
 * All-day events carry a floating date (no time, no zone), so they are stored as
 * the bare calendar date pinned to UTC midnight; timed events are stored as the
 * true absolute instant.
 * @param {Object} startDate - ICAL.Time
 * @param {Object} endDate - ICAL.Time
 * @returns {{start_utc: string, end_utc: string, all_day: boolean}}
 */
function toStoredRange(startDate, endDate) {
  const allDay = Boolean(startDate.isDate);

  if (allDay) {
    const pin = (t) => new Date(Date.UTC(t.year, t.month - 1, t.day)).toISOString();
    return { start_utc: pin(startDate), end_utc: pin(endDate), all_day: true };
  }

  return {
    start_utc: startDate.toJSDate().toISOString(),
    end_utc: endDate.toJSDate().toISOString(),
    all_day: false
  };
}

/**
 * Expand a feed into concrete occurrences inside the sync window.
 * @param {string} icsText
 * @returns {Array<Object>} rows ready for `replaceCalendarEvents`
 */
function expandFeed(icsText) {
  const expander = new IcalExpander({ ics: icsText, maxIterations: 1000 });

  const now = Date.now();
  const after = new Date(now - WINDOW_BACK_DAYS * 86400000);
  const before = new Date(now + WINDOW_FORWARD_DAYS * 86400000);

  const { events, occurrences } = expander.between(after, before);

  const rows = [];
  const seen = new Set();

  const push = (uid, title, location, startDate, endDate) => {
    if (rows.length >= MAX_OCCURRENCES) return;
    const range = toStoredRange(startDate, endDate);
    // A recurring event and its override can resolve to the same slot
    const key = `${uid}|${range.start_utc}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      uid,
      title: (title || '').trim().slice(0, 200) || '—',
      location: location ? String(location).trim().slice(0, 200) : null,
      ...range
    });
  };

  for (const e of events) {
    push(e.uid, e.summary, e.location, e.startDate, e.endDate);
  }
  for (const o of occurrences) {
    const item = o.item;
    push(item.uid, item.summary, item.location, o.startDate, o.endDate);
  }

  rows.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  return rows;
}

/**
 * Sync a single calendar subscription into the cache.
 * @param {Object} calendar - row from the `calendars` table
 * @returns {Promise<{id:number, name:string, ok:boolean, count:number, error?:string}>}
 */
async function syncCalendar(calendar) {
  const stamp = new Date().toISOString();
  try {
    const ics = await fetchIcs(calendar.url);
    const events = expandFeed(ics);
    db.replaceCalendarEvents(calendar.id, events);
    db.setCalendarSyncResult(calendar.id, {
      lastSync: stamp,
      lastError: null,
      eventCount: events.length
    });
    console.log(`📅 Synced "${calendar.name}": ${events.length} occurrence(s)`);
    return { id: calendar.id, name: calendar.name, ok: true, count: events.length };
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'Timed out while downloading the feed'
      : error.message;
    db.setCalendarSyncResult(calendar.id, {
      lastSync: stamp,
      lastError: message,
      eventCount: calendar.event_count || 0
    });
    console.error(`❌ Calendar "${calendar.name}" sync failed: ${message}`);
    return { id: calendar.id, name: calendar.name, ok: false, count: 0, error: message };
  }
}

/**
 * Sync every enabled calendar. Concurrent calls collapse into the running one.
 * @returns {Promise<Array>} per-calendar results
 */
async function syncAll() {
  if (syncing) return [];
  syncing = true;
  try {
    const calendars = db.getEnabledCalendars();
    if (calendars.length === 0) return [];
    const results = [];
    for (const cal of calendars) {
      results.push(await syncCalendar(cal));
    }
    lastSyncAt = new Date().toISOString();
    return results;
  } finally {
    syncing = false;
  }
}

/**
 * Validate a feed before it is saved, and guess a display name from it.
 * @param {string} url
 * @returns {Promise<{name: string|null, count: number}>}
 */
async function probe(url) {
  const ics = await fetchIcs(url);
  const nameMatch = ics.match(/^X-WR-CALNAME:(.*)$/mi);
  const events = expandFeed(ics);
  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    count: events.length
  };
}

/**
 * Start the background sync loop. Interval comes from the `calendar_sync_minutes`
 * config key and is re-read on every tick, so changing it takes effect quickly.
 */
function startSync() {
  if (syncTimer) return;

  const tick = async () => {
    await syncAll();
    schedule();
  };

  const schedule = () => {
    const minutes = Math.min(180, Math.max(5, parseInt(db.getConfig('calendar_sync_minutes') || '15', 10) || 15));
    clearTimeout(syncTimer);
    syncTimer = setTimeout(tick, minutes * 60 * 1000);
  };

  // First pass shortly after boot so the server is responsive first
  syncTimer = setTimeout(tick, 5000);
  console.log('✓ Calendar sync started');
}

function stopSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
    console.log('⏹️  Calendar sync stopped');
  }
}

function getSyncState() {
  return { syncing, lastSyncAt };
}

module.exports = {
  normalizeUrl,
  syncCalendar,
  syncAll,
  probe,
  startSync,
  stopSync,
  getSyncState,
  WINDOW_FORWARD_DAYS
};
