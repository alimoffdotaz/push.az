import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';

import worker from '../src/index.js';

const FIXED_NOW = 1_700_000_000_000;
const realDateNow = Date.now;
const realFetch = globalThis.fetch;

beforeEach(() => {
  Date.now = () => FIXED_NOW;
  globalThis.btoa ||= (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob ||= (s) => Buffer.from(s, 'base64').toString('binary');
});

afterEach(() => {
  Date.now = realDateNow;
  globalThis.fetch = realFetch;
});

test('scheduler sends Telegram and advances reminders without Web Push devices', async () => {
  const db = new FakeDB({
    users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
    telegramLinks: [{ user_id: 'user-1', chat_id: 1001 }],
    reminders: [makeReminder()],
  });
  const calls = mockFetch();

  await runScheduled({ DB: db, TELEGRAM_BOT_TOKEN: 'token' });

  assert.equal(calls.telegram.length, 1);
  const reminder = db.reminders[0];
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.last_sent_at, FIXED_NOW);
  assert.equal(reminder.next_attempt_at, FIXED_NOW + 2 * 60_000);
});

test('scheduler treats Telegram success as delivered when Web Push transiently fails', async () => {
  const subscription = await makeSubscription();
  const vapid = await makeVapidConfig();
  const db = new FakeDB({
    users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
    devices: [{
      id: 'device-1',
      user_id: 'user-1',
      endpoint: 'https://push.example/send',
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      revoked_at: null,
    }],
    telegramLinks: [{ user_id: 'user-1', chat_id: 1001 }],
    reminders: [makeReminder()],
  });
  const calls = mockFetch({ pushStatus: 500 });

  await runScheduled({
    DB: db,
    TELEGRAM_BOT_TOKEN: 'token',
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_SUBJECT: 'mailto:test@example.com',
  });

  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.push.length, 1);
  assert.equal(db.pushLog[0].status, 500);
  const reminder = db.reminders[0];
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.next_attempt_at, FIXED_NOW + 2 * 60_000);
});

test('scheduler backs off when no delivery channel is available', async () => {
  const db = new FakeDB({
    users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
    reminders: [makeReminder()],
  });
  mockFetch();

  await runScheduled({ DB: db });

  const reminder = db.reminders[0];
  assert.equal(reminder.send_count, 0);
  assert.equal(reminder.next_attempt_at, FIXED_NOW + 60 * 60_000);
});

async function runScheduled(env) {
  let scheduled;
  worker.scheduled({}, env, { waitUntil: (promise) => { scheduled = promise; } });
  await scheduled;
}

function makeReminder(overrides = {}) {
  return {
    id: 'rem-1',
    user_id: 'user-1',
    device_id: 'device-1',
    title: 'Take medicine',
    note: '',
    fire_at: FIXED_NOW - 1_000,
    repeat: 'none',
    tone: 'friendly',
    status: 'active',
    send_count: 0,
    last_sent_at: null,
    next_attempt_at: FIXED_NOW - 1_000,
    acked_at: null,
    created_at: FIXED_NOW - 10_000,
    updated_at: FIXED_NOW - 10_000,
    ...overrides,
  };
}

function mockFetch({ pushStatus = 201 } = {}) {
  const calls = { telegram: [], push: [] };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith('https://api.telegram.org/')) {
      calls.telegram.push({ url: href, init });
      return jsonResponse({ ok: true, result: { message_id: calls.telegram.length } });
    }
    if (href.startsWith('https://push.example/')) {
      calls.push.push({ url: href, init });
      return new Response(pushStatus >= 200 && pushStatus < 300 ? 'ok' : 'push failed', { status: pushStatus });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  return calls;
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

async function makeVapidConfig() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return {
    privateKey: jwk.d,
    publicKey: b64uEncode(concatBytes(
      Uint8Array.of(0x04),
      b64uDecode(jwk.x),
      b64uDecode(jwk.y),
    )),
  };
}

async function makeSubscription() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    p256dh: b64uEncode(publicKey),
    auth: b64uEncode(randomBytes(16)),
  };
}

function b64uEncode(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function b64uDecode(value) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

class FakeDB {
  constructor({ users = [], devices = [], telegramLinks = [], reminders = [] } = {}) {
    this.users = users;
    this.devices = devices;
    this.telegramLinks = telegramLinks;
    this.reminders = reminders;
    this.pushLog = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

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
    if (this.sql.includes('FROM reminders') && this.sql.includes("status = 'active'")) {
      const [now] = this.args;
      return {
        results: this.db.reminders
          .filter((r) => r.status === 'active' && r.next_attempt_at <= now && r.user_id)
          .slice(0, 200),
      };
    }
    if (this.sql.includes('FROM devices WHERE user_id')) {
      const [userId] = this.args;
      return {
        results: this.db.devices.filter((d) => d.user_id === userId && d.revoked_at == null),
      };
    }
    if (this.sql.includes('FROM telegram_links WHERE user_id')) {
      const [userId] = this.args;
      return {
        results: this.db.telegramLinks.filter((l) => l.user_id === userId),
      };
    }
    throw new Error(`Unhandled all(): ${this.sql}`);
  }

  async first() {
    if (this.sql.includes('SELECT lang, news_categories FROM users WHERE id')) {
      const [userId] = this.args;
      return this.db.users.find((u) => u.id === userId) || null;
    }
    if (this.sql.includes('SELECT lang FROM users WHERE id')) {
      const [userId] = this.args;
      const user = this.db.users.find((u) => u.id === userId);
      return user ? { lang: user.lang } : null;
    }
    if (this.sql.includes('COUNT(*) AS c') && this.sql.includes('FROM reminders')) {
      const [userId, now] = this.args;
      const c = this.db.reminders.filter((r) =>
        r.user_id === userId &&
        !r.acked_at &&
        (r.status === 'missed' || (r.status === 'active' && r.fire_at <= now))
      ).length;
      return { c };
    }
    throw new Error(`Unhandled first(): ${this.sql}`);
  }

  async run() {
    if (this.sql.includes('INSERT INTO push_log')) {
      const [reminder_id, device_id, user_id, sent_at, attempt, body, status, error] = this.args;
      this.db.pushLog.push({ reminder_id, device_id, user_id, sent_at, attempt, body, status, error });
      return { success: true };
    }
    if (this.sql.includes('UPDATE devices SET revoked_at')) {
      const [revokedAt, id] = this.args;
      const device = this.db.devices.find((d) => d.id === id);
      if (device) device.revoked_at = revokedAt;
      return { success: true };
    }
    if (this.sql.includes('UPDATE reminders SET next_attempt_at')) {
      const [nextAttemptAt, updatedAt, id] = this.args;
      const reminder = this.findReminder(id);
      reminder.next_attempt_at = nextAttemptAt;
      reminder.updated_at = updatedAt;
      return { success: true };
    }
    if (this.sql.includes('SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3')) {
      const [sendCount, lastSentAt, nextAttemptAt, id] = this.args;
      const reminder = this.findReminder(id);
      reminder.send_count = sendCount;
      reminder.last_sent_at = lastSentAt;
      reminder.next_attempt_at = nextAttemptAt;
      reminder.updated_at = lastSentAt;
      return { success: true };
    }
    if (this.sql.includes("SET status = 'missed'")) {
      const [sendCount, now, id] = this.args;
      const reminder = this.findReminder(id);
      reminder.status = 'missed';
      reminder.send_count = sendCount;
      reminder.last_sent_at = now;
      reminder.updated_at = now;
      return { success: true };
    }
    if (this.sql.includes('SET fire_at = ?1, next_attempt_at = ?1')) {
      const [nextFire, now, id] = this.args;
      const reminder = this.findReminder(id);
      reminder.fire_at = nextFire;
      reminder.next_attempt_at = nextFire;
      reminder.send_count = 0;
      reminder.last_sent_at = null;
      reminder.status = 'active';
      reminder.acked_at = null;
      reminder.updated_at = now;
      return { success: true };
    }
    if (this.sql.includes('DELETE FROM telegram_links WHERE chat_id')) {
      const [chatId] = this.args;
      this.db.telegramLinks = this.db.telegramLinks.filter((l) => l.chat_id !== chatId);
      return { success: true };
    }
    throw new Error(`Unhandled run(): ${this.sql}`);
  }

  findReminder(id) {
    const reminder = this.db.reminders.find((r) => r.id === id);
    if (!reminder) throw new Error(`missing reminder ${id}`);
    return reminder;
  }
}
