import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { processOneReminder } from '../src/index.js';

const reminder = {
  id: 'rem-1',
  user_id: 'user-1',
  title: 'Take medicine',
  note: '',
  tone: 'friendly',
  fire_at: 1000,
  next_attempt_at: 1000,
  send_count: 0,
  updated_at: 1000,
};

class FakeDB {
  constructor({ devices = [], telegramLinks = [] } = {}) {
    this.devices = devices;
    this.telegramLinks = telegramLinks;
    this.runs = [];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async all() {
            if (sql.includes('FROM devices')) return { results: db.devices };
            if (sql.includes('FROM telegram_links')) return { results: db.telegramLinks };
            return { results: [] };
          },
          async first() {
            if (sql.includes('SELECT lang, news_categories FROM users')) {
              return { lang: 'en', news_categories: null };
            }
            if (sql.includes('SELECT lang FROM users')) return { lang: 'en' };
            if (sql.includes('COUNT(*) AS c')) return { c: 1 };
            return null;
          },
          async run() {
            db.runs.push({ sql, args });
            return { success: true };
          },
        };
      },
    };
  }
}

afterEach(() => {
  delete globalThis.fetch;
});

test('telegram delivery advances reminder even when web push is unavailable', async () => {
  const db = new FakeDB({ telegramLinks: [{ chat_id: 42 }] });
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });

  await processOneReminder({ DB: db, TELEGRAM_BOT_TOKEN: 'token' }, reminder, null, 5000);

  assert.equal(db.runs.some((r) => r.sql.includes('SET send_count = ?1')), true);
  assert.equal(db.runs.some((r) => r.sql.includes('next_attempt_at = ?1, updated_at = ?2 WHERE id = ?3')), false);
});

test('scheduler backs off when no channel can receive the reminder', async () => {
  const db = new FakeDB();

  await processOneReminder({ DB: db, TELEGRAM_BOT_TOKEN: 'token' }, reminder, null, 5000);

  const backoff = db.runs.find((r) => r.sql.includes('next_attempt_at = ?1, updated_at = ?2 WHERE id = ?3'));
  assert.ok(backoff);
  assert.equal(backoff.args[0], 5000 + 60 * 60_000);
});
