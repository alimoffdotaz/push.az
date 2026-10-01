import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateKey,
  isNamazAlertDue,
  localNoonUnix,
  namazAlertFromTimetableStart,
} from '../src/namaz.js';

const WINDOW = 2;

function zonedMinutes(unixSec, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(unixSec * 1000))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

test('midnight 00:07 with default lead 10 alerts the previous evening', () => {
  // Baku 15 Jan 2026: Midnight 00:07 is the night of 15→16. Lead 10 → 23:57 on the 15th.
  const alert = namazAlertFromTimetableStart('midnight', 7, 10);
  assert.equal(alert, 23 * 60 + 57);
  assert.equal(isNamazAlertDue(23 * 60 + 57, alert, 0, WINDOW), true);
  assert.equal(isNamazAlertDue(7, alert, 0, WINDOW), false);
  assert.equal(isNamazAlertDue(7, alert, 1, WINDOW), false);
});

test('midnight 00:14 with lead 10 alerts the next morning, not this morning', () => {
  // Baku 15 Feb 2026: Midnight 00:14 occurs 16 Feb 00:14. Lead 10 → 16 Feb 00:04.
  const alert = namazAlertFromTimetableStart('midnight', 14, 10);
  assert.equal(alert, 1440 + 4);
  assert.equal(isNamazAlertDue(4, alert, 0, WINDOW), false);
  assert.equal(isNamazAlertDue(4, alert, 1, WINDOW), true);
  assert.equal(isNamazAlertDue(14, alert, 0, WINDOW), false);
});

test('midnight 00:31 with lead 10 is the following morning (Istanbul winter)', () => {
  const alert = namazAlertFromTimetableStart('midnight', 31, 10);
  assert.equal(alert, 1440 + 21);
  assert.equal(isNamazAlertDue(21, alert, 0, WINDOW), false);
  assert.equal(isNamazAlertDue(21, alert, 1, WINDOW), true);
});

test('evening midnight stays on the timetable date', () => {
  // Baku 15 Jun 2026: Midnight 23:48, lead 10 → 23:38 the same evening.
  const alert = namazAlertFromTimetableStart('midnight', 23 * 60 + 48, 10);
  assert.equal(alert, 23 * 60 + 38);
  assert.equal(isNamazAlertDue(23 * 60 + 38, alert, 0, WINDOW), true);
  assert.equal(isNamazAlertDue(0, alert, 1, WINDOW), false);
});

test('a 23:59 alert does not match 00:00 on the next date', () => {
  const alert = namazAlertFromTimetableStart('midnight', 23 * 60 + 59, 0);
  assert.equal(alert, 23 * 60 + 59);
  assert.equal(isNamazAlertDue(23 * 60 + 59, alert, 0, WINDOW), true);
  assert.equal(isNamazAlertDue(0, alert, 0, WINDOW), false);
  assert.equal(isNamazAlertDue(0, alert, 1, WINDOW), false);
});

test('midnight exactly 00:00 with lead 0 is the next calendar midnight', () => {
  const alert = namazAlertFromTimetableStart('midnight', 0, 0);
  assert.equal(alert, 1440);
  assert.equal(isNamazAlertDue(0, alert, 0, WINDOW), false);
  assert.equal(isNamazAlertDue(0, alert, 1, WINDOW), true);
});

test('fajr and the one-hour preview stay on the same morning', () => {
  const fajr = 5 * 60 + 16;
  const leadAlert = namazAlertFromTimetableStart('fajr', fajr, 10);
  assert.equal(leadAlert, 5 * 60 + 6);
  assert.equal(isNamazAlertDue(5 * 60 + 6, leadAlert, 0, WINDOW), true);
  const pre = fajr - 60;
  assert.equal(isNamazAlertDue(4 * 60 + 16, pre, 0, WINDOW), true);
  assert.equal(isNamazAlertDue(0, pre, 0, WINDOW), false);
});

test('daylight prayers are not shifted onto the next day', () => {
  for (const id of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    const alert = namazAlertFromTimetableStart(id, 18 * 60 + 30, 10);
    assert.equal(alert, 18 * 60 + 20);
    assert.equal(isNamazAlertDue(18 * 60 + 20, alert, 0, WINDOW), true);
  }
});

test('addDaysToDateKey crosses month and year boundaries', () => {
  assert.equal(addDaysToDateKey('2026-01-01', -1), '2025-12-31');
  assert.equal(addDaysToDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(addDaysToDateKey('2026-02-15', 1), '2026-02-16');
});

test('local noon stays on the requested civil date', () => {
  for (const tz of ['Asia/Baku', 'Europe/Istanbul', 'Europe/London', 'Atlantic/Reykjavik', 'UTC']) {
    for (const dateKey of ['2026-01-15', '2026-06-15', '2026-12-31']) {
      const unix = localNoonUnix(dateKey, tz);
      const z = zonedMinutes(unix, tz);
      assert.equal(z.dateKey, dateKey, tz);
      assert.ok(Math.abs(z.minutes - 12 * 60) <= 1, `${tz} ${dateKey} minutes ${z.minutes}`);
    }
  }
});
