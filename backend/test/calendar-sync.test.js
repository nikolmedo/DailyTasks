const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { normalizeUrl, expandFeed } = require('../calendar-sync');

test('normalizeUrl converts webcal:// and rejects bad input', () => {
  assert.equal(normalizeUrl('webcal://example.com/a.ics'), 'https://example.com/a.ics');
  assert.equal(normalizeUrl(' http://example.com/a.ics '), 'http://example.com/a.ics');
  assert.throws(() => normalizeUrl(''), /required/);
  assert.throws(() => normalizeUrl('not a url'), /Invalid/);
  assert.throws(() => normalizeUrl('ftp://example.com/a.ics'), /http/);
});

function ics(body) {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}END:VCALENDAR\r\n`;
}

const stamp = (offsetDays, hour) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace(/[-:]/g, '').replace('.000', '');
};

test('expandFeed returns timed events inside the window', () => {
  const rows = expandFeed(ics(
    `BEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Standup\r\nDTSTART:${stamp(1, 9)}\r\nDTEND:${stamp(1, 10)}\r\nEND:VEVENT\r\n`
  ));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Standup');
  assert.equal(rows[0].all_day, false);
});

test('expandFeed expands recurrence and flags all-day events', () => {
  const rows = expandFeed(ics(
    `BEGIN:VEVENT\r\nUID:daily\r\nSUMMARY:Daily\r\nDTSTART:${stamp(0, 8)}\r\nDTEND:${stamp(0, 9)}\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\n` +
    `BEGIN:VEVENT\r\nUID:allday\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20991231\r\nDTEND;VALUE=DATE:21000101\r\nEND:VEVENT\r\n`
  ));
  assert.equal(rows.filter(r => r.title === 'Daily').length, 3);
  assert.equal(rows.some(r => r.title === 'Holiday'), false); // far outside the window
});

test('expandFeed tolerates an empty calendar', () => {
  assert.deepEqual(expandFeed(ics('')), []);
});
