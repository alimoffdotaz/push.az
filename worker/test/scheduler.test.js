import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';

function createSchedulerDb({ reminders, users = {}, devices = {}, telegramLinks = [] }) {
  const pushLog = [];

  function stmt(sql) {
    return {
      bind(...args) {
        return {
          async all() {
            if (sql.includes('FROM reminders') && sql.includes("status = 'active'")) {
              const now = args[0];
              return {
                results: reminders.filter(
                  (r) => r.status === 'active' && r.next_attempt_at <= now && r.user_id != null,
                ),
              };
            }
            if (sql.includes('FROM devices')) {
              return { results: devices[args[0]] || [] };
            }
            if (sql.includes('FROM telegram_links')) {
              return { results: telegramLinks.filter((l) => l.user_id === args[0]) };
            }
            throw new Error('Unhandled all SQL: ' + sql);
          },
          async first() {
            if (sql.includes('COUNT(*) AS c FROM reminders')) {
              const [userId, now] = args;
              const c = reminders.filter(
                (r) =>
                  r.user_id === userId &&
                  r.acked_at == null &&
                  (r.status === 'missed' || (r.status === 'active' && r.fire_at <= now)),
              ).length;
              return { c };
            }
            if (sql.includes('SELECT lang, news_categories FROM users')) {
              return users[args[0]] || null;
            }
            throw new Error('Unhandled first SQL: ' + sql);
          },
          async run() {
            if (sql.includes('UPDATE reminders SET next_attempt_at = ?1')) {
              const [nextAttemptAt, updatedAt, id] = args;
              const r = reminders.find((x) => x.id === id);
              if (r) {
                r.next_attempt_at = nextAttemptAt;
                r.updated_at = updatedAt;
              }
              return { success: true };
            }
            if (sql.includes('SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3')) {
              const [sendCount, lastSentAt, nextAttemptAt, id] = args;
              const r = reminders.find((x) => x.id === id);
              if (r) {
                r.send_count = sendCount;
                r.last_sent_at = lastSentAt;
                r.next_attempt_at = nextAttemptAt;
                r.updated_at = lastSentAt;
              }
              return { success: true };
            }
            if (sql.includes('INSERT INTO push_log')) {
              pushLog.push(args);
              return { success: true };
            }
            if (sql.includes('UPDATE devices SET revoked_at')) {
              return { success: true };
            }
            throw new Error('Unhandled run SQL: ' + sql);
          },
        };
      },
    };
  }

  return {
    pushLog,
    prepare: stmt,
  };
}

async function runScheduled(env) {
  let scheduledPromise;
  worker.scheduled({}, env, { waitUntil: (p) => { scheduledPromise = p; } });
  await scheduledPromise;
}

test('scheduler delivers Telegram reminders when VAPID is missing', async (t) => {
  const now = 1_700_000_000_000;
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  });

  const reminder = {
    id: 'r1',
    user_id: 'u1',
    title: 'Take medicine',
    note: '',
    fire_at: now - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    next_attempt_at: now - 1_000,
    updated_at: now - 2_000,
  };
  const db = createSchedulerDb({
    reminders: [reminder],
    users: { u1: { lang: 'en', news_categories: '[]' } },
    telegramLinks: [{ user_id: 'u1', chat_id: 42 }],
  });

  const tgCalls = [];
  globalThis.fetch = async (_url, init) => {
    tgCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await runScheduled({ DB: db, TELEGRAM_BOT_TOKEN: 'token' });

  assert.equal(tgCalls.length, 1);
  assert.equal(tgCalls[0].chat_id, 42);
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.last_sent_at, now);
  assert.ok(reminder.next_attempt_at > now);
});

test('scheduler backs off when no delivery channel is available', async (t) => {
  const now = 1_700_000_100_000;
  const originalNow = Date.now;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  const reminder = {
    id: 'r2',
    user_id: 'u1',
    title: 'Stand up',
    note: '',
    fire_at: now - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    next_attempt_at: now - 1_000,
    updated_at: now - 2_000,
  };
  const db = createSchedulerDb({
    reminders: [reminder],
    users: { u1: { lang: 'en', news_categories: '[]' } },
  });

  await runScheduled({ DB: db });

  assert.equal(reminder.send_count, 0);
  assert.equal(reminder.next_attempt_at, now + 60 * 60_000);
});
