import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { runScheduler } from '../src/index.js';

const originalFetch = global.fetch;

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
    const sql = this.sql;
    if (sql.includes('FROM reminders') && sql.includes("status = 'active'")) {
      const now = this.args[0];
      return {
        results: this.db.reminders.filter(
          (r) => r.status === 'active' && r.next_attempt_at <= now && r.user_id != null,
        ),
      };
    }
    if (sql.includes('FROM devices')) {
      const userId = this.args[0];
      return { results: this.db.devices.filter((d) => d.user_id === userId && d.revoked_at == null) };
    }
    if (sql.includes('FROM telegram_links')) {
      const userId = this.args[0];
      return { results: this.db.telegramLinks.filter((l) => l.user_id === userId) };
    }
    return { results: [] };
  }

  async first() {
    const sql = this.sql;
    if (sql.includes('COUNT(*) AS c FROM reminders')) {
      const userId = this.args[0];
      const now = this.args[1];
      return {
        c: this.db.reminders.filter(
          (r) =>
            r.user_id === userId &&
            r.acked_at == null &&
            (r.status === 'missed' || (r.status === 'active' && r.fire_at <= now)),
        ).length,
      };
    }
    if (sql.includes('SELECT lang, news_categories FROM users')) {
      const user = this.db.users.get(this.args[0]);
      return user ? { lang: user.lang, news_categories: user.news_categories } : null;
    }
    if (sql.includes('SELECT lang FROM users')) {
      const user = this.db.users.get(this.args[0]);
      return user ? { lang: user.lang } : null;
    }
    return null;
  }

  async run() {
    const sql = this.sql;
    if (sql.includes('UPDATE reminders') && sql.includes('SET send_count = ?1')) {
      const [sendCount, now, nextAttemptAt, id] = this.args;
      const reminder = this.db.reminders.find((r) => r.id === id);
      Object.assign(reminder, {
        send_count: sendCount,
        last_sent_at: now,
        next_attempt_at: nextAttemptAt,
        updated_at: now,
      });
    } else if (sql.includes('UPDATE reminders SET next_attempt_at = ?1')) {
      const [nextAttemptAt, now, id] = this.args;
      const reminder = this.db.reminders.find((r) => r.id === id);
      Object.assign(reminder, { next_attempt_at: nextAttemptAt, updated_at: now });
    }
    return { success: true };
  }
}

function makeEnv(db) {
  return {
    DB: {
      prepare(sql) {
        return new FakeStatement(db, sql);
      },
    },
    TELEGRAM_BOT_TOKEN: 'tg-token',
    VAPID_PRIVATE_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    VAPID_PUBLIC_KEY: 'BAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
}

afterEach(() => {
  global.fetch = originalFetch;
});

test('scheduler delivers and advances Telegram-only reminders without Web Push devices', async () => {
  const now = Date.now();
  const reminder = {
    id: 'rem-1',
    user_id: 'user-1',
    device_id: 'device-1',
    title: 'Pay bill',
    note: '',
    fire_at: now - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    next_attempt_at: now - 1_000,
    updated_at: now - 2_000,
    acked_at: null,
  };
  const db = {
    reminders: [reminder],
    devices: [],
    telegramLinks: [{ chat_id: 12345, user_id: 'user-1' }],
    users: new Map([['user-1', { lang: 'en', news_categories: '[]' }]]),
  };

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true };
      },
    };
  };

  await runScheduler(makeEnv(db));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/bottg-token/sendMessage');
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.last_sent_at > now - 1_000, true);
  assert.equal(reminder.next_attempt_at > reminder.last_sent_at, true);
});
