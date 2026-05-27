import assert from 'node:assert/strict';
import test from 'node:test';
import { __test } from '../src/index.js';

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async all() {
    return this.db.all(this.sql, this.args);
  }

  async first() {
    return this.db.first(this.sql, this.args);
  }

  async run() {
    return this.db.run(this.sql, this.args);
  }
}

class FakeDB {
  constructor({ reminders = [], users = [], devices = [], telegramLinks = [] } = {}) {
    this.reminders = new Map(reminders.map((r) => [r.id, { ...r }]));
    this.users = new Map(users.map((u) => [u.id, { ...u }]));
    this.devices = devices.map((d) => ({ ...d }));
    this.telegramLinks = telegramLinks.map((l) => ({ ...l }));
    this.pushLog = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async all(sql, args) {
    if (sql.includes('SELECT * FROM reminders')) {
      const now = args[0];
      return {
        results: [...this.reminders.values()].filter(
          (r) => r.status === 'active' && r.next_attempt_at <= now && r.user_id != null,
        ),
      };
    }
    if (sql.includes('SELECT chat_id FROM telegram_links')) {
      const userId = args[0];
      return { results: this.telegramLinks.filter((l) => l.user_id === userId).map((l) => ({ chat_id: l.chat_id })) };
    }
    if (sql.includes('SELECT * FROM devices')) {
      const userId = args[0];
      return { results: this.devices.filter((d) => d.user_id === userId && d.revoked_at == null) };
    }
    return { results: [] };
  }

  async first(sql, args) {
    if (sql.includes('SELECT COUNT(*) AS c FROM reminders')) {
      const [userId, now] = args;
      let c = 0;
      for (const r of this.reminders.values()) {
        if (
          r.user_id === userId &&
          r.acked_at == null &&
          (r.status === 'missed' || (r.status === 'active' && r.fire_at <= now))
        ) c++;
      }
      return { c };
    }
    if (sql.includes('SELECT lang, news_categories FROM users')) {
      const u = this.users.get(args[0]);
      return u ? { lang: u.lang, news_categories: u.news_categories } : null;
    }
    if (sql.includes('SELECT lang FROM users')) {
      const u = this.users.get(args[0]);
      return u ? { lang: u.lang } : null;
    }
    return null;
  }

  async run(sql, args) {
    if (sql.includes('INSERT INTO push_log')) {
      this.pushLog.push(args);
      return { success: true };
    }
    if (sql.includes('SET next_attempt_at = ?1, updated_at = ?2 WHERE id = ?3')) {
      const [nextAttemptAt, updatedAt, id] = args;
      Object.assign(this.reminders.get(id), { next_attempt_at: nextAttemptAt, updated_at: updatedAt });
      return { success: true };
    }
    if (sql.includes('SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3')) {
      const [sendCount, lastSentAt, nextAttemptAt, id] = args;
      Object.assign(this.reminders.get(id), {
        send_count: sendCount,
        last_sent_at: lastSentAt,
        next_attempt_at: nextAttemptAt,
        updated_at: lastSentAt,
      });
      return { success: true };
    }
    if (sql.includes("SET status = 'missed'")) {
      const [sendCount, lastSentAt, id] = args;
      Object.assign(this.reminders.get(id), {
        status: 'missed',
        send_count: sendCount,
        last_sent_at: lastSentAt,
        updated_at: lastSentAt,
      });
      return { success: true };
    }
    if (sql.includes("SET status = 'cancelled'")) {
      const [updatedAt, id] = args;
      Object.assign(this.reminders.get(id), { status: 'cancelled', updated_at: updatedAt });
      return { success: true };
    }
    return { success: true };
  }
}

function withFixedNow(now, fn) {
  const originalNow = Date.now;
  Date.now = () => now;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Date.now = originalNow;
    });
}

test('scheduler delivers Telegram-only reminders when VAPID is missing', async () => {
  const now = 1_764_156_000_000;
  const db = new FakeDB({
    reminders: [{
      id: 'r1',
      user_id: 'u1',
      title: 'Pay bill',
      note: '',
      fire_at: now - 1_000,
      repeat: 'none',
      tone: 'friendly',
      status: 'active',
      send_count: 0,
      next_attempt_at: now - 1_000,
      updated_at: now - 10_000,
    }],
    users: [{ id: 'u1', lang: 'en', news_categories: '[]' }],
    telegramLinks: [{ user_id: 'u1', chat_id: 123 }],
  });
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await withFixedNow(now, () => __test.runScheduler({ DB: db, TELEGRAM_BOT_TOKEN: 'token' }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  const row = db.reminders.get('r1');
  assert.equal(row.send_count, 1);
  assert.equal(row.last_sent_at, now);
  assert.equal(row.next_attempt_at, now + 2 * 60_000);
});

test('scheduler backs off due reminders when no delivery channel exists', async () => {
  const now = 1_764_156_000_000;
  const db = new FakeDB({
    reminders: [{
      id: 'r2',
      user_id: 'u1',
      title: 'No channel',
      note: '',
      fire_at: now - 1_000,
      repeat: 'none',
      tone: 'friendly',
      status: 'active',
      send_count: 0,
      next_attempt_at: now - 1_000,
      updated_at: now - 10_000,
    }],
    users: [{ id: 'u1', lang: 'en', news_categories: '[]' }],
  });

  await withFixedNow(now, () => __test.runScheduler({ DB: db }));

  const row = db.reminders.get('r2');
  assert.equal(row.send_count, 0);
  assert.equal(row.last_sent_at, undefined);
  assert.equal(row.next_attempt_at, now + 60 * 60_000);
});
