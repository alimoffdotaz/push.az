// WebAuthn (Passkey) authentication handlers.
// Uses @simplewebauthn/server for challenge generation and verification.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { normalizeNewsCategoryIds } from './news.js';

function parseUserNewsCategories(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

// ============================================================================
// Utility
// ============================================================================

function randomId(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64uEncode(bufOrStr) {
  let bytes;
  if (typeof bufOrStr === 'string') {
    bytes = new TextEncoder().encode(bufOrStr);
  } else if (bufOrStr instanceof ArrayBuffer) {
    bytes = new Uint8Array(bufOrStr);
  } else {
    bytes = bufOrStr;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getAuthConfig(env, origin) {
  // RP_ID = domen bez skhemy. EXPECTED_ORIGIN = s https.
  // Yesli peremennye ne zadany \u2014 vychisleryaem iz request origin.
  let rpID = env.RP_ID;
  let expectedOrigin = env.EXPECTED_ORIGIN;

  if (!rpID && origin) {
    try {
      rpID = new URL(origin).hostname;
    } catch {}
  }
  if (!expectedOrigin && origin) {
    expectedOrigin = origin;
  }

  return {
    rpID: rpID || 'push-az.pages.dev',
    rpName: env.RP_NAME || 'push.az',
    expectedOrigin: expectedOrigin || 'https://push-az.pages.dev',
    sessionTtlMs: 1000 * 60 * 60 * 24 * 90, // 90 dney
    challengeTtlMs: 1000 * 60 * 5, // 5 min
  };
}

// ============================================================================
// Challenge helpers
// ============================================================================

async function storeChallenge(env, { type, challenge, userId }) {
  const id = randomId(24);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO auth_challenges (id, challenge, type, user_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(id, challenge, type, userId || null, now, now + 1000 * 60 * 5)
    .run();
  return id;
}

async function consumeChallenge(env, challengeId, expectedType) {
  const row = await env.DB.prepare(
    `SELECT * FROM auth_challenges WHERE id = ?1`,
  )
    .bind(challengeId)
    .first();
  if (!row) return null;
  await env.DB.prepare(`DELETE FROM auth_challenges WHERE id = ?1`).bind(challengeId).run();
  if (row.type !== expectedType) return null;
  if (row.expires_at < Date.now()) return null;
  return row;
}

async function cleanupExpiredChallenges(env) {
  try {
    await env.DB.prepare(`DELETE FROM auth_challenges WHERE expires_at < ?1`)
      .bind(Date.now())
      .run();
  } catch {}
}

// ============================================================================
// Session helpers
// ============================================================================

async function createSession(env, userId, { deviceId, userAgent }) {
  const id = randomId(32);
  const now = Date.now();
  const expires = now + 1000 * 60 * 60 * 24 * 90;
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, device_id, user_agent, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(id, userId, deviceId || null, userAgent || '', now, expires)
    .run();
  return { token: id, expiresAt: expires };
}

export async function getUserFromRequest(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const row = await env.DB.prepare(
    `SELECT s.*, u.display_name AS user_display_name, u.lang AS user_lang
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?1 AND s.expires_at > ?2`,
  )
    .bind(token, Date.now())
    .first();
  if (!row) return null;
  return {
    userId: row.user_id,
    displayName: row.user_display_name,
    lang: row.user_lang || 'ru',
    sessionId: row.id,
    deviceId: row.device_id,
  };
}

// ============================================================================
// Credential helpers
// ============================================================================

async function getCredentialsForUser(env, userId) {
  const rows = await env.DB.prepare(
    `SELECT id, transports FROM credentials WHERE user_id = ?1`,
  )
    .bind(userId)
    .all();
  return (rows.results || []).map((r) => ({
    id: b64uDecode(r.id),
    type: 'public-key',
    transports: r.transports ? JSON.parse(r.transports) : undefined,
  }));
}

// ============================================================================
// Device name guess
// ============================================================================

function guessDeviceName(userAgent) {
  if (!userAgent) return 'Ustroystvo';
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Mac/.test(userAgent)) return 'Mac';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Ustroystvo';
}

// ============================================================================
// Register: BEGIN
// ============================================================================

export async function handleRegisterBegin(request, env) {
  cleanupExpiredChallenges(env);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const displayName = (body.displayName || '').toString().slice(0, 80) || 'Me';
  const rawLang = (body.lang || '').toString().toLowerCase();
  const lang = ['ru', 'az', 'en'].includes(rawLang) ? rawLang : 'ru';

  const origin = request.headers.get('Origin') || '';
  const cfg = getAuthConfig(env, origin);

  // Sozdayem polzovatelya srazu (inache nado bylo by xranit\u2019 v challenge)
  const userId = randomId(16);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, display_name, created_at, last_login_at, lang) VALUES (?1, ?2, ?3, ?3, ?4)`,
  )
    .bind(userId, displayName, now, lang)
    .run();

  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userID: new TextEncoder().encode(userId),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: [],
    timeout: 60000,
  });

  const challengeId = await storeChallenge(env, {
    type: 'registration',
    challenge: options.challenge,
    userId,
  });

  return { options, challengeId, userId };
}

// ============================================================================
// Register: FINISH
// ============================================================================

export async function handleRegisterFinish(request, env) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { challengeId, attestationResponse, deviceId } = body;
  if (!challengeId || !attestationResponse) {
    return { error: 'challengeId + attestationResponse required', status: 400 };
  }

  const row = await consumeChallenge(env, challengeId, 'registration');
  if (!row) return { error: 'challenge expired or invalid', status: 400 };

  const origin = request.headers.get('Origin') || '';
  const cfg = getAuthConfig(env, origin);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: row.challenge,
      expectedOrigin: cfg.expectedOrigin,
      expectedRPID: cfg.rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    console.warn('register verify error:', err?.message || err);
    // Delete the orphan user
    await env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(row.user_id).run();
    return { error: 'verification failed: ' + (err?.message || err), status: 400 };
  }

  if (!verification.verified || !verification.registrationInfo) {
    await env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(row.user_id).run();
    return { error: 'not verified', status: 400 };
  }

  const { credential } = verification.registrationInfo;
  const credId = credential.id; // uzhe base64url string v v11
  const publicKeyB64 = b64uEncode(credential.publicKey);
  const counter = credential.counter || 0;
  const transports = attestationResponse.response?.transports || null;

  const userAgent = request.headers.get('User-Agent') || '';
  const deviceName = guessDeviceName(userAgent);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO credentials (id, user_id, public_key, counter, transports, device_name, created_at, last_used_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  )
    .bind(
      credId,
      row.user_id,
      publicKeyB64,
      counter,
      transports ? JSON.stringify(transports) : null,
      deviceName,
      now,
    )
    .run();

  const session = await createSession(env, row.user_id, {
    deviceId,
    userAgent,
  });

  // Privyazyvayem device k userу
  if (deviceId) {
    await env.DB.prepare(
      `UPDATE devices SET user_id = ?1 WHERE id = ?2 AND (user_id IS NULL OR user_id = ?1)`,
    )
      .bind(row.user_id, deviceId)
      .run();
    // Migratsiya: reminderу etogo device'a dostayutsya novomu user'u
    await env.DB.prepare(
      `UPDATE reminders SET user_id = ?1 WHERE device_id = ?2 AND user_id IS NULL`,
    )
      .bind(row.user_id, deviceId)
      .run();
  }

  const userRow = await env.DB.prepare(`SELECT display_name, lang, news_categories FROM users WHERE id = ?1`)
    .bind(row.user_id)
    .first();

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: row.user_id,
      displayName: userRow?.display_name || 'Me',
      lang: userRow?.lang || 'ru',
      newsCategories: parseUserNewsCategories(userRow?.news_categories),
    },
  };
}

// ============================================================================
// Login: BEGIN
// ============================================================================

export async function handleLoginBegin(request, env) {
  cleanupExpiredChallenges(env);

  const origin = request.headers.get('Origin') || '';
  const cfg = getAuthConfig(env, origin);

  // Resident key flow: ne nuzhen email. Polzovatel vybirayet passkey sam.
  const options = await generateAuthenticationOptions({
    rpID: cfg.rpID,
    allowCredentials: [],
    userVerification: 'preferred',
    timeout: 60000,
  });

  const challengeId = await storeChallenge(env, {
    type: 'authentication',
    challenge: options.challenge,
  });

  return { options, challengeId };
}

// ============================================================================
// Login: FINISH
// ============================================================================

export async function handleLoginFinish(request, env) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { challengeId, assertionResponse, deviceId } = body;
  if (!challengeId || !assertionResponse) {
    return { error: 'challengeId + assertionResponse required', status: 400 };
  }

  const row = await consumeChallenge(env, challengeId, 'authentication');
  if (!row) return { error: 'challenge expired or invalid', status: 400 };

  const credId = assertionResponse.id; // base64url
  const credRow = await env.DB.prepare(
    `SELECT * FROM credentials WHERE id = ?1`,
  )
    .bind(credId)
    .first();
  if (!credRow) return { error: 'unknown credential', status: 400 };

  const origin = request.headers.get('Origin') || '';
  const cfg = getAuthConfig(env, origin);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: row.challenge,
      expectedOrigin: cfg.expectedOrigin,
      expectedRPID: cfg.rpID,
      credential: {
        id: credRow.id,
        publicKey: b64uDecode(credRow.public_key),
        counter: credRow.counter || 0,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.warn('login verify error:', err?.message || err);
    return { error: 'verification failed: ' + (err?.message || err), status: 400 };
  }

  if (!verification.verified) return { error: 'not verified', status: 400 };

  const newCounter = verification.authenticationInfo?.newCounter ?? credRow.counter;
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE credentials SET counter = ?1, last_used_at = ?2 WHERE id = ?3`,
  )
    .bind(newCounter, now, credRow.id)
    .run();

  await env.DB.prepare(`UPDATE users SET last_login_at = ?1 WHERE id = ?2`)
    .bind(now, credRow.user_id)
    .run();

  const userAgent = request.headers.get('User-Agent') || '';
  const session = await createSession(env, credRow.user_id, { deviceId, userAgent });

  // Privyazyvayem tekushchii device k user'u (yesli esche ne privyazan)
  if (deviceId) {
    await env.DB.prepare(
      `UPDATE devices SET user_id = ?1 WHERE id = ?2 AND (user_id IS NULL OR user_id = ?1)`,
    )
      .bind(credRow.user_id, deviceId)
      .run();
    // Zabiraem reminder'y etogo device'a bez user'a \u2014 dlya migratsii starykh deystviy
    await env.DB.prepare(
      `UPDATE reminders SET user_id = ?1 WHERE device_id = ?2 AND user_id IS NULL`,
    )
      .bind(credRow.user_id, deviceId)
      .run();
  }

  const userRow = await env.DB.prepare(`SELECT display_name, lang, news_categories FROM users WHERE id = ?1`)
    .bind(credRow.user_id)
    .first();

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: credRow.user_id,
      displayName: userRow?.display_name || 'Me',
      lang: userRow?.lang || 'ru',
      newsCategories: parseUserNewsCategories(userRow?.news_categories),
    },
  };
}

// ============================================================================
// /api/auth/me
// ============================================================================

export async function handleMe(request, env) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: 'unauthorized', status: 401 };

  const creds = await env.DB.prepare(
    `SELECT id, device_name, created_at, last_used_at FROM credentials WHERE user_id = ?1 ORDER BY created_at DESC`,
  )
    .bind(user.userId)
    .all();

  let newsCategories = [];
  try {
    const rowN = await env.DB.prepare(`SELECT news_categories FROM users WHERE id = ?1`)
      .bind(user.userId)
      .first();
    newsCategories = parseUserNewsCategories(rowN?.news_categories);
  } catch {
    newsCategories = [];
  }

  return {
    user: { id: user.userId, displayName: user.displayName, lang: user.lang, newsCategories },
    credentials: creds.results || [],
  };
}

// ============================================================================
// /api/user/news-categories — kategorii "interesnыkh novostey" dlya push / TG
// ============================================================================

export async function handleSetNewsCategories(request, env) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: 'unauthorized', status: 401 };

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const out = normalizeNewsCategoryIds(body.categories);
  await env.DB.prepare(`UPDATE users SET news_categories = ?1 WHERE id = ?2`)
    .bind(JSON.stringify(out), user.userId)
    .run();

  return { ok: true, newsCategories: out };
}

// ============================================================================
// /api/user/lang — menyayem predpochtitel'nyy yazyk pol'zovatelya
// ============================================================================

export async function handleSetLang(request, env) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: 'unauthorized', status: 401 };

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const rawLang = (body.lang || '').toString().toLowerCase();
  if (!['ru', 'az', 'en'].includes(rawLang)) {
    return { error: 'lang must be one of: ru, az, en', status: 400 };
  }

  await env.DB.prepare(`UPDATE users SET lang = ?1 WHERE id = ?2`)
    .bind(rawLang, user.userId)
    .run();

  return { ok: true, lang: rawLang };
}

// ============================================================================
// /api/auth/logout
// ============================================================================

export async function handleLogout(request, env) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { ok: true };
  await env.DB.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(user.sessionId).run();
  return { ok: true };
}

// ============================================================================
// /api/auth/passkey/add (begin + finish dlya dobavleniya vtoroy passkey)
// ============================================================================

export async function handleAddPasskeyBegin(request, env) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: 'unauthorized', status: 401 };

  cleanupExpiredChallenges(env);
  const origin = request.headers.get('Origin') || '';
  const cfg = getAuthConfig(env, origin);

  const existing = await getCredentialsForUser(env, user.userId);

  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userID: new TextEncoder().encode(user.userId),
    userName: user.displayName || 'Me',
    userDisplayName: user.displayName || 'Me',
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: existing.map((c) => ({
      id: b64uEncode(c.id),
      type: 'public-key',
      transports: c.transports,
    })),
    timeout: 60000,
  });

  const challengeId = await storeChallenge(env, {
    type: 'registration',
    challenge: options.challenge,
    userId: user.userId,
  });

  return { options, challengeId };
}

export async function handleAddPasskeyFinish(request, env) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: 'unauthorized', status: 401 };

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { challengeId, attestationResponse } = body;
  if (!challengeId || !attestationResponse) {
    return { error: 'challengeId + attestationResponse required', status: 400 };
  }

  const row = await consumeChallenge(env, challengeId, 'registration');
  if (!row || row.user_id !== user.userId) {
    return { error: 'challenge expired or invalid', status: 400 };
  }

  const origin = request.headers.get('Origin') || '';
  const cfg = getAuthConfig(env, origin);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: row.challenge,
      expectedOrigin: cfg.expectedOrigin,
      expectedRPID: cfg.rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    return { error: 'verification failed: ' + (err?.message || err), status: 400 };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { error: 'not verified', status: 400 };
  }

  const { credential } = verification.registrationInfo;
  const credId = credential.id;
  const publicKeyB64 = b64uEncode(credential.publicKey);
  const counter = credential.counter || 0;
  const transports = attestationResponse.response?.transports || null;

  const userAgent = request.headers.get('User-Agent') || '';
  const deviceName = guessDeviceName(userAgent);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO credentials (id, user_id, public_key, counter, transports, device_name, created_at, last_used_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  )
    .bind(
      credId,
      user.userId,
      publicKeyB64,
      counter,
      transports ? JSON.stringify(transports) : null,
      deviceName,
      now,
    )
    .run();

  return { ok: true };
}

// ============================================================================
// Remove passkey
// ============================================================================

export async function handleRemovePasskey(request, env, credId) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: 'unauthorized', status: 401 };

  // Ne dayom udalit' posledniy passkey (polzovatelь zalokautit sebya)
  const { results: creds } = await env.DB.prepare(
    `SELECT id FROM credentials WHERE user_id = ?1`,
  )
    .bind(user.userId)
    .all();
  if ((creds || []).length <= 1) {
    return { error: 'last passkey cannot be removed', status: 400 };
  }

  await env.DB.prepare(
    `DELETE FROM credentials WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(credId, user.userId)
    .run();
  return { ok: true };
}
