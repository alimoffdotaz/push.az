import { sendWebPush } from './push.js';
import { buildPushBody } from './ai.js';

// ============================================================================
// Glavnyy Worker entry point
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'internal', message: String(err?.message || err) }, 500, request);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  },
};

// ============================================================================
// CORS / JSON helpers
// ============================================================================

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok =
    allowed.length === 0 ||
    allowed.includes('*') ||
    allowed.includes(origin) ||
    origin.endsWith('.pages.dev') ||
    origin === 'http://localhost:8000' ||
    origin === 'http://localhost:8787';
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(data, status = 200, request = null, env = null) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (request && env) Object.assign(headers, corsHeaders(request, env));
  else if (request) Object.assign(headers, corsHeaders(request, {}));
  return new Response(JSON.stringify(data), { status, headers });
}

// ============================================================================
// Router
// ============================================================================

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health') {
    return jsonResponse({ ok: true, ts: Date.now() }, 200, request, env);
  }

  if (path === '/api/vapid-public-key' && method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) {
      return jsonResponse({ error: 'VAPID_PUBLIC_KEY not configured' }, 500, request, env);
    }
    return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY }, 200, request, env);
  }

  if (path === '/api/subscribe' && method === 'POST') {
    return handleSubscribe(request, env);
  }

  if (path === '/api/unsubscribe' && method === 'POST') {
    return handleUnsubscribe(request, env);
  }

  if (path === '/api/reminders' && method === 'GET') {
    return handleListReminders(request, env);
  }

  if (path === '/api/reminders' && method === 'POST') {
    return handleUpsertReminder(request, env);
  }

  const reminderMatch = path.match(/^\/api\/reminders\/([a-zA-Z0-9_-]+)$/);
  if (reminderMatch && method === 'DELETE') {
    return handleDeleteReminder(request, env, reminderMatch[1]);
  }

  if (path === '/api/ack' && method === 'POST') {
    return handleAck(request, env);
  }

  if (path === '/api/test-push' && method === 'POST') {
    return handleTestPush(request, env, ctx);
  }

  if (path === '/' || path === '/api') {
    return jsonResponse({
      name: 'push.az-worker',
      version: '1.0.0',
      endpoints: [
        'GET  /api/health',
        'GET  /api/vapid-public-key',
        'POST /api/subscribe',
        'POST /api/unsubscribe',
        'GET  /api/reminders',
        'POST /api/reminders',
        'DELETE /api/reminders/:id',
        'POST /api/ack',
        'POST /api/test-push',
      ],
    }, 200, request, env);
  }

  return jsonResponse({ error: 'not found', path }, 404, request, env);
}

// ============================================================================
// Device ID (identifikatsiya)
// ============================================================================

function getDeviceId(request) {
  const h = request.headers.get('X-Device-Id');
  if (!h || !/^[a-zA-Z0-9_-]{8,128}$/.test(h)) return null;
  return h;
}

// ============================================================================
// /api/subscribe — sokhranyayem push subscription
// ============================================================================

async function handleSubscribe(request, env) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400, request, env);
  }

  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return jsonResponse({ error: 'subscription { endpoint, keys { p256dh, auth } } required' }, 400, request, env);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO devices (id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT(id) DO UPDATE SET
       endpoint = excluded.endpoint,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       last_seen_at = excluded.last_seen_at,
       revoked_at = NULL`,
  )
    .bind(
      deviceId,
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      request.headers.get('User-Agent') || '',
      now,
    )
    .run();

  return jsonResponse({ ok: true, deviceId }, 200, request, env);
}

async function handleUnsubscribe(request, env) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);
  await env.DB.prepare(`UPDATE devices SET revoked_at = ?1 WHERE id = ?2`).bind(Date.now(), deviceId).run();
  return jsonResponse({ ok: true }, 200, request, env);
}

// ============================================================================
// /api/reminders — CRUD
// ============================================================================

async function handleListReminders(request, env) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);

  const rows = await env.DB.prepare(
    `SELECT id, title, note, fire_at, repeat, tone, status, send_count, last_sent_at, acked_at, created_at, updated_at
     FROM reminders WHERE device_id = ?1 ORDER BY fire_at ASC`,
  )
    .bind(deviceId)
    .all();

  return jsonResponse({ reminders: rows.results || [] }, 200, request, env);
}

async function handleUpsertReminder(request, env) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400, request, env);
  }

  const {
    id,
    title,
    note = '',
    fireAt,
    repeat = 'none',
    tone = 'friendly',
  } = body || {};

  if (!id || !title || !fireAt) {
    return jsonResponse({ error: 'id, title, fireAt required' }, 400, request, env);
  }
  if (!['none', 'daily', 'weekly', 'monthly'].includes(repeat)) {
    return jsonResponse({ error: 'invalid repeat' }, 400, request, env);
  }
  if (!['friendly', 'urgent', 'funny', 'aggressive'].includes(tone)) {
    return jsonResponse({ error: 'invalid tone' }, 400, request, env);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO reminders
      (id, device_id, title, note, fire_at, repeat, tone, status, send_count, next_attempt_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', 0, ?5, ?8, ?8)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       note = excluded.note,
       fire_at = excluded.fire_at,
       repeat = excluded.repeat,
       tone = excluded.tone,
       status = 'active',
       send_count = 0,
       last_sent_at = NULL,
       next_attempt_at = excluded.fire_at,
       acked_at = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(id, deviceId, title, note, fireAt, repeat, tone, now)
    .run();

  return jsonResponse({ ok: true, id }, 200, request, env);
}

async function handleDeleteReminder(request, env, id) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);

  await env.DB.prepare(`DELETE FROM reminders WHERE id = ?1 AND device_id = ?2`).bind(id, deviceId).run();
  return jsonResponse({ ok: true }, 200, request, env);
}

// ============================================================================
// /api/ack — pol'zovatel' nazhal "Gotovo"
// ============================================================================

async function handleAck(request, env) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400, request, env);
  }

  const { reminderId, action = 'done' } = body || {};
  if (!reminderId) return jsonResponse({ error: 'reminderId required' }, 400, request, env);

  const reminder = await env.DB.prepare(
    `SELECT * FROM reminders WHERE id = ?1 AND device_id = ?2`,
  )
    .bind(reminderId, deviceId)
    .first();

  if (!reminder) return jsonResponse({ error: 'reminder not found' }, 404, request, env);

  const now = Date.now();

  if (action === 'snooze') {
    const minutes = Number(body.minutes) > 0 ? Number(body.minutes) : 10;
    const nextFire = now + minutes * 60_000;
    await env.DB.prepare(
      `UPDATE reminders
       SET fire_at = ?1, next_attempt_at = ?1, send_count = 0, last_sent_at = NULL, status = 'active', acked_at = NULL, updated_at = ?2
       WHERE id = ?3`,
    )
      .bind(nextFire, now, reminderId)
      .run();
    return jsonResponse({ ok: true, snoozedUntil: nextFire }, 200, request, env);
  }

  if (reminder.repeat && reminder.repeat !== 'none') {
    const nextFire = computeNextFireAt(reminder.fire_at, reminder.repeat, now);
    await env.DB.prepare(
      `UPDATE reminders
       SET fire_at = ?1, next_attempt_at = ?1, send_count = 0, last_sent_at = NULL, status = 'active', acked_at = NULL, updated_at = ?2
       WHERE id = ?3`,
    )
      .bind(nextFire, now, reminderId)
      .run();
    return jsonResponse({ ok: true, nextFire }, 200, request, env);
  }

  await env.DB.prepare(
    `UPDATE reminders SET status = 'acked', acked_at = ?1, updated_at = ?1 WHERE id = ?2`,
  )
    .bind(now, reminderId)
    .run();

  return jsonResponse({ ok: true, acked: true }, 200, request, env);
}

// ============================================================================
// /api/test-push — shlyot test-push na ustroystvo (dlya proverki)
// ============================================================================

async function handleTestPush(request, env, ctx) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);

  const device = await env.DB.prepare(
    `SELECT * FROM devices WHERE id = ?1 AND revoked_at IS NULL`,
  )
    .bind(deviceId)
    .first();

  if (!device) return jsonResponse({ error: 'device not found' }, 404, request, env);

  const vapid = getVapidConfig(env);
  if (!vapid) return jsonResponse({ error: 'VAPID not configured' }, 500, request, env);

  const testReminder = { id: 'test', title: 'Test push.az', note: '', tone: 'friendly' };
  // Dlya test-pusha srazu pokazyvayem challenge chtoby protestit' funktsiyu
  const built = await buildPushBody(env, testReminder, 2);
  const pendingCount = await countPendingReminders(env, deviceId);

  const result = await sendWebPush(
    {
      endpoint: device.endpoint,
      p256dh: device.p256dh,
      auth: device.auth,
    },
    {
      type: 'test',
      title: 'push.az',
      body: built.text,
      challenge: built.challenge,
      reminderId: 'test',
      pendingCount,
    },
    vapid,
  );

  return jsonResponse({ ok: result.ok, status: result.status, body: built.text, challenge: built.challenge }, result.ok ? 200 : 502, request, env);
}

async function countPendingReminders(env, deviceId) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM reminders
       WHERE device_id = ?1 AND status = 'active' AND fire_at <= ?2`,
    )
      .bind(deviceId, Date.now())
      .first();
    return Number(row?.c || 0);
  } catch {
    return 0;
  }
}

// ============================================================================
// Scheduler (vyzyvayetsya po cron kazhduyu minutu)
// ============================================================================

// Eskalatsiya zaderzhek mezhdu popytkami (v minutax)
const ESCALATION_DELAYS_MIN = [2, 5, 10, 20]; // posle 1-y, 2-y, 3-y, 4-y popytki
const MAX_ATTEMPTS = 5;

async function runScheduler(env) {
  const vapid = getVapidConfig(env);
  if (!vapid) {
    console.warn('[scheduler] VAPID not configured, skipping');
    return;
  }

  const now = Date.now();
  const dueRows = await env.DB.prepare(
    `SELECT r.*, d.endpoint, d.p256dh, d.auth, d.revoked_at AS device_revoked
     FROM reminders r
     JOIN devices d ON d.id = r.device_id
     WHERE r.status = 'active'
       AND r.next_attempt_at <= ?1
       AND (d.revoked_at IS NULL)
     LIMIT 200`,
  )
    .bind(now)
    .all();

  const due = dueRows.results || [];
  if (!due.length) return;

  console.log(`[scheduler] processing ${due.length} due reminders`);

  for (const r of due) {
    try {
      await processOneReminder(env, r, vapid, now);
    } catch (err) {
      console.error('[scheduler] error for reminder', r.id, err?.message || err);
    }
  }
}

async function processOneReminder(env, r, vapid, now) {
  const attempt = (r.send_count || 0) + 1;

  if (attempt > MAX_ATTEMPTS) {
    await env.DB.prepare(
      `UPDATE reminders SET status = 'cancelled', updated_at = ?1 WHERE id = ?2`,
    )
      .bind(now, r.id)
      .run();
    return;
  }

  const reminder = { id: r.id, title: r.title, note: r.note, tone: r.tone };
  const built = await buildPushBody(env, reminder, attempt);
  const pendingCount = await countPendingReminders(env, r.device_id);

  const result = await sendWebPush(
    { endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth },
    {
      type: 'reminder',
      reminderId: r.id,
      title: r.title,
      body: built.text,
      challenge: built.challenge,
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      fireAt: r.fire_at,
      tone: r.tone,
      pendingCount,
    },
    vapid,
    { ttl: 60, urgency: 'high', topic: 'r-' + r.id },
  );

  await env.DB.prepare(
    `INSERT INTO push_log (reminder_id, device_id, sent_at, attempt, body, status, error)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      r.id,
      r.device_id,
      now,
      attempt,
      built.text,
      result.status,
      result.ok ? null : String(result.body || '').slice(0, 500),
    )
    .run();

  if (result.gone) {
    await env.DB.prepare(`UPDATE devices SET revoked_at = ?1 WHERE id = ?2`)
      .bind(now, r.device_id)
      .run();
    return;
  }

  if (!result.ok) {
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    if (r.repeat && r.repeat !== 'none') {
      const nextFire = computeNextFireAt(r.fire_at, r.repeat, now);
      await env.DB.prepare(
        `UPDATE reminders
         SET fire_at = ?1, next_attempt_at = ?1, send_count = 0, last_sent_at = ?2, updated_at = ?2
         WHERE id = ?3`,
      )
        .bind(nextFire, now, r.id)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE reminders
         SET status = 'cancelled', send_count = ?1, last_sent_at = ?2, updated_at = ?2
         WHERE id = ?3`,
      )
        .bind(attempt, now, r.id)
        .run();
    }
    return;
  }

  const delayMin = ESCALATION_DELAYS_MIN[Math.min(attempt - 1, ESCALATION_DELAYS_MIN.length - 1)];
  const nextAttemptAt = now + delayMin * 60_000;

  await env.DB.prepare(
    `UPDATE reminders
     SET send_count = ?1, last_sent_at = ?2, next_attempt_at = ?3, updated_at = ?2
     WHERE id = ?4`,
  )
    .bind(attempt, now, nextAttemptAt, r.id)
    .run();
}

// ============================================================================
// Helpers
// ============================================================================

function getVapidConfig(env) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) return null;
  return {
    privateKey: env.VAPID_PRIVATE_KEY,
    publicKey: env.VAPID_PUBLIC_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

function computeNextFireAt(prevFireAt, repeat, now) {
  let t = prevFireAt;
  do {
    const d = new Date(t);
    if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    t = d.getTime();
  } while (t <= now);
  return t;
}
