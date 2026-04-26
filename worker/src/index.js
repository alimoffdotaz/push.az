import { sendWebPush } from './push.js';
import { buildPushBody } from './ai.js';
import {
  handleRegisterBegin,
  handleRegisterFinish,
  handleLoginBegin,
  handleLoginFinish,
  handleMe,
  handleLogout,
  handleAddPasskeyBegin,
  handleAddPasskeyFinish,
  handleRemovePasskey,
  handleSetLang,
  getUserFromRequest,
} from './auth.js';
import {
  handleTelegramWebhook,
  createLinkCode,
  tgSendReminderToUser,
  setTelegramWebhook,
  getTelegramWebhookInfo,
} from './telegram.js';

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
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Helper dlya auth-endpointov: vyzyvayet handler i zavorachivaet v JSON response.
async function authRoute(handlerFn, request, env) {
  const result = await handlerFn(request, env);
  if (result?.error) {
    return jsonResponse({ error: result.error }, result.status || 400, request, env);
  }
  return jsonResponse(result, 200, request, env);
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

  // ---- PUBLIC ----
  if (path === '/api/health') {
    return jsonResponse({ ok: true, ts: Date.now() }, 200, request, env);
  }

  if (path === '/api/vapid-public-key' && method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) {
      return jsonResponse({ error: 'VAPID_PUBLIC_KEY not configured' }, 500, request, env);
    }
    return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY }, 200, request, env);
  }

  // ---- AUTH (publichnye) ----
  if (path === '/api/auth/register/begin' && method === 'POST') {
    return authRoute(handleRegisterBegin, request, env);
  }
  if (path === '/api/auth/register/finish' && method === 'POST') {
    return authRoute(handleRegisterFinish, request, env);
  }
  if (path === '/api/auth/login/begin' && method === 'POST') {
    return authRoute(handleLoginBegin, request, env);
  }
  if (path === '/api/auth/login/finish' && method === 'POST') {
    return authRoute(handleLoginFinish, request, env);
  }

  // ---- AUTH (trebuyut session) ----
  if (path === '/api/auth/me' && method === 'GET') {
    return authRoute(handleMe, request, env);
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    return authRoute(handleLogout, request, env);
  }
  if (path === '/api/auth/passkey/add/begin' && method === 'POST') {
    return authRoute(handleAddPasskeyBegin, request, env);
  }
  if (path === '/api/auth/passkey/add/finish' && method === 'POST') {
    return authRoute(handleAddPasskeyFinish, request, env);
  }
  const rmPasskeyMatch = path.match(/^\/api\/auth\/passkey\/([A-Za-z0-9_\-]+)$/);
  if (rmPasskeyMatch && method === 'DELETE') {
    return authRoute((r, e) => handleRemovePasskey(r, e, rmPasskeyMatch[1]), request, env);
  }
  if (path === '/api/user/lang' && method === 'POST') {
    return authRoute(handleSetLang, request, env);
  }

  // ---- Telegram webhook (publichniy, zashchishchyon po X-Telegram-Bot-Api-Secret-Token) ----
  if (path === '/api/telegram/webhook' && method === 'POST') {
    return handleTelegramWebhook(request, env);
  }

  // ---- Telegram admin (tol'ko dlya setup) ----
  if (path === '/api/telegram/admin/set-webhook' && method === 'POST') {
    if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
      return jsonResponse({ error: 'forbidden' }, 403, request, env);
    }
    let body; try { body = await request.json(); } catch { body = {}; }
    const webhookUrl = body.url || (new URL(request.url).origin + '/api/telegram/webhook');
    const result = await setTelegramWebhook(env, webhookUrl);
    return jsonResponse(result, 200, request, env);
  }

  if (path === '/api/telegram/admin/webhook-info' && method === 'GET') {
    if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
      return jsonResponse({ error: 'forbidden' }, 403, request, env);
    }
    const result = await getTelegramWebhookInfo(env);
    return jsonResponse(result, 200, request, env);
  }

  // ---- Zashchischennye endpointy: trebuyem session ----
  const user = await getUserFromRequest(env, request);

  if (path === '/api/subscribe' && method === 'POST') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleSubscribe(request, env, user);
  }
  if (path === '/api/unsubscribe' && method === 'POST') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleUnsubscribe(request, env, user);
  }
  if (path === '/api/reminders' && method === 'GET') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleListReminders(request, env, user);
  }
  if (path === '/api/reminders' && method === 'POST') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleUpsertReminder(request, env, user);
  }
  const reminderMatch = path.match(/^\/api\/reminders\/([a-zA-Z0-9_-]+)$/);
  if (reminderMatch && method === 'DELETE') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleDeleteReminder(request, env, reminderMatch[1], user);
  }
  if (path === '/api/ack' && method === 'POST') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleAck(request, env, user);
  }
  // Telegram (authenticated)
  if (path === '/api/telegram/link/begin' && method === 'POST') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleTelegramLinkBegin(request, env, user);
  }
  if (path === '/api/telegram/status' && method === 'GET') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleTelegramStatus(request, env, user);
  }
  const tgUnlinkMatch = path.match(/^\/api\/telegram\/links\/(\d+)$/);
  if (tgUnlinkMatch && method === 'DELETE') {
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    return handleTelegramUnlink(request, env, user, tgUnlinkMatch[1]);
  }

  if (path === '/' || path === '/api') {
    return jsonResponse({
      name: 'push.az-worker',
      version: '1.1.0',
      endpoints: [
        'GET    /api/health',
        'GET    /api/vapid-public-key',
        'POST   /api/auth/register/begin',
        'POST   /api/auth/register/finish',
        'POST   /api/auth/login/begin',
        'POST   /api/auth/login/finish',
        'GET    /api/auth/me',
        'POST   /api/auth/logout',
        'POST   /api/auth/passkey/add/begin',
        'POST   /api/auth/passkey/add/finish',
        'DELETE /api/auth/passkey/:id',
        'POST   /api/user/lang',
        'POST   /api/subscribe',
        'POST   /api/unsubscribe',
        'GET    /api/reminders',
        'POST   /api/reminders',
        'DELETE /api/reminders/:id',
        'POST   /api/ack',
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

async function handleSubscribe(request, env, user) {
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
    `INSERT INTO devices (id, user_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       endpoint = excluded.endpoint,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       last_seen_at = excluded.last_seen_at,
       revoked_at = NULL`,
  )
    .bind(
      deviceId,
      user.userId,
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      request.headers.get('User-Agent') || '',
      now,
    )
    .run();

  return jsonResponse({ ok: true, deviceId }, 200, request, env);
}

async function handleUnsubscribe(request, env, user) {
  const deviceId = getDeviceId(request);
  if (!deviceId) return jsonResponse({ error: 'X-Device-Id header required' }, 400, request, env);
  await env.DB.prepare(
    `UPDATE devices SET revoked_at = ?1 WHERE id = ?2 AND user_id = ?3`,
  )
    .bind(Date.now(), deviceId, user.userId)
    .run();
  return jsonResponse({ ok: true }, 200, request, env);
}

// ============================================================================
// /api/reminders — CRUD
// ============================================================================

async function handleListReminders(request, env, user) {
  // Otdayom tol'ko aktivnye i propushchennye reminderы. 'acked' i 'cancelled'
  // ostayutsya v DB dlya audita, no klientu ne nuzhny — inache lokalьnaya
  // sync bzdet vozвращат' ikh i triggerit' takeover posle ack.
  const rows = await env.DB.prepare(
    `SELECT id, title, note, fire_at, repeat, tone, status, send_count, last_sent_at, acked_at, created_at, updated_at
     FROM reminders WHERE user_id = ?1 AND status IN ('active','missed') ORDER BY fire_at ASC`,
  )
    .bind(user.userId)
    .all();

  return jsonResponse({ reminders: rows.results || [] }, 200, request, env);
}

async function handleUpsertReminder(request, env, user) {
  const deviceId = getDeviceId(request) || user.deviceId || 'sess-' + user.sessionId.slice(0, 8);

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

  // Yesli updateim — proverim vladel'tsa
  const existing = await env.DB.prepare(
    `SELECT user_id FROM reminders WHERE id = ?1`,
  )
    .bind(id)
    .first();
  if (existing && existing.user_id && existing.user_id !== user.userId) {
    return jsonResponse({ error: 'forbidden' }, 403, request, env);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO reminders
      (id, user_id, device_id, title, note, fire_at, repeat, tone, status, send_count, next_attempt_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', 0, ?6, ?9, ?9)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
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
    .bind(id, user.userId, deviceId, title, note, fireAt, repeat, tone, now)
    .run();

  return jsonResponse({ ok: true, id }, 200, request, env);
}

async function handleDeleteReminder(request, env, id, user) {
  await env.DB.prepare(
    `DELETE FROM reminders WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(id, user.userId)
    .run();
  return jsonResponse({ ok: true }, 200, request, env);
}

// ============================================================================
// /api/ack — pol'zovatel' nazhal "Gotovo"
// ============================================================================

async function handleAck(request, env, user) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400, request, env);
  }

  const { reminderId, action = 'done' } = body || {};
  if (!reminderId) return jsonResponse({ error: 'reminderId required' }, 400, request, env);

  const reminder = await env.DB.prepare(
    `SELECT * FROM reminders WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(reminderId, user.userId)
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

async function countPendingRemindersForUser(env, userId) {
  try {
    const now = Date.now();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM reminders
       WHERE user_id = ?1
         AND acked_at IS NULL
         AND (
           status = 'missed'
           OR (status = 'active' AND fire_at <= ?2)
         )`,
    )
      .bind(userId, now)
      .first();
    return Number(row?.c || 0);
  } catch {
    return 0;
  }
}

// ============================================================================
// Telegram link-flow handlers
// ============================================================================

async function handleTelegramLinkBegin(request, env, user) {
  const botUsername = env.TELEGRAM_BOT_USERNAME || 'push_az_bot';
  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse({ error: 'telegram not configured' }, 500, request, env);
  }
  const { code, expiresAt } = await createLinkCode(env, user.userId);
  const deepLink = `https://t.me/${botUsername}?start=${code}`;
  return jsonResponse({
    code,
    expiresAt,
    botUsername,
    deepLink,
    instructions: 'Otkroi deepLink ili napishi botu komandu: /link ' + code,
  }, 200, request, env);
}

async function handleTelegramStatus(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT chat_id, username, first_name, linked_at
     FROM telegram_links WHERE user_id = ?1 ORDER BY linked_at DESC`,
  )
    .bind(user.userId)
    .all();
  return jsonResponse({ links: rows.results || [] }, 200, request, env);
}

async function handleTelegramUnlink(request, env, user, chatIdStr) {
  const chatId = Number(chatIdStr);
  if (!Number.isFinite(chatId)) {
    return jsonResponse({ error: 'invalid chat_id' }, 400, request, env);
  }
  await env.DB.prepare(
    `DELETE FROM telegram_links WHERE chat_id = ?1 AND user_id = ?2`,
  )
    .bind(chatId, user.userId)
    .run();
  return jsonResponse({ ok: true }, 200, request, env);
}

async function countPendingRemindersForDevice(env, deviceId) {
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
    `SELECT * FROM reminders
     WHERE status = 'active'
       AND next_attempt_at <= ?1
       AND user_id IS NOT NULL
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

  // Nakhodim vse aktivnye device'y polzovatelya
  const devicesRows = await env.DB.prepare(
    `SELECT * FROM devices WHERE user_id = ?1 AND revoked_at IS NULL`,
  )
    .bind(r.user_id)
    .all();
  const devices = devicesRows.results || [];

  if (!devices.length) {
    // Net device'ev — prosto prodvigayem next_attempt, chtoby ne lomat' schedule (ili otmenyayem)
    await env.DB.prepare(
      `UPDATE reminders SET next_attempt_at = ?1, updated_at = ?2 WHERE id = ?3`,
    )
      .bind(now + 60 * 60_000, now, r.id) // retray cherez chas
      .run();
    return;
  }

  const reminder = { id: r.id, title: r.title, note: r.note, tone: r.tone, fire_at: r.fire_at };

  // Yazyk pol'zovatelya (dlya AI, fallback'ov i Telegram formattera)
  let lang = 'ru';
  try {
    const u = await env.DB.prepare(`SELECT lang FROM users WHERE id = ?1`).bind(r.user_id).first();
    if (u?.lang) lang = u.lang;
  } catch {}

  const built = await buildPushBody(env, reminder, attempt, lang, now, MAX_ATTEMPTS);
  const pendingCount = await countPendingRemindersForUser(env, r.user_id);

  // Parallelno shlyom v Telegram (esli user'a privyazal)
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      await tgSendReminderToUser(env, r.user_id, reminder, built.text, attempt, MAX_ATTEMPTS);
    } catch (err) {
      console.warn('[tg] send failed for reminder', r.id, err?.message || err);
    }
  }

  let anyOk = false;
  let anyNonGoneError = false;

  for (const d of devices) {
    const result = await sendWebPush(
      { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth },
      {
        type: 'reminder',
        reminderId: r.id,
        title: r.title,
        body: built.text,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        fireAt: r.fire_at,
        tone: r.tone,
        pendingCount,
        lang,
      },
      vapid,
      { ttl: 60, urgency: 'high', topic: 'r-' + r.id },
    );

    await env.DB.prepare(
      `INSERT INTO push_log (reminder_id, device_id, user_id, sent_at, attempt, body, status, error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(
        r.id,
        d.id,
        r.user_id,
        now,
        attempt,
        built.text,
        result.status,
        result.ok ? null : String(result.body || '').slice(0, 500),
      )
      .run();

    if (result.gone) {
      await env.DB.prepare(`UPDATE devices SET revoked_at = ?1 WHERE id = ?2`)
        .bind(now, d.id)
        .run();
      continue;
    }
    if (result.ok) anyOk = true;
    else anyNonGoneError = true;
  }

  if (!anyOk && anyNonGoneError) {
    // Vse popytki v etu iteratsiyu upali — ne prodvigayem schetchik
    return;
  }
  if (!anyOk) {
    // Vse device'y goneли
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
      // Propushchen: ne gasim reminder, a perevodim v 'missed'. Scheduler
      // ego bolshe ne dyornet (status != 'active'), no /api/reminders otdast,
      // i pri otkrytii PWA force-takeover zastavit polzovatelya podtverdit'.
      await env.DB.prepare(
        `UPDATE reminders
         SET status = 'missed', send_count = ?1, last_sent_at = ?2, updated_at = ?2
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
