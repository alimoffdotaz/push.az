import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const sql = this.sql;
    if (sql.includes('FROM sessions s JOIN users u')) {
      const [token, now] = this.args;
      const s = this.db.sessions.find((row) => row.id === token && row.expires_at > now);
      if (!s) return null;
      const u = this.db.users.find((row) => row.id === s.user_id);
      if (!u) return null;
      return { ...s, user_display_name: u.display_name, user_lang: u.lang };
    }
    if (sql.includes('SELECT user_id, fire_at, repeat, updated_at FROM reminders WHERE id = ?1')) {
      const [id] = this.args;
      const r = this.db.reminders.find((row) => row.id === id);
      return r ? pick(r, ['user_id', 'fire_at', 'repeat', 'updated_at']) : null;
    }
    if (sql.includes('SELECT lang, news_categories FROM users WHERE id = ?1')) {
      const [id] = this.args;
      const u = this.db.users.find((row) => row.id === id);
      return u ? pick(u, ['lang', 'news_categories']) : null;
    }
    if (sql.includes('SELECT lang FROM users WHERE id = ?1')) {
      const [id] = this.args;
      const u = this.db.users.find((row) => row.id === id);
      return u ? { lang: u.lang } : null;
    }
    if (sql.includes('SELECT COUNT(*) AS c FROM reminders')) {
      const [userId, now] = this.args;
      return {
        c: this.db.reminders.filter(
          (r) =>
            r.user_id === userId &&
            r.acked_at == null &&
            (r.status === 'missed' || (r.status === 'active' && r.fire_at <= now)),
        ).length,
      };
    }
    throw new Error('Unhandled first SQL: ' + sql);
  }

  async all() {
    const sql = this.sql;
    if (sql.includes("FROM reminders WHERE status = 'active'")) {
      const [now] = this.args;
      return {
        results: this.db.reminders.filter(
          (r) => r.status === 'active' && r.next_attempt_at <= now && r.user_id != null,
        ),
      };
    }
    if (sql.includes('SELECT * FROM devices WHERE user_id = ?1 AND revoked_at IS NULL')) {
      const [userId] = this.args;
      return { results: this.db.devices.filter((d) => d.user_id === userId && d.revoked_at == null) };
    }
    if (sql.includes('SELECT chat_id FROM telegram_links WHERE user_id = ?1')) {
      const [userId] = this.args;
      return { results: this.db.telegramLinks.filter((l) => l.user_id === userId).map((l) => ({ chat_id: l.chat_id })) };
    }
    throw new Error('Unhandled all SQL: ' + sql);
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('INSERT INTO reminders')) {
      const [id, userId, deviceId, title, note, fireAt, repeat, tone, now] = this.args;
      this.db.reminders.push({
        id,
        user_id: userId,
        device_id: deviceId,
        title,
        note,
        fire_at: fireAt,
        repeat,
        tone,
        status: 'active',
        send_count: 0,
        last_sent_at: null,
        next_attempt_at: fireAt,
        acked_at: null,
        created_at: now,
        updated_at: now,
      });
      return { success: true };
    }
    if (sql.startsWith('UPDATE reminders SET user_id = ?1')) {
      const [userId, title, note, fireAt, repeat, tone, now, id] = this.args;
      const r = this.mustReminder(id);
      Object.assign(r, {
        user_id: userId,
        title,
        note,
        fire_at: fireAt,
        repeat,
        tone,
        updated_at: now,
      });
      if (sql.includes("status = 'active'")) {
        Object.assign(r, {
          status: 'active',
          send_count: 0,
          last_sent_at: null,
          next_attempt_at: fireAt,
          acked_at: null,
        });
      }
      return { success: true };
    }
    if (sql.includes('SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3')) {
      const [sendCount, now, nextAttemptAt, id] = this.args;
      Object.assign(this.mustReminder(id), {
        send_count: sendCount,
        last_sent_at: now,
        next_attempt_at: nextAttemptAt,
        updated_at: now,
      });
      return { success: true };
    }
    if (sql.includes('UPDATE reminders SET next_attempt_at = ?1, updated_at = ?2 WHERE id = ?3')) {
      const [nextAttemptAt, now, id] = this.args;
      Object.assign(this.mustReminder(id), { next_attempt_at: nextAttemptAt, updated_at: now });
      return { success: true };
    }
    if (sql.includes("SET status = 'missed'")) {
      const [sendCount, now, id] = this.args;
      Object.assign(this.mustReminder(id), {
        status: 'missed',
        send_count: sendCount,
        last_sent_at: now,
        updated_at: now,
      });
      return { success: true };
    }
    if (sql.includes("SET status = 'cancelled'")) {
      const [now, id] = this.args;
      Object.assign(this.mustReminder(id), { status: 'cancelled', updated_at: now });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO push_log')) {
      this.db.pushLog.push(this.args);
      return { success: true };
    }
    if (sql.startsWith('UPDATE devices SET revoked_at')) {
      const [now, id] = this.args;
      const d = this.db.devices.find((row) => row.id === id);
      if (d) d.revoked_at = now;
      return { success: true };
    }
    throw new Error('Unhandled run SQL: ' + sql);
  }

  mustReminder(id) {
    const r = this.db.reminders.find((row) => row.id === id);
    if (!r) throw new Error('Missing reminder ' + id);
    return r;
  }
}

class MockDB {
  constructor() {
    this.users = [];
    this.sessions = [];
    this.reminders = [];
    this.devices = [];
    this.telegramLinks = [];
    this.pushLog = [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((key) => [key, obj[key]]));
}

function makeEnv() {
  const DB = new MockDB();
  DB.users.push({
    id: 'u1',
    display_name: 'User',
    lang: 'en',
    news_categories: '[]',
  });
  return {
    DB,
    TELEGRAM_BOT_TOKEN: 'test-token',
    ENABLE_AI_GENERATION: 'false',
  };
}

function addDueReminder(DB, overrides = {}) {
  DB.reminders.push({
    id: 'r1',
    user_id: 'u1',
    device_id: 'dev1',
    title: 'Pay rent',
    note: '',
    fire_at: 1,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    last_sent_at: null,
    next_attempt_at: 1,
    acked_at: null,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  });
}

async function runScheduled(env) {
  let scheduled;
  await worker.scheduled({}, env, {
    waitUntil(promise) {
      scheduled = promise;
    },
  });
  await scheduled;
}

test('scheduler sends Telegram-only reminders even when VAPID is missing', async (t) => {
  const env = makeEnv();
  env.DB.telegramLinks.push({ chat_id: 1001, user_id: 'u1' });
  addDueReminder(env.DB);

  const tgCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    tgCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: { message_id: 1 } });
  });

  await runScheduled(env);

  assert.equal(tgCalls.length, 1);
  assert.match(tgCalls[0].body.text, /Pay rent/);
  const reminder = env.DB.reminders[0];
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.status, 'active');
  assert.ok(reminder.last_sent_at > 0);
  assert.ok(reminder.next_attempt_at > reminder.last_sent_at);
});

test('scheduler counts Telegram delivery when the user has no Web Push devices', async (t) => {
  const env = makeEnv();
  env.VAPID_PRIVATE_KEY = 'private';
  env.VAPID_PUBLIC_KEY = 'public';
  env.VAPID_SUBJECT = 'mailto:test@example.com';
  env.DB.telegramLinks.push({ chat_id: 1002, user_id: 'u1' });
  addDueReminder(env.DB);

  const tgCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    tgCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: { message_id: 1 } });
  });

  await runScheduled(env);

  assert.equal(tgCalls.length, 1);
  assert.equal(env.DB.reminders[0].send_count, 1);
});

test('reminder upsert preserves delivery state when routine sync has not changed schedule', async () => {
  const env = makeEnv();
  env.DB.sessions.push({ id: 's1', user_id: 'u1', device_id: 'dev1', expires_at: Date.now() + 60_000 });
  addDueReminder(env.DB, {
    status: 'missed',
    send_count: 5,
    last_sent_at: 100,
    next_attempt_at: 200,
    updated_at: 5_000,
  });

  const res = await worker.fetch(
    new Request('https://worker.test/api/reminders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer s1',
        'Content-Type': 'application/json',
        'X-Device-Id': 'dev1',
      },
      body: JSON.stringify({
        id: 'r1',
        title: 'Pay rent updated',
        note: '',
        fireAt: 1,
        repeat: 'none',
        tone: 'friendly',
        updatedAt: 6_000,
      }),
    }),
    env,
    {},
  );

  assert.equal(res.status, 200);
  const reminder = env.DB.reminders[0];
  assert.equal(reminder.title, 'Pay rent updated');
  assert.equal(reminder.status, 'missed');
  assert.equal(reminder.send_count, 5);
  assert.equal(reminder.last_sent_at, 100);
  assert.equal(reminder.next_attempt_at, 200);
});

test('reminder upsert ignores stale client writes instead of rewinding server schedule', async () => {
  const env = makeEnv();
  env.DB.sessions.push({ id: 's1', user_id: 'u1', device_id: 'dev1', expires_at: Date.now() + 60_000 });
  addDueReminder(env.DB, {
    fire_at: 20_000,
    next_attempt_at: 20_000,
    updated_at: 7_000,
  });

  const res = await worker.fetch(
    new Request('https://worker.test/api/reminders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer s1',
        'Content-Type': 'application/json',
        'X-Device-Id': 'dev1',
      },
      body: JSON.stringify({
        id: 'r1',
        title: 'stale local copy',
        note: '',
        fireAt: 1,
        repeat: 'none',
        tone: 'friendly',
        updatedAt: 6_000,
      }),
    }),
    env,
    {},
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: 'r1', stale: true });
  const reminder = env.DB.reminders[0];
  assert.equal(reminder.title, 'Pay rent');
  assert.equal(reminder.fire_at, 20_000);
  assert.equal(reminder.next_attempt_at, 20_000);
});
