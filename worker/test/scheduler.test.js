import assert from 'node:assert/strict';
import test from 'node:test';

import { __test } from '../src/index.js';

const NOW = 1_700_000_000_000;

function makeReminder(overrides = {}) {
  return {
    id: 'rem-1',
    user_id: 'user-1',
    title: 'Take meds',
    note: '',
    fire_at: NOW - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    next_attempt_at: NOW - 1_000,
    updated_at: NOW - 2_000,
    ...overrides,
  };
}

function makeEnv({ devices = [], user = { lang: 'ru', news_categories: '[]' }, telegram = true } = {}) {
  const runs = [];
  const allCalls = [];
  const firstCalls = [];

  const env = {
    TELEGRAM_BOT_TOKEN: telegram ? 'token' : '',
    DB: {
      prepare(sql) {
        const stmt = {
          sql,
          args: [],
          bind(...args) {
            this.args = args;
            return this;
          },
          async all() {
            allCalls.push({ sql, args: this.args });
            if (sql.includes('FROM devices')) return { results: devices };
            return { results: [] };
          },
          async first() {
            firstCalls.push({ sql, args: this.args });
            if (sql.includes('COUNT(*) AS c')) return { c: 0 };
            if (sql.includes('FROM users')) return user;
            return null;
          },
          async run() {
            runs.push({ sql, args: this.args });
            return { success: true };
          },
        };
        return stmt;
      },
    },
    _runs: runs,
    _allCalls: allCalls,
    _firstCalls: firstCalls,
  };

  return env;
}

function makeDeps({ tgSent = 0, pushResult = { ok: true, status: 201, body: '' } } = {}) {
  const calls = { tg: 0, push: 0 };
  return {
    calls,
    async buildPushBody() {
      return { text: 'body text', newsLine: null };
    },
    async tgSendReminderToUser() {
      calls.tg++;
      return { sent: tgSent, failed: 0 };
    },
    async sendWebPush() {
      calls.push++;
      return pushResult;
    },
  };
}

test('Telegram-only delivery advances reminder attempts without Web Push devices', async () => {
  const env = makeEnv({ devices: [] });
  const deps = makeDeps({ tgSent: 1 });

  await __test.processOneReminder(env, makeReminder(), null, NOW, deps);

  assert.equal(deps.calls.tg, 1);
  assert.equal(deps.calls.push, 0);
  assert.ok(env._runs.some((r) => r.sql.includes('SET send_count = ?1')));
  const update = env._runs.find((r) => r.sql.includes('SET send_count = ?1'));
  assert.deepEqual(update.args, [1, NOW, NOW + 2 * 60_000, 'rem-1']);
});

test('missing VAPID does not block successful Telegram delivery for users with devices', async () => {
  const env = makeEnv({ devices: [{ id: 'dev-1', endpoint: 'e', p256dh: 'p', auth: 'a' }] });
  const deps = makeDeps({ tgSent: 1 });

  await __test.processOneReminder(env, makeReminder(), null, NOW, deps);

  assert.equal(deps.calls.tg, 1);
  assert.equal(deps.calls.push, 0);
  assert.ok(env._runs.some((r) => r.sql.includes('SET send_count = ?1')));
});

test('Telegram success counts even when all push endpoints transiently fail', async () => {
  const env = makeEnv({ devices: [{ id: 'dev-1', endpoint: 'e', p256dh: 'p', auth: 'a' }] });
  const deps = makeDeps({ tgSent: 1, pushResult: { ok: false, gone: false, status: 503, body: 'unavailable' } });

  await __test.processOneReminder(env, makeReminder(), { privateKey: 'k', publicKey: 'p', subject: 'mailto:a@b.c' }, NOW, deps);

  assert.equal(deps.calls.tg, 1);
  assert.equal(deps.calls.push, 1);
  assert.ok(env._runs.some((r) => r.sql.includes('INSERT INTO push_log')));
  assert.ok(env._runs.some((r) => r.sql.includes('SET send_count = ?1')));
});

test('reminders with no working channel back off instead of staying due every minute', async () => {
  const env = makeEnv({ devices: [], telegram: false });
  const deps = makeDeps();

  await __test.processOneReminder(env, makeReminder(), null, NOW, deps);

  const update = env._runs.find((r) => r.sql.includes('SET next_attempt_at = ?1'));
  assert.ok(update);
  assert.deepEqual(update.args, [NOW + 60 * 60_000, NOW, 'rem-1']);
});
