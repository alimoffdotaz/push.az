import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';

const NOW = 1_700_000_000_000;

class FakeD1 {
  constructor({ users = [], reminders = [], devices = [], telegramLinks = [] } = {}) {
    this.users = users;
    this.reminders = reminders;
    this.devices = devices;
    this.telegramLinks = telegramLinks;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async all() {
    const [a0] = this.args;
    if (this.sql.includes('SELECT * FROM reminders') && this.sql.includes("status = 'active'")) {
      const cutoff = a0;
      return {
        results: this.db.reminders
          .filter((r) => r.status === 'active' && r.next_attempt_at <= cutoff && r.user_id != null)
          .slice(0, 200),
      };
    }
    if (this.sql.includes('SELECT * FROM devices WHERE user_id = ?1')) {
      const userId = a0;
      return { results: this.db.devices.filter((d) => d.user_id === userId && d.revoked_at == null) };
    }
    if (this.sql.includes('SELECT chat_id FROM telegram_links WHERE user_id = ?1')) {
      const userId = a0;
      return { results: this.db.telegramLinks.filter((l) => l.user_id === userId).map(({ chat_id }) => ({ chat_id })) };
    }
    throw new Error(`Unhandled all() SQL: ${this.sql}`);
  }

  async first() {
    const [a0] = this.args;
    if (this.sql.includes('SELECT lang, news_categories FROM users WHERE id = ?1')) {
      return this.db.users.find((u) => u.id === a0) || null;
    }
    if (this.sql.includes('SELECT COUNT(*) AS c FROM reminders')) {
      const [userId, cutoff] = this.args;
      const c = this.db.reminders.filter(
        (r) =>
          r.user_id === userId &&
          r.acked_at == null &&
          (r.status === 'missed' || (r.status === 'active' && r.fire_at <= cutoff)),
      ).length;
      return { c };
    }
    throw new Error(`Unhandled first() SQL: ${this.sql}`);
  }

  async run() {
    if (this.sql.includes('UPDATE reminders SET next_attempt_at = ?1, updated_at = ?2 WHERE id = ?3')) {
      const [nextAttemptAt, updatedAt, id] = this.args;
      const r = this.db.reminders.find((row) => row.id === id);
      if (r) {
        r.next_attempt_at = nextAttemptAt;
        r.updated_at = updatedAt;
      }
      return { success: true };
    }
    if (this.sql.includes('SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3')) {
      const [sendCount, lastSentAt, nextAttemptAt, id] = this.args;
      const r = this.db.reminders.find((row) => row.id === id);
      if (r) {
        r.send_count = sendCount;
        r.last_sent_at = lastSentAt;
        r.next_attempt_at = nextAttemptAt;
        r.updated_at = lastSentAt;
      }
      return { success: true };
    }
    if (this.sql.includes("SET status = 'missed', send_count = ?1")) {
      const [sendCount, lastSentAt, id] = this.args;
      const r = this.db.reminders.find((row) => row.id === id);
      if (r) {
        r.status = 'missed';
        r.send_count = sendCount;
        r.last_sent_at = lastSentAt;
        r.updated_at = lastSentAt;
      }
      return { success: true };
    }
    throw new Error(`Unhandled run() SQL: ${this.sql}`);
  }
}

function makeReminder(overrides = {}) {
  return {
    id: 'rem-1',
    user_id: 'user-1',
    device_id: 'dev-1',
    title: 'Take medicine',
    note: '',
    fire_at: NOW - 60_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    last_sent_at: null,
    next_attempt_at: NOW - 60_000,
    acked_at: null,
    created_at: NOW - 120_000,
    updated_at: NOW - 120_000,
    ...overrides,
  };
}

async function runScheduled(env) {
  const pending = [];
  await worker.scheduled({}, env, {
    waitUntil(promise) {
      pending.push(promise);
    },
  });
  await Promise.all(pending);
}

async function withFrozenRuntime(fn) {
  const realNow = Date.now;
  const realFetch = globalThis.fetch;
  const fetchCalls = [];
  Date.now = () => NOW;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init, payload: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 123 } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await fn(fetchCalls);
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
  }
}

test('scheduler delivers Telegram-only reminders even when VAPID is missing', async () => {
  await withFrozenRuntime(async (fetchCalls) => {
    const reminder = makeReminder();
    const env = {
      TELEGRAM_BOT_TOKEN: 'test-token',
      DB: new FakeD1({
        users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
        reminders: [reminder],
        telegramLinks: [{ user_id: 'user-1', chat_id: 42 }],
      }),
    };

    await runScheduled(env);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].payload.chat_id, 42);
    assert.equal(reminder.send_count, 1);
    assert.equal(reminder.last_sent_at, NOW);
    assert.equal(reminder.next_attempt_at, NOW + 2 * 60_000);
  });
});

test('scheduler counts Telegram success as progress when Web Push is disabled', async () => {
  await withFrozenRuntime(async (fetchCalls) => {
    const reminder = makeReminder();
    const env = {
      TELEGRAM_BOT_TOKEN: 'test-token',
      DB: new FakeD1({
        users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
        reminders: [reminder],
        devices: [{ id: 'dev-1', user_id: 'user-1', endpoint: 'https://push.example/send', p256dh: 'p', auth: 'a' }],
        telegramLinks: [{ user_id: 'user-1', chat_id: 42 }],
      }),
    };

    await runScheduled(env);

    assert.equal(fetchCalls.length, 1);
    assert.equal(reminder.send_count, 1);
    assert.equal(reminder.last_sent_at, NOW);
    assert.equal(reminder.next_attempt_at, NOW + 2 * 60_000);
  });
});

test('scheduler backs off when no delivery channel is available', async () => {
  await withFrozenRuntime(async (fetchCalls) => {
    const reminder = makeReminder();
    const env = {
      DB: new FakeD1({
        users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
        reminders: [reminder],
      }),
    };

    await runScheduled(env);

    assert.equal(fetchCalls.length, 0);
    assert.equal(reminder.send_count, 0);
    assert.equal(reminder.last_sent_at, null);
    assert.equal(reminder.next_attempt_at, NOW + 60 * 60_000);
  });
});
