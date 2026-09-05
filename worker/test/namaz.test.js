import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateKey,
  hmToMinutes,
  isNamazInFireWindow,
  runNamazScheduler,
} from '../src/namaz.js';

describe('isNamazInFireWindow', () => {
  it('fires in the lead window on the same calendar day', () => {
    // Dhuhr 12:30, lead 10 → 12:20
    assert.equal(isNamazInFireWindow(12 * 60 + 20, 12 * 60 + 30, 10, 2, 0), true);
    assert.equal(isNamazInFireWindow(12 * 60 + 21, 12 * 60 + 30, 10, 2, 0), true);
    assert.equal(isNamazInFireWindow(12 * 60 + 22, 12 * 60 + 30, 10, 2, 0), false);
    assert.equal(isNamazInFireWindow(12 * 60 + 19, 12 * 60 + 30, 10, 2, 0), false);
  });

  it('does not wrap yesterday\'s early prayer onto tonight', () => {
    // Midnight 00:20 already happened; at 23:50 must NOT match today\'s occurrence
    assert.equal(isNamazInFireWindow(23 * 60 + 50, 20, 30, 2, 0), false);
  });

  it('fires tomorrow\'s midnight on the previous evening when lead crosses midnight', () => {
    // Tomorrow midnight 00:20, lead 30 → 23:50 today (offset 1440)
    assert.equal(isNamazInFireWindow(23 * 60 + 50, 20, 30, 2, 1440), true);
    assert.equal(isNamazInFireWindow(23 * 60 + 51, 20, 30, 2, 1440), true);
    assert.equal(isNamazInFireWindow(23 * 60 + 52, 20, 30, 2, 1440), false);
    assert.equal(isNamazInFireWindow(23 * 60 + 49, 20, 30, 2, 1440), false);
  });

  it('fires same-day midnight when lead does not wrap', () => {
    // Midnight 00:20, lead 10 → 00:10
    assert.equal(isNamazInFireWindow(10, 20, 10, 2, 0), true);
    assert.equal(isNamazInFireWindow(9, 20, 10, 2, 0), false);
  });
});

describe('date helpers', () => {
  it('adds days across month boundaries', () => {
    assert.equal(addDaysToDateKey('2026-09-05', 1), '2026-09-06');
    assert.equal(addDaysToDateKey('2026-01-31', 1), '2026-02-01');
    assert.equal(addDaysToDateKey('2026-12-31', 1), '2027-01-01');
  });

  it('parses HH:MM', () => {
    assert.equal(hmToMinutes('00:20'), 20);
    assert.equal(hmToMinutes('23:50'), 23 * 60 + 50);
    assert.equal(hmToMinutes(''), null);
  });
});

function createMemoryDb({ users = [], cache = new Map(), sent = new Map(), devices = [] } = {}) {
  const db = {
    users,
    cache,
    sent,
    devices,
    prepare(sql) {
      const s = String(sql).replace(/\s+/g, ' ');
      const stmt = {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          if (s.includes('FROM users')) {
            return { results: db.users.filter((u) => Number(u.namaz_enabled) === 1) };
          }
          if (s.includes('FROM devices')) {
            const userId = this.args[0];
            return {
              results: db.devices.filter((d) => d.user_id === userId && d.revoked_at == null),
            };
          }
          return { results: [] };
        },
        async first() {
          if (s.includes('FROM namaz_day_cache')) {
            return db.cache.get(`${this.args[0]}|${this.args[1]}`) || null;
          }
          if (s.includes('FROM namaz_sent')) {
            const key = `${this.args[0]}|${this.args[1]}|${this.args[2]}`;
            return db.sent.has(key) ? { sent_at: db.sent.get(key) } : null;
          }
          return null;
        },
        async run() {
          if (s.includes('INSERT OR REPLACE INTO namaz_sent')) {
            const [userId, dateKey, prayer, sentAt] = this.args;
            db.sent.set(`${userId}|${dateKey}|${prayer}`, sentAt);
          }
          if (s.includes('INSERT OR REPLACE INTO namaz_day_cache')) {
            const [userId, dateKey, timings_json, timezone, fetched_at] = this.args;
            db.cache.set(`${userId}|${dateKey}`, { timings_json, timezone, fetched_at });
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };
  return db;
}

function seedCache(cache, userId, dateKey, timings, timezone = 'UTC') {
  cache.set(`${userId}|${dateKey}`, {
    timings_json: JSON.stringify(timings),
    timezone,
    fetched_at: Date.now(),
  });
}

describe('runNamazScheduler', () => {
  const timingsDay = {
    fajr: '04:30',
    dhuhr: '12:30',
    asr: '15:45',
    maghrib: '19:10',
    isha: '20:20',
    midnight: '00:20',
  };

  it('does not mark sent when web and Telegram both fail', async () => {
    const cache = new Map();
    seedCache(cache, 'u1', '2026-09-05', timingsDay);
    const db = createMemoryDb({
      users: [
        {
          id: 'u1',
          lang: 'en',
          namaz_enabled: 1,
          namaz_lat: 40.4,
          namaz_lng: 49.8,
          namaz_timezone: 'UTC',
          namaz_prayers: JSON.stringify(['dhuhr']),
          namaz_lead_min: 10,
        },
      ],
      cache,
    });
    const nowMs = Date.UTC(2026, 8, 5, 12, 20, 5);
    await runNamazScheduler({ DB: db }, null, async () => ({ sent: 0, failed: 1 }), nowMs);
    assert.equal(db.sent.size, 0);
  });

  it('marks sent only after a successful Telegram delivery', async () => {
    const cache = new Map();
    seedCache(cache, 'u1', '2026-09-05', timingsDay);
    const db = createMemoryDb({
      users: [
        {
          id: 'u1',
          lang: 'en',
          namaz_enabled: 1,
          namaz_lat: 40.4,
          namaz_lng: 49.8,
          namaz_timezone: 'UTC',
          namaz_prayers: JSON.stringify(['dhuhr']),
          namaz_lead_min: 10,
        },
      ],
      cache,
    });
    const nowMs = Date.UTC(2026, 8, 5, 12, 20, 5);
    await runNamazScheduler({ DB: db }, null, async () => ({ sent: 1, failed: 0 }), nowMs);
    assert.equal(db.sent.has('u1|2026-09-05|dhuhr'), true);
  });

  it('sends tomorrow midnight on the previous evening when lead wraps past midnight', async () => {
    const cache = new Map();
    seedCache(cache, 'u1', '2026-09-05', timingsDay);
    seedCache(cache, 'u1', '2026-09-06', { ...timingsDay, midnight: '00:20' });
    const db = createMemoryDb({
      users: [
        {
          id: 'u1',
          lang: 'en',
          namaz_enabled: 1,
          namaz_lat: 40.4,
          namaz_lng: 49.8,
          namaz_timezone: 'UTC',
          namaz_prayers: JSON.stringify(['midnight']),
          namaz_lead_min: 30,
        },
      ],
      cache,
    });
    const nowMs = Date.UTC(2026, 8, 5, 23, 50, 5);
    await runNamazScheduler({ DB: db }, null, async () => ({ sent: 1, failed: 0 }), nowMs);
    assert.equal(db.sent.has('u1|2026-09-06|midnight'), true);
    assert.equal(db.sent.has('u1|2026-09-05|midnight'), false);
  });
});
