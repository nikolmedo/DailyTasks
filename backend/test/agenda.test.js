const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
require('./helpers');
const agenda = require('../agenda');

const slot = (start, end, extra = {}) => ({
  all_day: false,
  startMinutes: agenda.timeToMinutes(start),
  endMinutes: agenda.timeToMinutes(end),
  crossesMidnight: agenda.timeToMinutes(end) < agenda.timeToMinutes(start),
  ...extra
});

test('timeToMinutes / minutesToTime round-trip and wrap', () => {
  assert.equal(agenda.timeToMinutes('09:30'), 570);
  assert.equal(agenda.minutesToTime(570), '09:30');
  assert.equal(agenda.minutesToTime(1440 + 60), '01:00');
  assert.equal(agenda.minutesToTime(-30), '23:30');
});

test('dayOfWeek maps Luxon Sunday (7) to 0', () => {
  assert.equal(agenda.dayOfWeek(DateTime.fromISO('2026-11-01')), 0); // Sunday
  assert.equal(agenda.dayOfWeek(DateTime.fromISO('2026-11-02')), 1); // Monday
});

test('isTaskActiveOnDay honours the weekday list', () => {
  assert.equal(agenda.isTaskActiveOnDay({ active_days: '1,2' }, 1), true);
  assert.equal(agenda.isTaskActiveOnDay({ active_days: '1,2' }, 0), false);
  assert.equal(agenda.isTaskActiveOnDay({ active_days: null }, 5), true);
});

test('isSlotActive: end is exclusive, midnight-crossing slots wrap', () => {
  const day = slot('09:00', '10:00');
  assert.equal(agenda.isSlotActive(day, 540), true);
  assert.equal(agenda.isSlotActive(day, 600), false);

  const night = slot('23:00', '01:00');
  assert.equal(agenda.isSlotActive(night, 23 * 60 + 30), true);
  assert.equal(agenda.isSlotActive(night, 30), true);
  assert.equal(agenda.isSlotActive(night, 12 * 60), false);
});

test('progress, duration and remaining across midnight', () => {
  const night = slot('23:00', '01:00');
  assert.equal(agenda.slotDuration(night), 120);
  assert.equal(agenda.slotProgress(night, 0), 0.5);
  assert.equal(agenda.slotRemaining(night, 0), 60);
});

test('pickActiveSlot prefers timed over all-day, then latest start', () => {
  const backdrop = { all_day: true, startMinutes: 0, endMinutes: 1440, name: 'backdrop' };
  const early = slot('09:00', '12:00', { name: 'early' });
  const late = slot('10:00', '11:00', { name: 'late' });

  assert.equal(agenda.pickActiveSlot([backdrop], 600).name, 'backdrop');
  assert.equal(agenda.pickActiveSlot([backdrop, early], 600).name, 'early');
  assert.equal(agenda.pickActiveSlot([backdrop, early, late], 630).name, 'late');
  assert.equal(agenda.pickActiveSlot([early], 800), null);
});
