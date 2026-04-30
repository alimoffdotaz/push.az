import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';

function createStatement(sql, state) {
  return {
    bind(...args) {
      return {
        async all() {
          if (sql.includes('FROM reminders') && sql.includes('LIMIT 200')) {
            return { results: state.reminders };
          }
          if (sql.includes('FROM devices')) {
            return { results: state.devices };
          }
          if (sql.includes('FROM telegram_links')) {
            return { results: state.telegramLinks };
          }
          return { results: [] };
        },
        async first() {
          if (sql.includes('SELECT lang, news_categories FROM users')) {
            return { lang: 'en', news_categories: '[]' };
          }
          if (sql.includes('SELECT COUNT(*) AS c FROM reminders')) {
            return { c: 1 };
          }
          if (sql.includes('SELECT lang FROM users')) {
            return { lang: 'en' };
          }
          return null;
        },
        async run() {
          state.updates.push({ sql, args });
          return { success: true };
        },
      };
    },
  };
}

test('scheduled reminders are sent to Telegram even without active web push devices', async () => {
  const now = 1_700_000_000_000;
  const originalDateNow = Date.now;
  const originalFetch = globalThis.fetch;

  Date.now = () => now;

  const state = {
    reminders: [
      {
        id: 'rem-1',
        user_id: 'user-1',
        title: 'Pay rent',
        note: '',
        tone: 'friendly',
        fire_at: now,
        next_attempt_at: now,
        send_count: 0,
        repeat: 'none',
        updated_at: now - 1000,
      },
    ],
    devices: [],
    telegramLinks: [{ chat_id: 12345 }],
    updates: [],
  };

  const telegramCalls = [];
  globalThis.fetch = async (url, init) => {
    telegramCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  let scheduledPromise = null;

  try {
    await worker.scheduled(
      {},
      {
        VAPID_PRIVATE_KEY: 'present',
        VAPID_PUBLIC_KEY: 'present',
        VAPID_SUBJECT: 'mailto:test@example.com',
        TELEGRAM_BOT_TOKEN: 'token',
        ENABLE_AI_GENERATION: 'false',
        DB: {
          prepare(sql) {
            return createStatement(sql, state);
          },
        },
      },
      {
        waitUntil(promise) {
          scheduledPromise = promise;
        },
      },
    );
    await scheduledPromise;
  } finally {
    Date.now = originalDateNow;
    globalThis.fetch = originalFetch;
  }

  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].body.chat_id, 12345);
  assert.match(telegramCalls[0].body.text, /Pay rent/);

  const deliveryUpdate = state.updates.find((u) => u.sql.includes('SET send_count = ?1'));
  assert.ok(deliveryUpdate, 'telegram-only delivery should advance reminder send_count');
  assert.deepEqual(deliveryUpdate.args, [1, now, now + 2 * 60_000, 'rem-1']);

  const noChannelRetry = state.updates.find((u) => u.sql.includes('SET next_attempt_at = ?1, updated_at = ?2'));
  assert.equal(noChannelRetry, undefined, 'telegram delivery should not use no-channel hourly retry');
});
