const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('./helpers');

test('default config is seeded', () => {
  assert.equal(db.getConfig('language'), 'es');
  assert.equal(db.getConfig('calendar_sync_minutes'), '15');
});

test('task CRUD', () => {
  const task = db.createTask({ name: 'Focus', start_time: '09:00', end_time: '10:00', led_color: '255,0,0' });
  assert.equal(task.name, 'Focus');
  assert.equal(task.active_days, '0,1,2,3,4,5,6');

  const updated = db.updateTask(task.id, { ...task, name: 'Deep work' });
  assert.equal(updated.name, 'Deep work');

  assert.equal(db.toggleTaskDone(task.id).done, 1);
  assert.equal(db.getSchedulableTasks().some(t => t.id === task.id), false);

  assert.equal(db.deleteTask(task.id), true);
  assert.equal(db.deleteTask(task.id), false);
});

test('calendar: edit LED colour and name, keep URL', () => {
  const cal = db.createCalendar({ name: 'Work', url: 'https://example.com/a.ics', led_color: '224,163,74' });
  assert.equal(cal.enabled, 1);

  const recoloured = db.updateCalendar(cal.id, { name: 'Work 2', led_color: '10,20,30', enabled: 1 });
  assert.equal(recoloured.led_color, '10,20,30');
  assert.equal(recoloured.name, 'Work 2');
  assert.equal(recoloured.url, cal.url);

  const off = db.updateCalendar(cal.id, { name: 'Work 2', led_color: null, enabled: 1 });
  assert.equal(off.led_color, null);
});

test('calendar: duplicate URLs are rejected, delete cascades to events', () => {
  const cal = db.createCalendar({ name: 'Dup', url: 'https://example.com/dup.ics' });
  assert.throws(() => db.createCalendar({ name: 'Dup 2', url: cal.url }), /UNIQUE/);
  assert.equal(db.getCalendarByUrl(cal.url).id, cal.id);

  db.replaceCalendarEvents(cal.id, [{ uid: 'uid-1', title: 'Meeting', start_utc: '2026-11-03T10:00:00.000Z', end_utc: '2026-11-03T11:00:00.000Z' }]);
  assert.equal(db.getEventsInRange('2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z').length >= 1, true);

  db.deleteCalendar(cal.id);
  assert.equal(db.getEventsInRange('2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z')
    .some(e => e.calendar_id === cal.id), false);
});

test('paused calendars do not contribute events', () => {
  const cal = db.createCalendar({ name: 'Paused', url: 'https://example.com/p.ics' });
  db.replaceCalendarEvents(cal.id, [{ uid: 'uid-p', title: 'Hidden', start_utc: '2026-12-01T10:00:00.000Z', end_utc: '2026-12-01T11:00:00.000Z' }]);
  db.updateCalendar(cal.id, { name: 'Paused', led_color: null, enabled: 0 });
  assert.equal(db.getEventsInRange('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z')
    .some(e => e.calendar_id === cal.id), false);
});
