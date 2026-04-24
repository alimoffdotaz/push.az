import { db, config } from '/db.js';
import {
  t,
  getLang,
  setLang,
  onLangChange,
  detectBrowserLang,
  localeFor,
  applyTranslations,
  SUPPORTED_LANGS,
} from '/i18n.js';

/** Продакшен API. Меняется только при смене воркера в Cloudflare. */
const DEFAULT_WORKER_URL = 'https://push-az-worker.ayxan-a.workers.dev';

// ============================================================================
// State
// ============================================================================

const state = {
  reminders: [],
  tickTimer: null,
  triggerSupported: 'Notification' in self && 'showTrigger' in Notification.prototype,
  online: navigator.onLine,
  workerUrl: '',
  deviceId: '',
  pushSubscribed: false,
  vapidPublicKey: '',
  takeoverActive: false,
  syncing: false,
  sessionToken: '',
  user: null, // { id, displayName }
};

// ============================================================================
// DOM refs
// ============================================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const form = $('#reminder-form');
const titleEl = $('#title');
const noteEl = $('#note');
const whenEl = $('#when');
const repeatEl = $('#repeat');
const toneEl = $('#tone');
const listEl = $('#reminders-list');
const pastListEl = $('#past-list');
const pastSection = $('#past-section');
const emptyState = $('#empty-state');
const countBadge = $('#count-badge');
const banner = $('#status-banner');
const permissionBtn = $('#permission-btn');
const tpl = $('#reminder-item-template');
const toastRoot = $('#toast-root');
const settingsBtn = $('#settings-btn');
const settingsDialog = $('#settings-dialog');
const settingsForm = $('#settings-form');
const pushStatusPill = $('#push-status-pill');
const takeoverEl = $('#takeover');
const takeoverTitle = $('#takeover-title');
const takeoverNote = $('#takeover-note');
const takeoverCounter = $('#takeover-counter');
const takeoverSnooze = $('#takeover-snooze');
const takeoverChallengePrompt = $('#takeover-challenge-prompt');
const takeoverChallengeButtons = $('#takeover-challenge-buttons');
const takeoverChallengeHint = $('#takeover-challenge-hint');

// ============================================================================
// Constants
// ============================================================================

function repeatLabel(repeat) {
  if (!repeat || repeat === 'none') return '';
  return t('repeat.' + repeat);
}

const TONE_EMOJI = { friendly: '\ud83d\udc9c', urgent: '\u26a1', funny: '\ud83d\ude06', aggressive: '\ud83d\udd25' };
function toneLabel(tone) { return t('tone.' + (tone || 'friendly')); }

// ============================================================================
// Utilities
// ============================================================================

// Режим отладки: ?debug=1 в URL или localStorage.setItem('push_az_debug','1')
function isAppDebug() {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    if (q && (q.get('debug') === '1' || q.get('debug') === 'true')) return true;
    return localStorage.getItem('push_az_debug') === '1';
  } catch {
    return false;
  }
}

function debugLog(...args) {
  if (isAppDebug()) console.log('[push.az]', ...args);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function toast(message, variant = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (variant ? ' ' + variant : '');
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

function setBanner(text, variant) {
  if (!text) {
    banner.hidden = true;
    banner.textContent = '';
    banner.className = 'banner';
    return;
  }
  banner.hidden = false;
  banner.className = 'banner ' + (variant || '');
  banner.textContent = text;
}

function formatWhen(ts) {
  return new Date(ts).toLocaleString(localeFor(getLang()), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeLabel(ts) {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const hr = Math.round(abs / 3600000);
  const day = Math.round(abs / 86400000);
  let label;
  if (min < 1) return diff < 0 ? t('rel.overdue', { label: t('rel.now') }) : t('rel.now');
  else if (min < 60) label = t('rel.min', { n: min });
  else if (hr < 24) label = t('rel.hour', { n: hr });
  else label = t('rel.day', { n: day });
  return diff < 0 ? t('rel.overdue', { label }) : t('rel.in', { label });
}

function relativeClass(ts) {
  const diff = ts - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 60 * 60 * 1000) return 'soon';
  return '';
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes())
  );
}

function setMinDateTime() {
  if (!whenEl) return;
  const now = new Date();
  now.setSeconds(0, 0);
  const minStr = toLocalInputValue(now);
  whenEl.min = minStr;
  const cur = whenEl.value;
  if (!cur) {
    const suggested = new Date(now.getTime() + 5 * 60000);
    whenEl.value = toLocalInputValue(suggested);
    return;
  }
  // Строка ISO-подобного локального времени сравнивается лексикографически с min.
  if (cur < minStr) {
    const bump = new Date(now.getTime() + 60000);
    whenEl.value = toLocalInputValue(bump);
  }
}

function nextFireAt(reminder) {
  if (reminder.repeat === 'none') return reminder.fireAt;
  const now = Date.now();
  let t = reminder.fireAt;
  while (t <= now) {
    const d = new Date(t);
    if (reminder.repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (reminder.repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (reminder.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    t = d.getTime();
  }
  return t;
}

function b64uToUint8(b64u) {
  const pad = b64u.length % 4;
  const padded = pad ? b64u + '='.repeat(4 - pad) : b64u;
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function uint8ToB64u(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================================================
// Config / Device ID
// ============================================================================

async function initConfig() {
  let deviceId = await config.get('deviceId');
  if (!deviceId) {
    deviceId = 'dev_' + uid() + uid();
    await config.set('deviceId', deviceId);
  }
  state.deviceId = deviceId;
  const base = DEFAULT_WORKER_URL.replace(/\/+$/, '');
  state.workerUrl = base;
  try {
    await config.set('workerUrl', base);
  } catch {}
  state.vapidPublicKey = await config.get('vapidPublicKey', '');
  state.sessionToken = await config.get('sessionToken', '');
  state.user = await config.get('user', null);

  const savedLang = await config.get('lang', null);
  const initialLang = savedLang || (state.user && state.user.lang) || detectBrowserLang();
  setLang(initialLang);
  if (!savedLang) { try { await config.set('lang', initialLang); } catch {} }
  applyTranslations();
  onLangChange(() => { applyTranslations(); render(); });
}

async function changeLang(lang, opts = {}) {
  const L = String(lang || '').trim().toLowerCase();
  if (!SUPPORTED_LANGS.includes(L)) return;
  setLang(L);
  try { await config.set('lang', L); } catch {}
  if (!opts.skipServer && state.workerUrl && state.sessionToken) {
    try { await api('/api/user/lang', { method: 'POST', body: { lang: L } }); } catch {}
  }
}

// ============================================================================
// Backend API
// ============================================================================

async function api(path, options = {}) {
  if (!state.workerUrl) throw new Error('WORKER_URL_NOT_SET');
  const headers = {
    'X-Device-Id': state.deviceId,
    ...(state.sessionToken ? { Authorization: 'Bearer ' + state.sessionToken } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(state.workerUrl + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    // 401 \u2014 sessiya umerla, sbrosim token chtob ushyol na auth ekran
    if (res.status === 401 && state.sessionToken) {
      await clearSession();
      renderAuthScreen();
    }
    const err = new Error(data?.error || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ============================================================================
// Auth (WebAuthn / Passkey)
// ============================================================================

function b64uToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Konvertiruem "publicKeyCredentialCreationOptions" iz servera (strokovye b64url)
// v format chto khochet navigator.credentials.create
function prepRegisterOptions(opts) {
  const out = { ...opts };
  out.challenge = b64uToBytes(opts.challenge);
  out.user = { ...opts.user, id: b64uToBytes(opts.user.id) };
  if (Array.isArray(opts.excludeCredentials)) {
    out.excludeCredentials = opts.excludeCredentials.map((c) => ({
      ...c,
      id: b64uToBytes(c.id),
    }));
  }
  return out;
}

function prepGetOptions(opts) {
  const out = { ...opts };
  out.challenge = b64uToBytes(opts.challenge);
  if (Array.isArray(opts.allowCredentials)) {
    out.allowCredentials = opts.allowCredentials.map((c) => ({
      ...c,
      id: b64uToBytes(c.id),
    }));
  }
  return out;
}

function serializeRegisterCredential(cred) {
  return {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bytesToB64u(cred.response.attestationObject),
      clientDataJSON: bytesToB64u(cred.response.clientDataJSON),
      transports: cred.response.getTransports ? cred.response.getTransports() : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    authenticatorAttachment: cred.authenticatorAttachment,
  };
}

function serializeAuthCredential(cred) {
  return {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bytesToB64u(cred.response.authenticatorData),
      clientDataJSON: bytesToB64u(cred.response.clientDataJSON),
      signature: bytesToB64u(cred.response.signature),
      userHandle: cred.response.userHandle ? bytesToB64u(cred.response.userHandle) : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    authenticatorAttachment: cred.authenticatorAttachment,
  };
}

function isPasskeySupported() {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}

async function saveSession(token, user) {
  state.sessionToken = token;
  state.user = user;
  await config.set('sessionToken', token);
  await config.set('user', user);
}

async function clearSession() {
  state.sessionToken = '';
  state.user = null;
  await config.set('sessionToken', '');
  await config.set('user', null);
}

async function registerNewAccount(displayName) {
  if (!state.workerUrl) throw new Error(t('err.worker_not_configured'));
  if (!isPasskeySupported()) throw new Error(t('err.passkey_unsupported'));

  const beginRes = await fetch(state.workerUrl + '/api/auth/register/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: displayName || 'Me', lang: getLang() }),
  });
  if (!beginRes.ok) {
    const j = await beginRes.json().catch(() => ({}));
    throw new Error(j.error || 'register begin failed: HTTP ' + beginRes.status);
  }
  const { options, challengeId } = await beginRes.json();

  const publicKey = prepRegisterOptions(options);
  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error(t('err.passkey_cancelled'));

  const finishRes = await fetch(state.workerUrl + '/api/auth/register/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId,
      attestationResponse: serializeRegisterCredential(cred),
      deviceId: state.deviceId,
      lang: getLang(),
    }),
  });
  if (!finishRes.ok) {
    const j = await finishRes.json().catch(() => ({}));
    throw new Error(j.error || 'register finish failed: HTTP ' + finishRes.status);
  }
  const data = await finishRes.json();
  await saveSession(data.token, data.user);
  return data;
}

async function loginPasskey() {
  if (!state.workerUrl) throw new Error(t('err.worker_not_configured'));
  if (!isPasskeySupported()) throw new Error(t('err.passkey_unsupported'));

  const beginRes = await fetch(state.workerUrl + '/api/auth/login/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!beginRes.ok) {
    const j = await beginRes.json().catch(() => ({}));
    throw new Error(j.error || 'login begin failed: HTTP ' + beginRes.status);
  }
  const { options, challengeId } = await beginRes.json();

  const publicKey = prepGetOptions(options);
  const cred = await navigator.credentials.get({ publicKey });
  if (!cred) throw new Error(t('err.passkey_cancelled'));

  const finishRes = await fetch(state.workerUrl + '/api/auth/login/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId,
      assertionResponse: serializeAuthCredential(cred),
      deviceId: state.deviceId,
    }),
  });
  if (!finishRes.ok) {
    const j = await finishRes.json().catch(() => ({}));
    throw new Error(j.error || 'login finish failed: HTTP ' + finishRes.status);
  }
  const data = await finishRes.json();
  await saveSession(data.token, data.user);
  return data;
}

async function addPasskeyToAccount() {
  if (!state.sessionToken) throw new Error(t('err.unauthorized'));
  const beginRes = await api('/api/auth/passkey/add/begin', { method: 'POST', body: {} });
  const { options, challengeId } = beginRes;

  const publicKey = prepRegisterOptions(options);
  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error(t('err.passkey_cancelled'));

  await api('/api/auth/passkey/add/finish', {
    method: 'POST',
    body: {
      challengeId,
      attestationResponse: serializeRegisterCredential(cred),
    },
  });
}

// ============================================================================
// Auth screen UI
// ============================================================================

function setAuthStatus(msg, kind) {
  const el = document.getElementById('auth-status');
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; el.className = 'auth-status'; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = 'auth-status ' + (kind || 'pending');
}

function setAuthActionsDisabled(disabled) {
  const loginBtn = document.getElementById('auth-login-btn');
  const form = document.getElementById('auth-register-form');
  if (loginBtn) loginBtn.disabled = disabled;
  if (form) {
    Array.from(form.elements).forEach((el) => { el.disabled = disabled; });
  }
}

function renderAuthScreen() {
  const screen = document.getElementById('auth-screen');
  if (!screen) return;
  screen.hidden = false;
  document.body.style.overflow = 'hidden';
  setAuthStatus('', null);
}

function hideAuthScreen() {
  const screen = document.getElementById('auth-screen');
  if (screen) screen.hidden = true;
  document.body.style.overflow = '';
}

function setupAuthScreen() {
  const loginBtn = document.getElementById('auth-login-btn');
  const registerForm = document.getElementById('auth-register-form');
  const displayNameEl = document.getElementById('auth-display-name');

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      setAuthActionsDisabled(true);
      setAuthStatus(t('auth.checking_passkey'), 'pending');
      try {
        const data = await loginPasskey();
        setAuthStatus(t('auth.welcome'), 'success');
        await afterLoginSuccess(data.user);
      } catch (err) {
        console.warn('login error', err);
        setAuthStatus(String(err?.message || err), 'error');
      } finally {
        setAuthActionsDisabled(false);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (displayNameEl?.value || '').trim() || 'Me';
      setAuthActionsDisabled(true);
      setAuthStatus(t('auth.creating'), 'pending');
      try {
        const data = await registerNewAccount(name);
        setAuthStatus(t('auth.created'), 'success');
        await afterLoginSuccess(data.user);
      } catch (err) {
        console.warn('register error', err);
        setAuthStatus(String(err?.message || err), 'error');
      } finally {
        setAuthActionsDisabled(false);
      }
    });
  }

  const authLangSel = document.getElementById('auth-lang');
  if (authLangSel) {
    authLangSel.value = getLang();
    authLangSel.addEventListener('change', async () => {
      await changeLang(authLangSel.value);
    });
  }
}

async function afterLoginSuccess(user) {
  hideAuthScreen();
  if (user?.lang && SUPPORTED_LANGS.includes(user.lang) && user.lang !== getLang()) {
    await changeLang(user.lang, { skipServer: true });
  }
  toast(t('acc.hello', { name: user?.displayName || 'friend' }), 'success');

  if (Notification.permission === 'granted') {
    await ensurePushSubscription();
  }
  updatePushStatusPill();
  await updatePermissionUI();
  await syncAllReminders();
  render();
}

function renderAccountSection() {
  const box = document.getElementById('settings-account');
  if (!box) return;
  if (!state.user) { box.hidden = true; return; }
  box.hidden = false;
  const nameEl = document.getElementById('settings-user-name');
  const subEl = document.getElementById('settings-user-sub');
  if (nameEl) nameEl.textContent = state.user.displayName || 'User';
  if (subEl) subEl.textContent = 'ID: ' + (state.user.id || '').slice(0, 12) + '…';
}

// ============================================================================
// Telegram privyazka
// ============================================================================

let tgLinkCurrentCode = null;

async function renderTelegramSection() {
  const box = document.getElementById('settings-telegram');
  if (!box) return;
  if (!state.user || !state.workerUrl) { box.hidden = true; return; }
  box.hidden = false;

  const empty = document.getElementById('settings-tg-empty');
  const codeBlock = document.getElementById('settings-tg-code');
  const linked = document.getElementById('settings-tg-linked');

  const hintEl = document.getElementById('settings-tg-hint');
  const chipEl = document.getElementById('settings-tg-chip');

  const setTgPromoVisible = (visible) => {
    if (hintEl) hintEl.hidden = !visible;
    if (chipEl) chipEl.hidden = !visible;
  };

  if (tgLinkCurrentCode) {
    if (empty) empty.hidden = true;
    if (linked) linked.hidden = true;
    if (codeBlock) codeBlock.hidden = false;
    setTgPromoVisible(false);
    return;
  }

  // Zapraw status
  try {
    const resp = await api('/api/telegram/status', { method: 'GET' });
    const links = resp?.links || [];
    if (links.length) {
      if (empty) empty.hidden = true;
      if (codeBlock) codeBlock.hidden = true;
      if (linked) linked.hidden = false;
      setTgPromoVisible(false);
      renderTgLinksList(links);
    } else {
      if (empty) empty.hidden = false;
      if (codeBlock) codeBlock.hidden = true;
      if (linked) linked.hidden = true;
      setTgPromoVisible(true);
    }
  } catch (err) {
    if (empty) empty.hidden = false;
    setTgPromoVisible(true);
  }
}

function renderTgLinksList(links) {
  const ul = document.getElementById('tg-links-list');
  if (!ul) return;
  ul.innerHTML = '';
  for (const l of links) {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'tg-meta';
    const name = document.createElement('strong');
    name.textContent = l.first_name || (l.username ? '@' + l.username : 'chat #' + l.chat_id);
    const since = document.createElement('small');
    since.textContent = t('tg.linked_since', { date: new Date(l.linked_at).toLocaleDateString(localeFor(getLang())) });
    meta.appendChild(name);
    meta.appendChild(since);
    li.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'tg-unlink-btn';
    btn.textContent = t('tg.unlink');
    btn.addEventListener('click', async () => {
      try {
        await api('/api/telegram/links/' + l.chat_id, { method: 'DELETE' });
        toast(t('tg.toast_unlinked'), 'success');
        await renderTelegramSection();
      } catch (err) {
        toast(t('err.generic', { err: err?.message || err }), 'error');
      }
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

async function startTelegramLink() {
  try {
    const resp = await api('/api/telegram/link/begin', { method: 'POST', body: {} });
    tgLinkCurrentCode = resp.code;
    const codeValue = document.getElementById('tg-code-value');
    const deepLink = document.getElementById('tg-deep-link');
    const botName = document.getElementById('tg-bot-username');
    const cmd = document.getElementById('tg-link-cmd');

    if (codeValue) codeValue.textContent = resp.code;
    if (deepLink) deepLink.href = resp.deepLink;
    if (botName) botName.textContent = '@' + (resp.botUsername || 'push_az_bot');
    if (cmd) cmd.textContent = '/link ' + resp.code;

    await renderTelegramSection();
  } catch (err) {
    toast(t('err.generic', { err: err?.message || err }), 'error');
  }
}

async function checkTelegramLinked() {
  try {
    const resp = await api('/api/telegram/status', { method: 'GET' });
    const links = resp?.links || [];
    if (links.length) {
      tgLinkCurrentCode = null;
      toast(t('tg.toast_linked'), 'success');
      await renderTelegramSection();
    } else {
      toast(t('tg.toast_not_yet'), 'error');
    }
  } catch (err) {
    toast(t('err.generic', { err: err?.message || err }), 'error');
  }
}

function cancelTelegramLink() {
  tgLinkCurrentCode = null;
  renderTelegramSection();
}

function setupTelegramButtons() {
  const linkBtn = document.getElementById('tg-link-btn');
  const addMoreBtn = document.getElementById('tg-add-more-btn');
  const checkBtn = document.getElementById('tg-check-btn');
  const cancelBtn = document.getElementById('tg-cancel-btn');

  if (linkBtn) linkBtn.addEventListener('click', startTelegramLink);
  if (addMoreBtn) addMoreBtn.addEventListener('click', startTelegramLink);
  if (checkBtn) checkBtn.addEventListener('click', checkTelegramLinked);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelTelegramLink);
}

async function logoutCurrentUser() {
  try {
    if (state.sessionToken) await api('/api/auth/logout', { method: 'POST', body: {} });
  } catch {}
  state.pushSubscribed = false;
  await clearSession();
  // Ochistim lokal'nye reminder'y (chuzhoy account mozhet voyti na etom device)
  try {
    await db.clear();
  } catch {}
  state.reminders = [];
  render();
}

// ============================================================================
// Push subscription
// ============================================================================

async function ensurePushSubscription() {
  if (!state.workerUrl) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  if (!state.vapidPublicKey) {
    try {
      const resp = await api('/api/vapid-public-key', { method: 'GET' });
      if (resp?.publicKey) {
        state.vapidPublicKey = resp.publicKey;
        await config.set('vapidPublicKey', state.vapidPublicKey);
      }
    } catch (err) {
      console.warn('Could not fetch VAPID public key:', err);
      return false;
    }
  }

  if (!state.vapidPublicKey) return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  const expectedKey = state.vapidPublicKey;
  if (sub) {
    const currentKey = sub.options?.applicationServerKey
      ? uint8ToB64u(sub.options.applicationServerKey)
      : '';
    if (currentKey && currentKey !== expectedKey) {
      await sub.unsubscribe();
      sub = null;
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToUint8(expectedKey),
      });
    } catch (err) {
      console.warn('pushManager.subscribe failed:', err);
      return false;
    }
  }

  const subJSON = sub.toJSON();
  await api('/api/subscribe', {
    method: 'POST',
    body: {
      subscription: {
        endpoint: subJSON.endpoint,
        keys: { p256dh: subJSON.keys.p256dh, auth: subJSON.keys.auth },
      },
    },
  });

  state.pushSubscribed = true;
  updatePushStatusPill();
  return true;
}

function updatePushStatusPill() {
  if (!pushStatusPill) return;
  if (!state.workerUrl) {
    pushStatusPill.textContent = t('status.offline');
    pushStatusPill.className = 'pill pill-muted';
    return;
  }
  if (state.pushSubscribed) {
    pushStatusPill.textContent = t('status.active');
    pushStatusPill.className = 'pill pill-success';
  } else {
    pushStatusPill.textContent = t('status.not_configured');
    pushStatusPill.className = 'pill pill-warning';
  }
}

// ============================================================================
// Sync: local \u2194 backend
// ============================================================================

async function syncReminderToBackend(r) {
  if (!state.workerUrl) return;
  try {
    await api('/api/reminders', {
      method: 'POST',
      body: {
        id: r.id,
        title: r.title,
        note: r.note || '',
        fireAt: r.fireAt,
        repeat: r.repeat || 'none',
        tone: r.tone || 'friendly',
      },
    });
  } catch (err) {
    console.warn('sync reminder failed:', err);
  }
}

async function syncDeleteReminderToBackend(id) {
  if (!state.workerUrl) return;
  try {
    await api('/api/reminders/' + id, { method: 'DELETE' });
  } catch (err) {
    console.warn('sync delete failed:', err);
  }
}

async function syncAckToBackend(reminderId, action = 'done', minutes = 10) {
  if (!state.workerUrl) return;
  try {
    await api('/api/ack', {
      method: 'POST',
      body: { reminderId, action, minutes },
    });
  } catch (err) {
    console.warn('sync ack failed:', err);
  }
}

async function syncAllReminders() {
  if (!state.workerUrl || state.syncing) return;
  if (!state.sessionToken) return;
  state.syncing = true;
  try {
    // 1) Pull from server (vse user reminder'y so vsekh device'ev)
    try {
      const resp = await api('/api/reminders', { method: 'GET' });
      const serverRems = Array.isArray(resp?.reminders) ? resp.reminders : [];
      const byId = new Map();
      for (const s of serverRems) {
        byId.set(s.id, {
          id: s.id,
          title: s.title,
          note: s.note || '',
          fireAt: Number(s.fire_at),
          repeat: s.repeat || 'none',
          tone: s.tone || 'friendly',
          status: s.status || 'active',
          acked: s.status === 'acked' || !!s.acked_at,
          updatedAt: Number(s.updated_at) || Date.now(),
          createdAt: Number(s.created_at) || Date.now(),
        });
      }

      const localAll = await db.getAll();
      const localById = new Map(localAll.map((r) => [r.id, r]));

      // Mergiaem: server = truth dlya chuzhikh device'ev. Lokalno — svezhee po updatedAt.
      for (const [id, sRem] of byId) {
        const local = localById.get(id);
        if (!local || (local.updatedAt || 0) < sRem.updatedAt) {
          await db.put(sRem);
        }
      }
      // Udalyaem lokalnye reminder'y, kotorykh bolshe net na servere (udaleno s drugogo ustr.)
      for (const l of localAll) {
        if (!byId.has(l.id)) {
          await db.delete(l.id);
        }
      }
      state.reminders = (await db.getAll()) || [];
      state.reminders.sort((a, b) => a.fireAt - b.fireAt);
      render();
      checkTakeover();
    } catch (err) {
      console.warn('sync pull failed', err);
    }

    // 2) Push local (dlya noviklyx reminder'ev, sozdannykh offline)
    for (const r of state.reminders) {
      try { await syncReminderToBackend(r); } catch {}
    }
  } finally {
    state.syncing = false;
  }
}

// ============================================================================
// Reminder CRUD
// ============================================================================

async function load() {
  state.reminders = (await db.getAll()) || [];
  state.reminders.sort((a, b) => a.fireAt - b.fireAt);
  render();
}

/** Napominaniya, trebuyuschiye reaktsii: propushchennye (missed) ili vremya uzhe proshlo. */
function countAttentionReminders(reminders, now = Date.now()) {
  let n = 0;
  for (const r of reminders) {
    if (r.acked) continue;
    if (r.status === 'missed' || r.fireAt <= now) n++;
  }
  return n;
}

function render() {
  const now = Date.now();
  const upcoming = [];
  const past = [];
  for (const r of state.reminders) {
    if (r.fireAt >= now - 60 * 1000 || r.repeat !== 'none') upcoming.push(r);
    else past.push(r);
  }
  const overdue = countAttentionReminders(state.reminders, now);

  listEl.innerHTML = '';
  upcoming.forEach((r) => listEl.appendChild(renderItem(r)));
  emptyState.hidden = upcoming.length > 0;
  countBadge.textContent = String(upcoming.length);

  if (past.length) {
    pastSection.hidden = false;
    pastListEl.innerHTML = '';
    past.slice().reverse().slice(0, 20).forEach((r) => pastListEl.appendChild(renderItem(r, true)));
  } else {
    pastSection.hidden = true;
  }

  updateAppBadge(overdue);
}

// ============================================================================
// App Badge API \u2014 schyotchik prosrochennykh na ikonke PWA
// ============================================================================

async function updateAppBadge(count) {
  try {
    if (count > 0) {
      if (navigator.setAppBadge) await navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      await navigator.clearAppBadge();
    }
  } catch {
    // unsupported \u2014 ignore
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.active) {
      reg.active.postMessage({ type: 'set-badge', count });
    }
  } catch {
    // ignore
  }
  try {
    document.title = count > 0 ? `(${count}) \u26a0 push.az \u2014 propuschen` : 'push.az \u2014 Osobyy Reminder';
  } catch {}
  updateAlertFavicon(count > 0);
  updateAlertBodyClass(count > 0);
}

// Podmenyaem favicon na alert-ikonku kogda yest' propushchennye reminderу.
// Menyaem href u <link rel="icon"> elementov.
let _alertFaviconActive = null;
const _originalFaviconHrefs = new Map();
function updateAlertFavicon(alert) {
  if (_alertFaviconActive === alert) return;
  _alertFaviconActive = alert;
  try {
    const links = document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
    links.forEach((link) => {
      if (!_originalFaviconHrefs.has(link)) {
        _originalFaviconHrefs.set(link, link.getAttribute('href'));
      }
      if (alert) {
        // Podbor alternativy po tipu
        const type = (link.getAttribute('type') || '').toLowerCase();
        const rel = link.getAttribute('rel') || '';
        if (rel === 'apple-touch-icon') {
          link.setAttribute('href', '/icons/icon-alert-512.png');
        } else if (type.includes('svg')) {
          link.setAttribute('href', '/icons/icon-alert.svg');
        } else {
          link.setAttribute('href', '/icons/icon-alert-512.png');
        }
      } else {
        const orig = _originalFaviconHrefs.get(link);
        if (orig) link.setAttribute('href', orig);
      }
    });
  } catch {}
}

function updateAlertBodyClass(alert) {
  try {
    document.body.classList.toggle('has-overdue', !!alert);
  } catch {}
}

function renderItem(r, isPast = false) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = r.id;
  node.querySelector('.reminder-title').textContent = r.title;

  const noteEl = node.querySelector('.reminder-note');
  if (r.note) {
    noteEl.textContent = r.note;
    noteEl.hidden = false;
  }

  const repeatEl = node.querySelector('.reminder-repeat');
  if (r.repeat && r.repeat !== 'none') {
    repeatEl.textContent = repeatLabel(r.repeat);
    repeatEl.hidden = false;
  }

  const toneEl = node.querySelector('.reminder-tone');
  if (toneEl && r.tone) {
    toneEl.textContent = TONE_EMOJI[r.tone] + ' ' + toneLabel(r.tone);
    toneEl.hidden = false;
  }

  node.querySelector('.reminder-time').textContent = formatWhen(r.fireAt);
  const rel = node.querySelector('.reminder-relative');
  rel.textContent = '\u00b7 ' + relativeLabel(r.fireAt);
  const cls = relativeClass(r.fireAt);
  if (cls) rel.classList.add(cls);

  if (isPast) {
    const snoozeBtn = node.querySelector('[data-action="snooze"]');
    if (snoozeBtn) snoozeBtn.hidden = true;
  }

  applyTranslations(node);
  node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteReminder(r.id));
  const snoozeBtn = node.querySelector('[data-action="snooze"]');
  if (snoozeBtn) snoozeBtn.addEventListener('click', () => snoozeReminder(r.id, 10));

  return node;
}

async function addReminder(e) {
  e.preventDefault();
  debugLog('addReminder start', { when: whenEl?.value, titleLen: (titleEl?.value || '').length });
  setMinDateTime();
  if (form && typeof form.reportValidity === 'function' && !form.reportValidity()) {
    debugLog('addReminder aborted: reportValidity');
    return;
  }
  const title = (titleEl?.value || '').trim();
  const note = (noteEl?.value || '').trim();
  const whenStr = whenEl?.value || '';
  const repeat = repeatEl?.value || 'none';
  const tone = toneEl ? toneEl.value : 'friendly';
  if (!title) {
    toast(t('toast.compose_title'), 'error');
    return;
  }
  if (!whenStr) {
    toast(t('toast.compose_when'), 'error');
    return;
  }

  const fireAt = new Date(whenStr).getTime();
  if (isNaN(fireAt)) {
    toast(t('toast.bad_date'), 'error');
    return;
  }
  if (fireAt <= Date.now() - 60000 && repeat === 'none') {
    toast(t('toast.time_passed'), 'error');
    return;
  }

  const reminder = {
    id: uid(),
    title,
    note,
    fireAt,
    repeat,
    tone,
    createdAt: Date.now(),
  };

  try {
    await db.put(reminder);
    state.reminders.push(reminder);
    state.reminders.sort((a, b) => a.fireAt - b.fireAt);
    await scheduleLocalNotification(reminder);
    syncReminderToBackend(reminder);
    render();
    form.reset();
    if (toneEl) toneEl.value = tone;
    setMinDateTime();
    closeComposer();
    debugLog('addReminder ok', { id: reminder.id });
    toast(t('toast.created'), 'success');
  } catch (err) {
    console.error('addReminder', err);
    toast(t('err.generic', { err: err?.message || err }), 'error');
  }
}

const composerDialog = document.getElementById('composer-dialog');

function openComposer() {
  if (!composerDialog) return;
  composerDialog.removeAttribute('hidden');
  setMinDateTime();
  if (typeof composerDialog.showModal === 'function') {
    try {
      composerDialog.showModal();
    } catch (err) {
      console.warn('[push.az] showModal failed', err);
      composerDialog.hidden = false;
    }
  } else {
    composerDialog.hidden = false;
  }
  debugLog('composer open', { dialogOpen: composerDialog.open, when: whenEl?.value });
  setTimeout(() => titleEl?.focus(), 50);
}

function closeComposer() {
  if (!composerDialog) return;
  const nativeDialog =
    typeof composerDialog.showModal === 'function' && typeof composerDialog.close === 'function';
  if (nativeDialog) {
    try {
      if (composerDialog.open) composerDialog.close();
    } catch (err) {
      debugLog('composer close() error', err);
    }
    // Важно: не ставить hidden на <dialog> при повторном вызове close (open уже false),
    // иначе второй showModal() перестаёт показывать модалку (Safari/WebKit).
    composerDialog.removeAttribute('hidden');
    debugLog('composer close', { dialogOpen: composerDialog.open });
    return;
  }
  composerDialog.hidden = true;
}

async function deleteReminder(id) {
  await db.delete(id);
  state.reminders = state.reminders.filter((r) => r.id !== id);
  await cancelLocalNotification(id);
  syncDeleteReminderToBackend(id);
  render();
  toast(t('toast.deleted'));
}

async function snoozeReminder(id, minutes) {
  const r = state.reminders.find((x) => x.id === id);
  if (!r) return;
  r.fireAt = Date.now() + minutes * 60000;
  await db.put(r);
  state.reminders.sort((a, b) => a.fireAt - b.fireAt);
  await scheduleLocalNotification(r);
  syncAckToBackend(id, 'snooze', minutes);
  render();
  toast(t('toast.snoozed', { n: minutes }));
}

// ============================================================================
// Local notifications (fallback, kogda bekend ne podklyuchen)
// ============================================================================

async function scheduleLocalNotification(r) {
  if (Notification.permission !== 'granted') return;
  if (!state.triggerSupported) return;
  const reg = await navigator.serviceWorker.ready;
  try {
    await cancelLocalNotification(r.id);
    const fireAt = nextFireAt(r);
    await reg.showNotification(r.title, {
      body: r.note || t('notify.default_body'),
      tag: 'push-az-local-' + r.id,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      showTrigger: new TimestampTrigger(fireAt),
      data: { id: r.id, repeat: r.repeat, fireAt, local: true },
      renotify: true,
      requireInteraction: true,
    });
  } catch (err) {
    console.warn('Local trigger schedule failed', err);
  }
}

async function cancelLocalNotification(id) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const notes = await reg.getNotifications({
    tag: 'push-az-local-' + id,
    includeTriggered: true,
  });
  notes.forEach((n) => n.close());
}

function startTick() {
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = setInterval(tickUpdate, 15000);
  tickUpdate();
}

function tickUpdate() {
  for (const node of listEl.children) {
    const id = node.dataset.id;
    const r = state.reminders.find((x) => x.id === id);
    if (!r) continue;
    const rel = node.querySelector('.reminder-relative');
    rel.textContent = '\u00b7 ' + relativeLabel(r.fireAt);
    rel.classList.remove('soon', 'overdue');
    const cls = relativeClass(r.fireAt);
    if (cls) rel.classList.add(cls);
  }
  checkTakeover();
  updateAppBadge(countAttentionReminders(state.reminders, Date.now()));
}

// ============================================================================
// Takeover screen \u2014 polnoekrannoye napominaniye poka ne nazhmesh' "Gotovo"
// ============================================================================

function checkTakeover() {
  if (state.takeoverActive) return;
  const now = Date.now();
  // Forsiruyem takeover dlya vsekh unacked reminders (vklyuchaya repeat),
  // yesli ikh fire_at proshyol ot 0 do 24 chasov nazad.
  const overdue = state.reminders
    .filter((r) => !r.acked)
    .filter((r) => r.fireAt <= now && (now - r.fireAt) < 24 * 60 * 60 * 1000)
    .sort((a, b) => a.fireAt - b.fireAt);
  if (overdue.length && document.visibilityState === 'visible') {
    showTakeover(overdue[0], overdue.length);
  }
}

function showTakeover(r, totalCount) {
  if (!takeoverEl) return;
  state.takeoverActive = true;
  takeoverTitle.textContent = r.title;
  takeoverNote.textContent = r.note || '';
  takeoverNote.hidden = !r.note;
  takeoverCounter.textContent = totalCount > 1 ? t('takeover.more', { n: totalCount - 1 }) : '';
  takeoverCounter.hidden = totalCount <= 1;
  takeoverEl.dataset.reminderId = r.id;
  takeoverEl.hidden = false;
  takeoverEl.classList.add('active');
  renderChallenge(false);
  if (navigator.vibrate) {
    try { navigator.vibrate([120, 60, 120, 60, 200]); } catch {}
  }
}

function hideTakeover() {
  if (!takeoverEl) return;
  takeoverEl.classList.remove('active');
  takeoverEl.hidden = true;
  state.takeoverActive = false;
  setTimeout(() => checkTakeover(), 400);
}

const CHALLENGE_LETTER_COUNT = 3;

/** Pervyye N bukv iz nazvaniya (Unicode \p{L}), lower case. Pustaya stroka esli bukv net. */
function letterAnswerFromTitle(title) {
  const out = [];
  for (const ch of String(title || '').normalize('NFC').trim()) {
    if (/\p{L}/u.test(ch)) out.push(ch.toLocaleLowerCase('und'));
    if (out.length >= CHALLENGE_LETTER_COUNT) break;
  }
  if (out.length === 0) return null;
  return out.join('');
}

/** Iz vvoda polzovatelya — tol'ko bukvy, ne boleye maxLen. */
function letterPrefixFromUserInput(raw, maxLen) {
  const out = [];
  for (const ch of String(raw || '').normalize('NFC')) {
    if (/\p{L}/u.test(ch)) out.push(ch.toLocaleLowerCase('und'));
    if (out.length >= maxLen) break;
  }
  return out.join('');
}

function setTakeoverChallengeHint(wrongAttempt) {
  if (wrongAttempt) {
    takeoverChallengeHint.textContent = t('takeover.wrong');
    takeoverChallengeHint.hidden = false;
  } else {
    takeoverChallengeHint.hidden = true;
  }
}

// Zapas: 3 knopki s tsiframi, odna pravil'naya (yesli v nazvanii net bukv)
function generateDigitChallenge() {
  const digits = [2, 3, 4, 5, 6, 7, 8, 9];
  const pool = digits.slice();
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  const correct = picks[Math.floor(Math.random() * picks.length)];
  return { buttons: picks, correct };
}

function renderDigitChallenge(wrongAttempt) {
  takeoverEl.dataset.challengeMode = 'digits';
  delete takeoverEl.dataset.challengeAnswer;
  const ch = generateDigitChallenge();
  takeoverEl.dataset.correctDigit = String(ch.correct);

  const promptKeys = ['takeover.challenge.1', 'takeover.challenge.2', 'takeover.challenge.3', 'takeover.challenge.4'];
  const key = promptKeys[Math.floor(Math.random() * promptKeys.length)];
  takeoverChallengePrompt.innerHTML = t(key, { n: ch.correct });

  takeoverChallengeButtons.className = 'takeover-challenge-buttons';
  takeoverChallengeButtons.innerHTML = '';
  ch.buttons.forEach((d) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'takeover-challenge-btn';
    btn.textContent = String(d);
    btn.dataset.digit = String(d);
    btn.addEventListener('click', () => handleDigitChallengeTap(d, btn));
    takeoverChallengeButtons.appendChild(btn);
  });

  setTakeoverChallengeHint(wrongAttempt);
}

function renderLetterChallenge(title, wrongAttempt) {
  const answer = letterAnswerFromTitle(title);
  if (!answer) {
    renderDigitChallenge(wrongAttempt);
    return;
  }
  takeoverEl.dataset.challengeMode = 'letters';
  takeoverEl.dataset.challengeAnswer = answer;
  delete takeoverEl.dataset.correctDigit;

  takeoverChallengePrompt.innerHTML = t('takeover.challenge_letters_html', { n: answer.length });
  takeoverChallengeButtons.className = 'takeover-challenge-buttons takeover-challenge-form';
  takeoverChallengeButtons.innerHTML = '';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'takeover-challenge-input';
  inp.setAttribute('inputmode', 'text');
  inp.setAttribute('enterkeyhint', 'done');
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('autocorrect', 'off');
  inp.setAttribute('spellcheck', 'false');
  inp.setAttribute('aria-label', t('takeover.challenge_input_aria'));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary takeover-challenge-submit';
  btn.textContent = t('takeover.challenge_confirm');

  takeoverChallengeButtons.appendChild(inp);
  takeoverChallengeButtons.appendChild(btn);

  const tryLetters = async () => {
    const guess = letterPrefixFromUserInput(inp.value, answer.length);
    if (guess === answer) {
      if (navigator.vibrate) { try { navigator.vibrate(60); } catch {} }
      await takeoverConfirmDone();
      return;
    }
    inp.classList.add('takeover-challenge-input-wrong');
    if (navigator.vibrate) { try { navigator.vibrate([200, 80, 200]); } catch {} }
    setTimeout(() => inp.classList.remove('takeover-challenge-input-wrong'), 400);
    inp.value = '';
    setTakeoverChallengeHint(true);
    inp.focus();
  };

  btn.addEventListener('click', () => { tryLetters(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryLetters();
    }
  });

  setTakeoverChallengeHint(wrongAttempt);
  requestAnimationFrame(() => {
    try { inp.focus(); } catch {}
  });
}

function renderChallenge(wrongAttempt) {
  const rid = takeoverEl.dataset.reminderId;
  const r = state.reminders.find((x) => x.id === rid);
  const title = r?.title || '';
  renderLetterChallenge(title, wrongAttempt);
}

async function handleDigitChallengeTap(digit, btnEl) {
  const correct = Number(takeoverEl.dataset.correctDigit);
  if (digit === correct) {
    btnEl.classList.add('correct');
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch {} }
    await takeoverConfirmDone();
    return;
  }
  btnEl.classList.add('wrong');
  if (navigator.vibrate) { try { navigator.vibrate([200, 80, 200]); } catch {} }
  setTimeout(() => renderChallenge(true), 450);
}

async function takeoverConfirmDone() {
  const id = takeoverEl.dataset.reminderId;
  if (!id) return hideTakeover();
  const r = state.reminders.find((x) => x.id === id);
  if (r) {
    // Vazhno: snachala ack na backend (sinkhrоnно), chtoby server
    // perevyol status v 'acked' i ne otdaval reminder v syncAllReminders
    // obratno s overdue fire_at \u2014 inache takeover pokazhetsya snova.
    try { await syncAckToBackend(id, 'done'); } catch {}
    await db.delete(id);
    state.reminders = state.reminders.filter((x) => x.id !== id);
    await cancelLocalNotification(id);
    render();
    toast(t('toast.done'), 'success');
  }
  hideTakeover();
}

async function takeoverSnoozeAction() {
  const id = takeoverEl.dataset.reminderId;
  if (!id) return hideTakeover();
  await snoozeReminder(id, 10);
  hideTakeover();
}

// ============================================================================
// Settings / Permission
// ============================================================================

async function openSettings() {
  const langSel = document.getElementById('settings-lang');
  if (langSel) langSel.value = getLang();
  const themeSel = document.getElementById('settings-theme');
  if (themeSel) themeSel.value = getStoredTheme();
  renderAccountSection();
  renderTelegramSection();
  if (settingsDialog.showModal) settingsDialog.showModal();
  else settingsDialog.hidden = false;
}

function closeSettings() {
  if (settingsDialog.close) settingsDialog.close();
  else settingsDialog.hidden = true;
}

async function saveSettings(e) {
  e.preventDefault();
  const langSel = document.getElementById('settings-lang');
  if (langSel && langSel.value && langSel.value !== getLang()) {
    await changeLang(langSel.value);
  }
  if (Notification.permission === 'granted') {
    try { await ensurePushSubscription(); } catch {}
  }
  try { await syncAllReminders(); } catch {}
  updatePushStatusPill();
  updatePermissionUI();
  closeSettings();
  toast(t('toast.settings_saved'), 'success');
}

async function updatePermissionUI() {
  if (!('Notification' in window)) {
    setBanner(t('banner.no_notification_api'), 'warning');
    permissionBtn.hidden = true;
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    permissionBtn.hidden = true;
    if (state.workerUrl && !state.pushSubscribed) {
      setBanner(t('banner.connecting_push'), 'warning');
    } else {
      setBanner('', '');
    }
  } else if (perm === 'denied') {
    permissionBtn.hidden = true;
    setBanner(t('banner.notifications_blocked'), 'error');
  } else {
    permissionBtn.hidden = false;
    setBanner(t('banner.need_permission'), 'warning');
  }
}

async function requestPermission() {
  if (!('Notification' in window)) return;
  try {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      toast(t('toast.notifications_on'), 'success');
      await ensurePushSubscription();
      for (const r of state.reminders) await scheduleLocalNotification(r);
    }
    updatePermissionUI();
  } catch (err) {
    console.warn(err);
  }
}

// ============================================================================
// SW messages (ot klikov po pushu)
// ============================================================================

function setupSWMessageHandler() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', async (event) => {
    const msg = event.data || {};
    const { reminderId, action } = msg;

    if (msg.type === 'open-challenge') {
      // Pol'zovatel' tapnul na push — prinuditel'no pokazhem takeover
      if (!reminderId || reminderId === 'test') return;
      const r = state.reminders.find((x) => x.id === reminderId);
      if (r) {
        if (state.takeoverActive) hideTakeover();
        showTakeover(r, 1);
      } else {
        // Esli reminder uzhe udalyon \u2014 prosto perezagruzim, mozhet byt' sinkhroniziruyetsya
        await load();
        checkTakeover();
      }
      return;
    }

    if (msg.type === 'reminder-snoozed') {
      if (!reminderId || reminderId === 'test') return;
      const r = state.reminders.find((x) => x.id === reminderId);
      if (r) {
        r.fireAt = Date.now() + 10 * 60000;
        await db.put(r);
        render();
      }
      if (state.takeoverActive && takeoverEl?.dataset.reminderId === reminderId) hideTakeover();
      return;
    }

    // Legacy: esli pridyot staroye soobshcheniye reminder-acked \u2014 obrabotay tak zhe
    if (msg.type === 'reminder-acked') {
      if (!reminderId || reminderId === 'test') return;
      if (action === 'snooze') {
        const r = state.reminders.find((x) => x.id === reminderId);
        if (r) {
          r.fireAt = Date.now() + 10 * 60000;
          await db.put(r);
          render();
        }
      }
    }
  });
}

// ============================================================================
// URL actions + install prompt
// ============================================================================

function handleURLAction() {
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'new') {
    openComposer();
    history.replaceState({}, '', location.pathname);
  }
  if (params.get('action') === 'ack') {
    const id = params.get('id');
    if (id) {
      syncAckToBackend(id, 'done');
      db.delete(id).then(() => {
        state.reminders = state.reminders.filter((r) => r.id !== id);
        render();
      });
    }
    history.replaceState({}, '', location.pathname);
  }
}

// ============================================================================
// Install banner + platform detection
// ============================================================================

let deferredInstall = null;
const INSTALL_DISMISS_KEY = 'push_az_install_dismissed';
const THEME_STORAGE_KEY = 'push_az_theme';

function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'dark';
}

function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', light ? '#f4f7fb' : '#323e52');
  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (apple) apple.setAttribute('content', light ? 'default' : 'black-translucent');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, light ? 'light' : 'dark');
  } catch {}
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // iOS-specific
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  const ua = navigator.userAgent;
  const isMac = /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (isMac && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS/.test(ua);
  const isChromium = /Chrome|Chromium|Brave|Edg|OPR/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  return { isMac, isIOS, isAndroid, isSafari, isChromium, isFirefox };
}

function getInstallInstructions() {
  const p = detectPlatform();
  function steps(prefix, count) {
    const arr = [];
    for (let i = 1; i <= count; i++) arr.push(t(prefix + '.' + i));
    return arr;
  }
  if (p.isIOS && !p.isMac) {
    return { title: t('install.iphone.title'), steps: steps('install.iphone', 4) };
  }
  if (p.isMac && p.isSafari) {
    return { title: t('install.mac_safari.title'), steps: steps('install.mac_safari', 4) };
  }
  if (p.isMac && p.isChromium) {
    return { title: t('install.mac_chrome.title'), steps: steps('install.mac_chrome', 4) };
  }
  if (p.isAndroid && p.isChromium) {
    return { title: t('install.android.title'), steps: steps('install.android', 3) };
  }
  if (p.isFirefox) {
    return { title: t('install.firefox.title'), steps: steps('install.firefox', 2) };
  }
  return { title: t('install.other.title'), steps: steps('install.other', 3) };
}

function renderInstallInstructions() {
  const el = document.getElementById('install-instructions');
  if (!el) return;
  const info = getInstallInstructions();
  el.innerHTML =
    `<strong>${info.title}</strong><ol>` +
    info.steps.map((s) => `<li>${s}</li>`).join('') +
    '</ol>';
}

function updateInstallBannerVisibility() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;

  const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
  if (isStandalone() || dismissed) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;

  const installBtn = document.getElementById('install-btn');
  if (installBtn) installBtn.hidden = !deferredInstall;
}

function setupInstallBanner() {
  const installBtn = document.getElementById('install-btn');
  const howBtn = document.getElementById('install-how-btn');
  const dismissBtn = document.getElementById('install-dismiss-btn');
  const instructions = document.getElementById('install-instructions');

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try {
        const { outcome } = await deferredInstall.userChoice;
        if (outcome === 'accepted') {
          toast(t('install.ok_toast'), 'success');
          localStorage.setItem(INSTALL_DISMISS_KEY, '1');
          updateInstallBannerVisibility();
        }
      } catch {}
      deferredInstall = null;
    });
  }

  if (howBtn) {
    howBtn.addEventListener('click', () => {
      renderInstallInstructions();
      if (instructions) instructions.hidden = !instructions.hidden;
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      updateInstallBannerVisibility();
    });
  }

  updateInstallBannerVisibility();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  updateInstallBannerVisibility();
});

window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  localStorage.setItem(INSTALL_DISMISS_KEY, '1');
  updateInstallBannerVisibility();
  toast(t('install.done_toast'), 'success');
});

// Otslezhivaem transition standalone mode
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallBannerVisibility);

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'module' });
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('SW registration failed', err);
  }
}

// ============================================================================
// Event wiring
// ============================================================================

function bindEvents() {
  if (form) form.addEventListener('submit', addReminder);
  permissionBtn.addEventListener('click', requestPermission);
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (settingsForm) settingsForm.addEventListener('submit', saveSettings);
  const settingsLangSel = document.getElementById('settings-lang');
  if (settingsLangSel) {
    settingsLangSel.addEventListener('change', async () => {
      await changeLang(settingsLangSel.value);
    });
  }
  const settingsThemeSel = document.getElementById('settings-theme');
  if (settingsThemeSel) {
    settingsThemeSel.addEventListener('change', () => {
      applyTheme(settingsThemeSel.value);
    });
  }
  document.querySelectorAll('[data-close-settings]').forEach((b) =>
    b.addEventListener('click', closeSettings),
  );

  const openComposerBtn = document.getElementById('open-composer-btn');
  if (openComposerBtn) openComposerBtn.addEventListener('click', openComposer);
  document.querySelectorAll('[data-close-composer]').forEach((b) =>
    b.addEventListener('click', () => {
      if (form) form.reset();
      setMinDateTime();
      closeComposer();
      debugLog('composer dismiss (cancel/X)');
    }),
  );

  if (takeoverSnooze) takeoverSnooze.addEventListener('click', takeoverSnoozeAction);

  setupTelegramButtons();

  const addPasskeyBtn = document.getElementById('add-passkey-btn');
  const logoutBtn = document.getElementById('logout-btn');

  if (addPasskeyBtn) {
    addPasskeyBtn.addEventListener('click', async () => {
      try {
        await addPasskeyToAccount();
        toast(t('acc.passkey_added'), 'success');
      } catch (err) {
        toast(t('err.generic', { err: err?.message || err }), 'error');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (!confirm(t('acc.logout_confirm'))) return;
      try {
        if (settingsDialog?.close) settingsDialog.close();
        else if (settingsDialog) settingsDialog.hidden = true;
        await logoutCurrentUser();
        renderAuthScreen();
        toast(t('acc.logout_toast'), 'success');
      } catch (err) {
        toast(t('err.generic', { err: err?.message || err }), 'error');
      }
    });
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    tickUpdate();
    updatePermissionUI();
    // Sperva podtyanem svezhiye reminderы s backend'a (vklyuchaya
    // propushchennye na drugikh ustroystvakh), potom forsiruem takeover.
    if (state.online && state.workerUrl && state.sessionToken) {
      try { await syncAllReminders(); } catch {}
    }
    checkTakeover();
    if (state.workerUrl && Notification.permission === 'granted' && !state.pushSubscribed) {
      try {
        await ensurePushSubscription();
      } catch (err) {
        console.warn('ensurePushSubscription', err);
      }
    }
    await updatePermissionUI();
  });

  window.addEventListener('online', () => {
    state.online = true;
    if (state.workerUrl) syncAllReminders();
  });
  window.addEventListener('offline', () => {
    state.online = false;
  });
}

// ============================================================================
// Init
// ============================================================================

(async function init() {
  applyTheme(getStoredTheme());
  setMinDateTime();
  await initConfig();
  await registerSW();
  setupSWMessageHandler();
  await load();
  bindEvents();
  setupAuthScreen();
  setupInstallBanner();
  updatePushStatusPill();
  await updatePermissionUI();

  // Proveryayem sessiyu. Yesli est' Worker i token \u2014 proverim na serverе.
  if (state.workerUrl && state.sessionToken) {
    try {
      const me = await api('/api/auth/me', { method: 'GET' });
      state.user = me.user;
      await config.set('user', me.user);
    } catch (err) {
      if (err?.status === 401) {
        await clearSession();
      }
    }
  }

  if (!state.sessionToken || !state.user) {
    renderAuthScreen();
  }

  if (state.workerUrl && state.sessionToken && Notification.permission === 'granted') {
    try {
      await ensurePushSubscription();
    } catch (err) {
      console.warn('ensurePushSubscription', err);
    }
    await updatePermissionUI();
    syncAllReminders();
  }

  for (const r of state.reminders) await scheduleLocalNotification(r);

  startTick();
  handleURLAction();
})();
