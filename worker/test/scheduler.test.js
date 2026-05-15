import test from 'node:test';
import assert from 'node:assert/strict';

import { __test } from '../src/index.js';

const NOW = 1_700_000_000_000;

function reminder(overrides = {}) {
  return {
    id: 'rem-1',
    user_id: 'user-1',
    title: 'Pay rent',
    note: '',
    fire_at: NOW - 60_000,
    repeat: 'none',
    tone: 'friendly',
    send_count: 0,
    next_attempt_at: NOW,
    updated_at: NOW - 60_000,
    ...overrides,
  };
}

function createEnv({ devices = [], chats = [{ chat_id: 12345 }], telegramToken = 'tg-token' } = {}) {
  const updates = [];

  const env = {
    TELEGRAM_BOT_TOKEN: telegramToken,
    ENABLE_AI_GENERATION: 'false',
    DB: {
      prepare(sql) {
        const statement = {
          bound: [],
          bind(...args) {
            this.bound = args;
            return this;
          },
          async all() {
            if (sql.includes('FROM devices WHERE user_id')) {
              return { results: devices };
            }
            if (sql.includes('FROM telegram_links WHERE user_id')) {
              return { results: chats };
            }
            throw new Error(`Unexpected all() query: ${sql}`);
          },
          async first() {
            if (sql.includes('COUNT(*) AS c FROM reminders')) {
              return { c: 1 };
            }
            if (sql.includes('SELECT lang, news_categories FROM users')) {
              return { lang: 'en', news_categories: '[]' };
            }
            if (sql.includes('SELECT lang FROM users')) {
              return { lang: 'en' };
            }
            throw new Error(`Unexpected first() query: ${sql}`);
          },
          async run() {
            if (sql.includes('SET send_count = ?1')) {
              updates.push({ type: 'advance', args: this.bound });
              return { success: true };
            }
            if (sql.includes('SET next_attempt_at = ?1')) {
              updates.push({ type: 'backoff', args: this.bound });
              return { success: true };
            }
            if (sql.includes('SET status =')) {
              updates.push({ type: 'status', args: this.bound });
              return { success: true };
            }
            throw new Error(`Unexpected run() query: ${sql}`);
          },
        };
        return statement;
      },
    },
  };

  return { env, updates };
}

test('processOneReminder advances schedule after Telegram delivery without Web Push devices', async (t) => {
  const fetchCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    fetchCalls.push({ url, body: JSON.parse(init.body) });
    return { json: async () => ({ ok: true }) };
  });

  const { env, updates } = createEnv({ devices: [] });

  await __test.processOneReminder(env, reminder(), null, NOW);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.chat_id, 12345);
  assert.deepEqual(updates, [
    { type: 'advance', args: [1, NOW, NOW + 2 * 60_000, 'rem-1'] },
  ]);
});

test('processOneReminder backs off when no Web Push devices or Telegram chats can receive', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called without Telegram chats');
  });

  const { env, updates } = createEnv({ devices: [], chats: [] });

  await __test.processOneReminder(env, reminder(), null, NOW);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(updates, [
    { type: 'backoff', args: [NOW + 60 * 60_000, NOW, 'rem-1'] },
  ]);
});
