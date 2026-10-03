import assert from 'node:assert/strict';
import test from 'node:test';

import { processOneReminder } from '../src/index.js';

function makeDb({ devices = [], chats = [], user = { lang: 'en', news_categories: '[]' }, pendingCount = 1 }) {
  const runs = [];
  return {
    runs,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              if (sql.includes('FROM devices')) return { results: devices };
              if (sql.includes('FROM telegram_links')) return { results: chats };
              return { results: [] };
            },
            async first() {
              if (sql.includes('SELECT lang, news_categories FROM users')) return user;
              if (sql.includes('SELECT lang FROM users')) return { lang: user.lang || 'en' };
              if (sql.includes('COUNT(*) AS c FROM reminders')) return { c: pendingCount };
              return null;
            },
            async run() {
              runs.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('scheduler advances a Telegram-only reminder after a successful Telegram send', async (t) => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  globalThis.fetch = async (_url, init) => {
    telegramCalls.push(JSON.parse(init.body));
    return { json: async () => ({ ok: true }) };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const db = makeDb({ chats: [{ chat_id: 12345 }] });
  const now = 1_700_000_000_000;
  await processOneReminder(
    { DB: db, TELEGRAM_BOT_TOKEN: 'token' },
    {
      id: 'rem-1',
      user_id: 'user-1',
      title: 'Pay bill',
      note: '',
      tone: 'friendly',
      fire_at: now,
      send_count: 0,
      next_attempt_at: now,
      updated_at: now,
      repeat: 'none',
    },
    { privateKey: 'unused', publicKey: 'unused', subject: 'unused' },
    now,
  );

  assert.equal(telegramCalls.length, 1);
  const progressUpdate = db.runs.find((run) => run.sql.includes('SET send_count = ?1'));
  assert.ok(progressUpdate, 'expected scheduler progress to be persisted');
  assert.deepEqual(progressUpdate.args, [1, now, now + 2 * 60_000, 'rem-1']);
  assert.equal(
    db.runs.some((run) => run.sql.includes('UPDATE reminders SET next_attempt_at = ?1')),
    false,
    'successful Telegram delivery should not be treated as no available channel',
  );
});
