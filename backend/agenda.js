/**
 * Agenda Module
 *
 * Single source of truth for "what is happening on a given day".
 * Merges local tasks with cached calendar occurrences into a uniform list of
 * time slots, then resolves which slot is active right now, what comes next and
 * how far along the active slot is.
 *
 * Both the scheduler (LED + e-ink) and the REST API read from here, so the
 * device and the web panel can never disagree.
 */

const { DateTime } = require('luxon');
const db = require('./database');

const DAY_MINUTES = 24 * 60;

/**
 * @param {string} timeStr - "HH:MM"
 * @returns {number} minutes since midnight
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = String(timeStr).split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * @param {number} minutes - minutes since midnight (may exceed 1440)
 * @returns {string} "HH:MM"
 */
function minutesToTime(minutes) {
  const wrapped = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Luxon uses 1=Monday..7=Sunday; the app stores 0=Sunday..6=Saturday.
 * @param {DateTime} dt
 * @returns {number}
 */
function dayOfWeek(dt) {
  return dt.weekday % 7;
}

/**
 * @param {Object} task
 * @param {number} dow - 0=Sunday..6=Saturday
 * @returns {boolean}
 */
function isTaskActiveOnDay(task, dow) {
  if (!task.active_days) return true;
  return task.active_days.split(',').map(d => parseInt(d.trim(), 10)).includes(dow);
}

/**
 * Turn a local task row into a slot for the given day.
 * @param {Object} task
 * @returns {Object} slot
 */
function taskToSlot(task) {
  const allDay = Boolean(task.all_day);
  const start = allDay ? 0 : timeToMinutes(task.start_time);
  const end = allDay ? DAY_MINUTES : timeToMinutes(task.end_time);

  return {
    key: `task:${task.id}`,
    id: task.id,
    source: 'task',
    name: task.name,
    all_day: allDay,
    led_color: task.led_color && task.led_color !== 'null' ? task.led_color : null,
    done: Boolean(task.done),
    start_time: allDay ? '00:00' : task.start_time,
    end_time: allDay ? '23:59' : task.end_time,
    startMinutes: start,
    endMinutes: end,
    // A task whose end is before its start runs through midnight (e.g. 23:00→01:00)
    crossesMidnight: !allDay && end < start,
    editable: true
  };
}

/**
 * Turn a cached calendar occurrence into a slot clamped to the given local day.
 * Returns null when the occurrence does not touch that day.
 * @param {Object} event - row from `calendar_events` joined with `calendars`
 * @param {DateTime} dayStart - start of the local day
 * @returns {Object|null} slot
 */
function eventToSlot(event, dayStart) {
  const zone = dayStart.zone;
  const dayEnd = dayStart.plus({ days: 1 });
  const allDay = Boolean(event.all_day);

  let start;
  let end;

  if (allDay) {
    // All-day events are stored as bare dates pinned to UTC midnight, and the
    // iCalendar DTEND is exclusive.
    start = DateTime.fromISO(event.start_utc, { zone: 'utc' }).setZone(zone, { keepLocalTime: true });
    end = DateTime.fromISO(event.end_utc, { zone: 'utc' }).setZone(zone, { keepLocalTime: true });
    if (end <= start) end = start.plus({ days: 1 });
  } else {
    start = DateTime.fromISO(event.start_utc, { zone: 'utc' }).setZone(zone);
    end = DateTime.fromISO(event.end_utc, { zone: 'utc' }).setZone(zone);
    if (end <= start) end = start.plus({ minutes: 30 });
  }

  if (end <= dayStart || start >= dayEnd) return null;

  const spansWholeDay = allDay || (start <= dayStart && end >= dayEnd);

  const clampedStart = start < dayStart ? dayStart : start;
  const clampedEnd = end > dayEnd ? dayEnd : end;

  const startMinutes = spansWholeDay ? 0 : Math.floor(clampedStart.diff(dayStart, 'minutes').minutes);
  const endMinutes = spansWholeDay ? DAY_MINUTES : Math.ceil(clampedEnd.diff(dayStart, 'minutes').minutes);

  return {
    key: `event:${event.id}`,
    id: event.id,
    source: 'calendar',
    name: event.title,
    location: event.location || null,
    description: event.description || null,
    calendar_id: event.calendar_id,
    calendar_name: event.calendar_name,
    all_day: spansWholeDay,
    led_color: event.calendar_color && event.calendar_color !== 'null' ? event.calendar_color : null,
    done: false,
    start_time: spansWholeDay ? '00:00' : minutesToTime(startMinutes),
    end_time: spansWholeDay ? '23:59' : minutesToTime(endMinutes),
    startMinutes,
    endMinutes,
    crossesMidnight: false,
    // Continuation markers so the UI can show "…" on multi-day events
    continuesBefore: start < dayStart,
    continuesAfter: end > dayEnd,
    editable: false
  };
}

/**
 * Build the merged agenda for one local day.
 * @param {DateTime} dt - any instant inside the target day, in the target zone
 * @param {Object} [opts]
 * @param {boolean} [opts.includeDone=false] - keep tasks already marked done
 * @returns {Array<Object>} slots sorted by start time
 */
function buildAgenda(dt, opts = {}) {
  const { includeDone = false } = opts;
  const dayStart = dt.startOf('day');
  const dow = dayOfWeek(dayStart);

  const tasks = includeDone ? db.getAllTasks() : db.getSchedulableTasks();
  const slots = tasks
    .filter(task => isTaskActiveOnDay(task, dow))
    .map(taskToSlot);

  // Query a generous UTC window; eventToSlot does the precise clamping
  const windowFrom = dayStart.minus({ days: 2 }).toUTC().toISO();
  const windowTo = dayStart.plus({ days: 2 }).toUTC().toISO();

  for (const event of db.getEventsInRange(windowFrom, windowTo)) {
    const slot = eventToSlot(event, dayStart);
    if (slot) slots.push(slot);
  }

  slots.sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? 1 : -1;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return String(a.name).localeCompare(String(b.name));
  });

  return slots;
}

/**
 * Is a slot running at the given minute-of-day?
 * @param {Object} slot
 * @param {number} nowMinutes
 * @returns {boolean}
 */
function isSlotActive(slot, nowMinutes) {
  if (slot.all_day) return true;
  if (slot.crossesMidnight) {
    return nowMinutes >= slot.startMinutes || nowMinutes < slot.endMinutes;
  }
  return nowMinutes >= slot.startMinutes && nowMinutes < slot.endMinutes;
}

/**
 * How far through a slot we are, 0..1. All-day slots track the whole day.
 * @param {Object} slot
 * @param {number} nowMinutes
 * @returns {number}
 */
function slotProgress(slot, nowMinutes) {
  if (slot.all_day) return Math.min(1, Math.max(0, nowMinutes / DAY_MINUTES));

  const start = slot.startMinutes;
  const end = slot.crossesMidnight ? slot.endMinutes + DAY_MINUTES : slot.endMinutes;
  const now = slot.crossesMidnight && nowMinutes < slot.startMinutes ? nowMinutes + DAY_MINUTES : nowMinutes;

  const span = end - start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (now - start) / span));
}

/**
 * Total length of a slot in minutes.
 * @param {Object} slot
 * @returns {number}
 */
function slotDuration(slot) {
  if (slot.all_day) return DAY_MINUTES;
  const end = slot.crossesMidnight ? slot.endMinutes + DAY_MINUTES : slot.endMinutes;
  return Math.max(1, end - slot.startMinutes);
}

/**
 * Minutes remaining in a slot.
 * @param {Object} slot
 * @param {number} nowMinutes
 * @returns {number}
 */
function slotRemaining(slot, nowMinutes) {
  if (slot.all_day) return Math.max(0, DAY_MINUTES - nowMinutes);
  const end = slot.crossesMidnight ? slot.endMinutes + DAY_MINUTES : slot.endMinutes;
  const now = slot.crossesMidnight && nowMinutes < slot.startMinutes ? nowMinutes + DAY_MINUTES : nowMinutes;
  return Math.max(0, end - now);
}

/**
 * Pick the slot that should own the LED and the e-ink screen.
 *
 * A concrete appointment beats an all-day backdrop, and among overlapping
 * appointments the most recently started one wins — that is the one the user
 * just walked into.
 *
 * @param {Array<Object>} slots
 * @param {number} nowMinutes
 * @returns {Object|null}
 */
function pickActiveSlot(slots, nowMinutes) {
  const running = slots.filter(slot => isSlotActive(slot, nowMinutes));
  if (running.length === 0) return null;

  const timed = running.filter(slot => !slot.all_day);
  const pool = timed.length > 0 ? timed : running;

  return pool.slice().sort((a, b) => {
    // Latest start first
    const aStart = a.crossesMidnight && nowMinutes < a.startMinutes ? a.startMinutes - DAY_MINUTES : a.startMinutes;
    const bStart = b.crossesMidnight && nowMinutes < b.startMinutes ? b.startMinutes - DAY_MINUTES : b.startMinutes;
    if (aStart !== bStart) return bStart - aStart;
    // Then the shorter (more specific) slot
    return slotRemaining(a, nowMinutes) - slotRemaining(b, nowMinutes);
  })[0];
}

/**
 * The next slot to start after `nowMinutes`, looking into tomorrow if needed.
 * @param {DateTime} now
 * @param {Array<Object>} todaySlots
 * @returns {Object|null} slot with an extra `isTomorrow` flag
 */
function findNextSlot(now, todaySlots) {
  const nowMinutes = now.hour * 60 + now.minute;

  const upcomingToday = todaySlots
    .filter(slot => !slot.all_day && slot.startMinutes > nowMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (upcomingToday.length > 0) return { ...upcomingToday[0], isTomorrow: false };

  const tomorrow = buildAgenda(now.plus({ days: 1 }).startOf('day'));
  const firstTomorrow = tomorrow
    .filter(slot => !slot.all_day)
    .sort((a, b) => a.startMinutes - b.startMinutes)[0];

  return firstTomorrow ? { ...firstTomorrow, isTomorrow: true } : null;
}

/**
 * Full "right now" snapshot for a zone.
 * @param {string} timezone - IANA zone
 * @returns {Object} snapshot
 */
function snapshot(timezone) {
  const now = DateTime.now().setZone(timezone);
  const nowMinutes = now.hour * 60 + now.minute;

  const slots = buildAgenda(now);
  const active = pickActiveSlot(slots, nowMinutes);
  const next = findNextSlot(now, slots);

  return {
    now,
    nowMinutes,
    currentTime: now.toFormat('HH:mm'),
    date: now.toISODate(),
    timezone,
    slots,
    active,
    next,
    progress: active ? slotProgress(active, nowMinutes) : 0,
    remaining: active ? slotRemaining(active, nowMinutes) : 0,
    duration: active ? slotDuration(active) : 0
  };
}

module.exports = {
  DAY_MINUTES,
  timeToMinutes,
  minutesToTime,
  dayOfWeek,
  isTaskActiveOnDay,
  buildAgenda,
  isSlotActive,
  slotProgress,
  slotRemaining,
  slotDuration,
  pickActiveSlot,
  findNextSlot,
  snapshot
};
