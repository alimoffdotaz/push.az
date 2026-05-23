import assert from 'node:assert/strict';
import test from 'node:test';

import { processOneReminder, runScheduler } from '../src/index.js';

const NOW = 1_700_000_000_000;

function makeReminder(overrides = {}) {
  return {
    id: 'rem-1',
    user_id: 'user-1',
    device_id: 'dev-1',
    title: 'Pay rent',
    note: '',
    tone: 'friendly',
    fire_at: NOW - 60_000,
    repeat: 'none',
    status: 'active',
    send_count: 0,
    next_attempt_at: NOW - 60_000,
    updated_at: NOW - 60_000,
    ...overrides,
  };
}

function makeDevice(overrides = {}) {
  return {
    id: 'dev-1',
    user_id: 'user-1',
    endpoint: 'https://push.example/send/1',
    p256dh: 'p256dh',
    auth: 'auth',
    revoked_at: null,
    ...overrides,
  };
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
    const normalized = this.sql.replace(/\s+/g, ' ');
    if (normalized.includes('FROM reminders') && normalized.includes("status = 'active'")) {
      const now = this.args[0];
      return {
        results: this.db.reminders.filter(
          (r) => r.status === 'active' && r.user_id != null && r.next_attempt_at <= now,
        ),
      };
    }
    if (normalized.includes('FROM devices')) {
      const userId = this.args[0];
      return { results: this.db.devices.filter((d) => d.user_id === userId && d.revoked_at == null) };
    }
    throw new Error(`Unexpected all() SQL: ${this.sql}`);
  }

  async first() {
    const normalized = this.sql.replace(/\s+/g, ' ');
    if (normalized.includes('COUNT(*) AS c FROM reminders')) {
      return { c: this.db.pendingCount };
    }
    if (normalized.includes('SELECT lang, news_categories FROM users')) {
      return this.db.users.get(this.args[0]) || null;
    }
    throw new Error(`Unexpected first() SQL: ${this.sql}`);
  }

  async run() {
    const normalized = this.sql.replace(/\s+/g, ' ');
    if (normalized.includes('INSERT INTO push_log')) {
      this.db.pushLog.push({
        reminder_id: this.args[0],
        device_id: this.args[1],
        user_id: this.args[2],
        sent_at: this.args[3],
        attempt: this.args[4],
        body: this.args[5],
        status: this.args[6],
        error: this.args[7],
      });
      return { success: true };
    }
    if (normalized.includes('UPDATE devices SET revoked_at')) {
      const device = this.db.devices.find((d) => d.id === this.args[1]);
      if (device) device.revoked_at = this.args[0];
      return { success: true };
    }
    if (normalized.includes('UPDATE reminders SET next_attempt_at = ?1, updated_at = ?2')) {
      const reminder = this.db.reminders.find((r) => r.id === this.args[2]);
      if (reminder) {
        reminder.next_attempt_at = this.args[0];
        reminder.updated_at = this.args[1];
      }
      return { success: true };
    }
    if (normalized.includes('SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3')) {
      const reminder = this.db.reminders.find((r) => r.id === this.args[3]);
      if (reminder) {
        reminder.send_count = this.args[0];
        reminder.last_sent_at = this.args[1];
        reminder.next_attempt_at = this.args[2];
        reminder.updated_at = this.args[1];
      }
      return { success: true };
    }
    if (normalized.includes("SET status = 'missed'")) {
      const reminder = this.db.reminders.find((r) => r.id === this.args[2]);
      if (reminder) {
        reminder.status = 'missed';
        reminder.send_count = this.args[0];
        reminder.last_sent_at = this.args[1];
        reminder.updated_at = this.args[1];
      }
      return { success: true };
    }
    if (normalized.includes('SET fire_at = ?1, next_attempt_at = ?1')) {
      const reminder = this.db.reminders.find((r) => r.id === this.args[2]);
      if (reminder) {
        reminder.fire_at = this.args[0];
        reminder.next_attempt_at = this.args[0];
        reminder.send_count = 0;
        reminder.last_sent_at = this.args[1];
        reminder.updated_at = this.args[1];
      }
      return { success: true };
    }
    if (normalized.includes("UPDATE reminders SET status = 'cancelled'")) {
      const reminder = this.db.reminders.find((r) => r.id === this.args[1]);
      if (reminder) {
        reminder.status = 'cancelled';
        reminder.updated_at = this.args[0];
      }
      return { success: true };
    }
    throw new Error(`Unexpected run() SQL: ${this.sql}`);
  }
}

class FakeDB {
  constructor({ reminders = [], devices = [], users = [] } = {}) {
    this.reminders = reminders;
    this.devices = devices;
    this.users = new Map(users.map((u) => [u.id, u]));
    this.pendingCount = 1;
    this.pushLog = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

test('scheduler delivers Telegram reminders even when VAPID/web push is unavailable', async () => {
  const reminder = makeReminder();
  const db = new FakeDB({
    reminders: [reminder],
    users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
  });
  const tgCalls = [];

  await runScheduler(
    { DB: db, TELEGRAM_BOT_TOKEN: 'token' },
    {
      tgSendReminderToUser: async (...args) => {
        tgCalls.push(args);
        return { sent: 1, failed: 0 };
      },
    },
  );

  assert.equal(tgCalls.length, 1);
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.last_sent_at > 0, true);
  assert.equal(reminder.next_attempt_at > reminder.last_sent_at, true);
});

test('successful Telegram delivery advances reminder after transient web push failure', async () => {
  const reminder = makeReminder();
  const db = new FakeDB({
    reminders: [reminder],
    devices: [makeDevice()],
    users: [{ id: 'user-1', lang: 'en', news_categories: '[]' }],
  });

  await processOneReminder(
    { DB: db, TELEGRAM_BOT_TOKEN: 'token' },
    reminder,
    { privateKey: 'private', publicKey: 'public', subject: 'mailto:test@example.com' },
    NOW,
    {
      tgSendReminderToUser: async () => ({ sent: 1, failed: 0 }),
      sendWebPush: async () => ({ ok: false, gone: false, status: 503, body: 'try later' }),
    },
  );

  assert.equal(db.pushLog.length, 1);
  assert.equal(db.pushLog[0].status, 503);
  assert.equal(reminder.send_count, 1);
  assert.equal(reminder.last_sent_at, NOW);
  assert.equal(reminder.next_attempt_at, NOW + 2 * 60_000);
});
