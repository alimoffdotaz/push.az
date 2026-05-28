import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

class FakeStmt {
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
    const sql = this.sql;
    if (sql.startsWith('SELECT * FROM reminders WHERE status =')) {
      const now = this.args[0];
      return {
        results: this.db.reminders.filter(
          (r) => r.status === 'active' && r.next_attempt_at <= now && r.user_id != null,
        ),
      };
    }
    if (sql.startsWith('SELECT * FROM devices WHERE user_id =')) {
      const userId = this.args[0];
      return {
        results: this.db.devices.filter((d) => d.user_id === userId && d.revoked_at == null),
      };
    }
    if (sql.startsWith('SELECT chat_id FROM telegram_links WHERE user_id =')) {
      const userId = this.args[0];
      return { results: this.db.telegramLinks.filter((l) => l.user_id === userId) };
    }
    throw new Error('Unhandled all SQL: ' + sql);
  }

  async first() {
    const sql = this.sql;
    if (sql.startsWith('SELECT lang, news_categories FROM users WHERE id =')) {
      return this.db.users.find((u) => u.id === this.args[0]) || null;
    }
    if (sql.startsWith('SELECT lang FROM users WHERE id =')) {
      const u = this.db.users.find((row) => row.id === this.args[0]);
      return u ? { lang: u.lang } : null;
    }
    if (sql.startsWith('SELECT COUNT(*) AS c FROM reminders')) {
      const [userId, now] = this.args;
      const c = this.db.reminders.filter(
        (r) =>
          r.user_id === userId &&
          r.acked_at == null &&
          (r.status === 'missed' || (r.status === 'active' && r.fire_at <= now)),
      ).length;
      return { c };
    }
    if (sql.startsWith('SELECT s.*, u.display_name AS user_display_name')) {
      const [token, now] = this.args;
      const session = this.db.sessions.find((s) => s.id === token && s.expires_at > now);
      if (!session) return null;
      const user = this.db.users.find((u) => u.id === session.user_id);
      if (!user) return null;
      return {
        ...session,
        user_display_name: user.display_name,
        user_lang: user.lang,
      };
    }
    if (sql.startsWith('SELECT user_id, fire_at, repeat, status, send_count')) {
      return this.db.reminders.find((r) => r.id === this.args[0]) || null;
    }
    throw new Error('Unhandled first SQL: ' + sql);
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('UPDATE reminders SET next_attempt_at =')) {
      const [nextAttemptAt, updatedAt, id] = this.args;
      const r = this.db.reminders.find((row) => row.id === id);
      if (r) {
        r.next_attempt_at = nextAttemptAt;
        r.updated_at = updatedAt;
      }
      return { success: true };
    }
    if (sql.startsWith('UPDATE reminders SET send_count =')) {
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
    if (sql.startsWith('INSERT INTO reminders')) {
      const [
        id,
        userId,
        deviceId,
        title,
        note,
        fireAt,
        repeat,
        tone,
        now,
        nextStatus,
        nextSendCount,
        nextLastSentAt,
        nextAttemptAt,
        nextAckedAt,
      ] = this.args;
      const existing = this.db.reminders.find((r) => r.id === id);
      if (existing) {
        Object.assign(existing, {
          user_id: userId,
          title,
          note,
          fire_at: fireAt,
          repeat,
          tone,
          status: nextStatus,
          send_count: nextSendCount,
          last_sent_at: nextLastSentAt,
          next_attempt_at: nextAttemptAt,
          acked_at: nextAckedAt,
          updated_at: now,
        });
      } else {
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
          next_attempt_at: fireAt,
          created_at: now,
          updated_at: now,
        });
      }
      return { success: true };
    }
    throw new Error('Unhandled run SQL: ' + sql);
  }
}

class FakeDB {
  constructor(seed = {}) {
    this.reminders = seed.reminders || [];
    this.users = seed.users || [];
    this.devices = seed.devices || [];
    this.telegramLinks = seed.telegramLinks || [];
    this.sessions = seed.sessions || [];
  }

  prepare(sql) {
    return new FakeStmt(this, sql);
  }
}

async function runScheduled(env) {
  const waits = [];
  await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
}

test('scheduler sends Telegram and advances reminders without VAPID or web push devices', async (t) => {
  const now = 1_800_000_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => { globalThis.fetch = realFetch; });

  const reminder = {
    id: 'r1',
    user_id: 'u1',
    device_id: 'd1',
    title: 'Pay rent',
    note: '',
    fire_at: now - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    next_attempt_at: now - 1_000,
    acked_at: null,
    updated_at: now - 2_000,
  };
  const db = new FakeDB({
    reminders: [reminder],
    users: [{ id: 'u1', display_name: 'Me', lang: 'en', news_categories: '[]' }],
    telegramLinks: [{ user_id: 'u1', chat_id: 123 }],
  });

  await runScheduled({ DB: db, TELEGRAM_BOT_TOKEN: 'token' });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /sendMessage$/);
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.last_sent_at, now);
  assert.equal(reminder.next_attempt_at, now + 2 * 60_000);
});

test('scheduler backs off reminders with no usable delivery channel', async (t) => {
  const now = 1_800_000_100_000;
  const realNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });

  const reminder = {
    id: 'r2',
    user_id: 'u1',
    device_id: 'd1',
    title: 'Stand up',
    note: '',
    fire_at: now - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    next_attempt_at: now - 1_000,
    acked_at: null,
    updated_at: now - 2_000,
  };
  const db = new FakeDB({
    reminders: [reminder],
    users: [{ id: 'u1', display_name: 'Me', lang: 'en', news_categories: '[]' }],
  });

  await runScheduled({ DB: db });

  assert.equal(reminder.send_count, 0);
  assert.equal(reminder.last_sent_at, undefined);
  assert.equal(reminder.next_attempt_at, now + 60 * 60_000);
});

test('reminder upsert preserves delivery state when schedule did not change', async (t) => {
  const now = 1_800_000_200_000;
  const realNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });

  const reminder = {
    id: 'r3',
    user_id: 'u1',
    device_id: 'd1',
    title: 'Original title',
    note: '',
    fire_at: now - 10_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 3,
    last_sent_at: now - 5_000,
    next_attempt_at: now + 20_000,
    acked_at: null,
    created_at: now - 60_000,
    updated_at: now - 5_000,
  };
  const db = new FakeDB({
    reminders: [reminder],
    users: [{ id: 'u1', display_name: 'Me', lang: 'en', news_categories: '[]' }],
    sessions: [{ id: 'session-token', user_id: 'u1', device_id: 'd1', expires_at: now + 60_000 }],
  });

  const res = await worker.fetch(
    new Request('https://worker.test/api/reminders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer session-token',
        'Content-Type': 'application/json',
        'X-Device-Id': 'd1',
      },
      body: JSON.stringify({
        id: 'r3',
        title: 'Updated title',
        note: 'synced note',
        fireAt: reminder.fire_at,
        repeat: 'none',
        tone: 'urgent',
      }),
    }),
    { DB: db },
    {},
  );

  assert.equal(res.status, 200);
  assert.equal(reminder.title, 'Updated title');
  assert.equal(reminder.note, 'synced note');
  assert.equal(reminder.tone, 'urgent');
  assert.equal(reminder.send_count, 3);
  assert.equal(reminder.last_sent_at, now - 5_000);
  assert.equal(reminder.next_attempt_at, now + 20_000);
  assert.equal(reminder.status, 'active');
});
