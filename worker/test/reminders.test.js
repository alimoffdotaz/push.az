import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../src/index.js';

class D1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      bind: (...params) => ({
        run: () => stmt.run(...params),
        first: () => stmt.get(...params) || null,
        all: () => ({ results: stmt.all(...params) }),
      }),
    };
  }
}

function createEnv(extra = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    DB: new D1Database(sqlite),
    ALLOWED_ORIGIN: '*',
    ...extra,
    sqlite,
  };
}

function seedUser(sqlite, { withActiveDevice = true } = {}) {
  const now = Date.now();
  sqlite.prepare(
    `INSERT INTO users (id, display_name, created_at, last_login_at, lang, news_categories)
     VALUES ('user1', 'User', ?1, ?1, 'en', '[]')`,
  ).run(now);
  sqlite.prepare(
    `INSERT INTO devices (id, user_id, endpoint, p256dh, auth, created_at, last_seen_at, revoked_at)
     VALUES ('dev1', 'user1', 'https://push.example/dev1', 'p256dh', 'auth', ?1, ?1, ?2)`,
  ).run(now, withActiveDevice ? null : now);
  sqlite.prepare(
    `INSERT INTO sessions (id, user_id, device_id, user_agent, created_at, expires_at)
     VALUES ('tok1', 'user1', 'dev1', 'test', ?1, ?2)`,
  ).run(now, now + 90 * 24 * 60 * 60_000);
}

function getReminder(sqlite, id = 'r1') {
  return sqlite.prepare(`SELECT * FROM reminders WHERE id = ?1`).get(id);
}

async function postReminder(env, body) {
  return worker.fetch(new Request('https://worker.example/api/reminders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer tok1',
      'Content-Type': 'application/json',
      'X-Device-Id': 'dev1',
    },
    body: JSON.stringify(body),
  }), env, { waitUntil() {} });
}

test('routine reminder upsert preserves delivery state when schedule is unchanged', async () => {
  const env = createEnv();
  seedUser(env.sqlite);
  env.sqlite.prepare(
    `INSERT INTO reminders
       (id, user_id, device_id, title, note, fire_at, repeat, tone, status, send_count, last_sent_at, next_attempt_at, acked_at, created_at, updated_at)
     VALUES ('r1', 'user1', 'dev1', 'Pay bill', '', 1000, 'none', 'friendly', 'missed', 5, 2000, 3000, NULL, 1, 4000)`,
  ).run();

  const res = await postReminder(env, {
    id: 'r1',
    title: 'Pay bill',
    note: '',
    fireAt: 1000,
    repeat: 'none',
    tone: 'friendly',
  });

  assert.equal(res.status, 200);
  assert.deepEqual(
    {
      status: getReminder(env.sqlite).status,
      send_count: getReminder(env.sqlite).send_count,
      last_sent_at: getReminder(env.sqlite).last_sent_at,
      next_attempt_at: getReminder(env.sqlite).next_attempt_at,
    },
    {
      status: 'missed',
      send_count: 5,
      last_sent_at: 2000,
      next_attempt_at: 3000,
    },
  );
});

test('reminder upsert resets delivery state when schedule changes', async () => {
  const env = createEnv();
  seedUser(env.sqlite);
  env.sqlite.prepare(
    `INSERT INTO reminders
       (id, user_id, device_id, title, note, fire_at, repeat, tone, status, send_count, last_sent_at, next_attempt_at, acked_at, created_at, updated_at)
     VALUES ('r1', 'user1', 'dev1', 'Pay bill', '', 1000, 'none', 'friendly', 'missed', 5, 2000, 3000, 2500, 1, 4000)`,
  ).run();

  const res = await postReminder(env, {
    id: 'r1',
    title: 'Pay bill',
    note: '',
    fireAt: 5000,
    repeat: 'none',
    tone: 'friendly',
  });

  assert.equal(res.status, 200);
  const row = getReminder(env.sqlite);
  assert.equal(row.status, 'active');
  assert.equal(row.send_count, 0);
  assert.equal(row.last_sent_at, null);
  assert.equal(row.next_attempt_at, 5000);
  assert.equal(row.acked_at, null);
});

test('scheduler counts Telegram delivery even when Web Push is unavailable', async (t) => {
  const env = createEnv({ TELEGRAM_BOT_TOKEN: 'token' });
  seedUser(env.sqlite, { withActiveDevice: false });
  const now = Date.now();
  env.sqlite.prepare(
    `INSERT INTO telegram_links (chat_id, user_id, username, first_name, linked_at, last_msg_at)
     VALUES (12345, 'user1', 'test', 'Test', ?1, NULL)`,
  ).run(now);
  env.sqlite.prepare(
    `INSERT INTO reminders
       (id, user_id, device_id, title, note, fire_at, repeat, tone, status, send_count, last_sent_at, next_attempt_at, acked_at, created_at, updated_at)
     VALUES ('r1', 'user1', 'dev1', 'Pay bill', '', ?1, 'none', 'friendly', 'active', 0, NULL, ?2, NULL, ?1, ?1)`,
  ).run(now - 60_000, now - 1000);

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const waits = [];
  await worker.scheduled({}, env, { waitUntil: (promise) => waits.push(promise) });
  await Promise.all(waits);

  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /\/bottoken\/sendMessage$/);
  const row = getReminder(env.sqlite);
  assert.equal(row.status, 'active');
  assert.equal(row.send_count, 1);
  assert.ok(row.last_sent_at >= now);
  assert.ok(row.next_attempt_at > now);
});
