import { db, config } from '/db.js';

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
const resetBtn = $('#reset-btn');
const listEl = $('#reminders-list');
const pastListEl = $('#past-list');
const pastSection = $('#past-section');
const emptyState = $('#empty-state');
const countBadge = $('#count-badge');
const banner = $('#status-banner');
const permissionBtn = $('#permission-btn');
const testLink = $('#test-notification');
const installHint = $('#install-hint');
const tpl = $('#reminder-item-template');
const toastRoot = $('#toast-root');
const settingsBtn = $('#settings-btn');
const settingsDialog = $('#settings-dialog');
const settingsForm = $('#settings-form');
const settingsWorkerUrl = $('#settings-worker-url');
const settingsStatus = $('#settings-status');
const pushStatusPill = $('#push-status-pill');
const takeoverEl = $('#takeover');
const takeoverTitle = $('#takeover-title');
const takeoverNote = $('#takeover-note');
const takeoverCounter = $('#takeover-counter');
const takeoverDone = $('#takeover-done');
const takeoverSnooze = $('#takeover-snooze');
const takeoverSkip = $('#takeover-skip');

// ============================================================================
// Constants
// ============================================================================

const REPEAT_LABEL = {
  none: '',
  daily: 'yezhednevno',
  weekly: 'yezhenedel\u2019no',
  monthly: 'yezhemesyachno',
};

const TONE_EMOJI = { friendly: '\ud83d\udc9c', urgent: '\u26a1', funny: '\ud83d\ude06', aggressive: '\ud83d\udd25' };
const TONE_LABEL = { friendly: 'teplo', urgent: 'srochno', funny: 'smeshno', aggressive: 'zhyostko' };

// ============================================================================
// Utilities
// ============================================================================

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
  return new Date(ts).toLocaleString('ru-RU', {
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
  if (min < 1) label = 'pryamo seychas';
  else if (min < 60) label = min + ' min';
  else if (hr < 24) label = hr + ' ch';
  else label = day + ' dn.';
  return diff < 0 ? 'prosrocheno \u00b7 ' + label + ' nazad' : 'cherez ' + label;
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
  const now = new Date();
  now.setSeconds(0, 0);
  whenEl.min = toLocalInputValue(now);
  if (!whenEl.value) {
    const suggested = new Date(now.getTime() + 5 * 60000);
    whenEl.value = toLocalInputValue(suggested);
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
  state.workerUrl = (await config.get('workerUrl', '')).replace(/\/+$/, '');
  state.vapidPublicKey = await config.get('vapidPublicKey', '');
}

// ============================================================================
// Backend API
// ============================================================================

async function api(path, options = {}) {
  if (!state.workerUrl) throw new Error('WORKER_URL_NOT_SET');
  const headers = {
    'X-Device-Id': state.deviceId,
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
    const err = new Error(data?.error || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function apiHealth(workerUrl) {
  const res = await fetch(workerUrl.replace(/\/+$/, '') + '/api/health', {
    headers: { 'X-Device-Id': state.deviceId },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
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
    pushStatusPill.textContent = 'Offline rezhim';
    pushStatusPill.className = 'pill pill-muted';
    return;
  }
  if (state.pushSubscribed) {
    pushStatusPill.textContent = '\u25cf Push aktiven';
    pushStatusPill.className = 'pill pill-success';
  } else {
    pushStatusPill.textContent = '\u25cf Push ne nastroyen';
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
  state.syncing = true;
  try {
    for (const r of state.reminders) {
      await syncReminderToBackend(r);
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

function render() {
  const now = Date.now();
  const upcoming = [];
  const past = [];
  let overdue = 0;
  for (const r of state.reminders) {
    if (r.fireAt >= now - 60 * 1000 || r.repeat !== 'none') upcoming.push(r);
    else past.push(r);
    if (r.fireAt <= now && !r.acked) overdue++;
  }

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
    if (count > 0 && navigator.setAppBadge) {
      await navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      await navigator.clearAppBadge();
    }
  } catch {
    // unsupported \u2014 ignore
  }
  // Takzhe podgonyaem titul (chtoby v Safari bylo vidno)
  try {
    document.title = count > 0 ? `(${count}) push.az` : 'push.az';
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
    repeatEl.textContent = REPEAT_LABEL[r.repeat];
    repeatEl.hidden = false;
  }

  const toneEl = node.querySelector('.reminder-tone');
  if (toneEl && r.tone) {
    toneEl.textContent = TONE_EMOJI[r.tone] + ' ' + TONE_LABEL[r.tone];
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

  node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteReminder(r.id));
  const snoozeBtn = node.querySelector('[data-action="snooze"]');
  if (snoozeBtn) snoozeBtn.addEventListener('click', () => snoozeReminder(r.id, 10));

  return node;
}

async function addReminder(e) {
  e.preventDefault();
  const title = titleEl.value.trim();
  const note = noteEl.value.trim();
  const whenStr = whenEl.value;
  const repeat = repeatEl.value;
  const tone = toneEl ? toneEl.value : 'friendly';
  if (!title || !whenStr) return;

  const fireAt = new Date(whenStr).getTime();
  if (isNaN(fireAt)) {
    toast('Nekorrektnaya data', 'error');
    return;
  }
  if (fireAt <= Date.now() - 60000 && repeat === 'none') {
    toast('Vremya uzhe proshlo', 'error');
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

  await db.put(reminder);
  state.reminders.push(reminder);
  state.reminders.sort((a, b) => a.fireAt - b.fireAt);
  await scheduleLocalNotification(reminder);
  syncReminderToBackend(reminder);
  render();
  form.reset();
  if (toneEl) toneEl.value = tone;
  setMinDateTime();
  titleEl.focus();
  toast('Reminder dobavlen', 'success');
}

async function deleteReminder(id) {
  await db.delete(id);
  state.reminders = state.reminders.filter((r) => r.id !== id);
  await cancelLocalNotification(id);
  syncDeleteReminderToBackend(id);
  render();
  toast('Udaleno');
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
  toast('Otlozheno na ' + minutes + ' min');
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
      body: r.note || 'Vremya!',
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
}

// ============================================================================
// Takeover screen \u2014 polnoekrannoye napominaniye poka ne nazhmesh' "Gotovo"
// ============================================================================

function checkTakeover() {
  if (state.takeoverActive) return;
  const now = Date.now();
  const overdue = state.reminders
    .filter((r) => r.repeat === 'none')
    .filter((r) => r.fireAt <= now && (now - r.fireAt) < 6 * 60 * 60 * 1000)
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
  takeoverCounter.textContent = totalCount > 1 ? '+' + (totalCount - 1) + ' eshchyo' : '';
  takeoverCounter.hidden = totalCount <= 1;
  takeoverEl.dataset.reminderId = r.id;
  takeoverEl.hidden = false;
  takeoverEl.classList.add('active');
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

async function takeoverDoneAction() {
  const id = takeoverEl.dataset.reminderId;
  if (!id) return hideTakeover();
  const r = state.reminders.find((x) => x.id === id);
  if (r) {
    await db.delete(id);
    state.reminders = state.reminders.filter((x) => x.id !== id);
    await cancelLocalNotification(id);
    syncAckToBackend(id, 'done');
    render();
    toast('Vypolneno \u2713', 'success');
  }
  hideTakeover();
}

async function takeoverSnoozeAction() {
  const id = takeoverEl.dataset.reminderId;
  if (!id) return hideTakeover();
  await snoozeReminder(id, 10);
  hideTakeover();
}

function takeoverSkipAction() {
  hideTakeover();
}

// ============================================================================
// Settings / Permission
// ============================================================================

async function openSettings() {
  settingsWorkerUrl.value = state.workerUrl || '';
  settingsStatus.textContent = '';
  settingsStatus.className = '';
  if (settingsDialog.showModal) settingsDialog.showModal();
  else settingsDialog.hidden = false;
}

function closeSettings() {
  if (settingsDialog.close) settingsDialog.close();
  else settingsDialog.hidden = true;
}

async function saveSettings(e) {
  e.preventDefault();
  const url = settingsWorkerUrl.value.trim().replace(/\/+$/, '');
  settingsStatus.textContent = 'Proveryayu...';
  settingsStatus.className = '';

  if (!url) {
    state.workerUrl = '';
    state.pushSubscribed = false;
    state.vapidPublicKey = '';
    await config.set('workerUrl', '');
    await config.set('vapidPublicKey', '');
    updatePushStatusPill();
    updatePermissionUI();
    closeSettings();
    toast('Worker URL ochishchen, rezhim offline');
    return;
  }

  if (!/^https?:\/\//.test(url)) {
    settingsStatus.textContent = 'URL dolzhen nachinat\u2019sya s http:// ili https://';
    settingsStatus.className = 'error';
    return;
  }

  try {
    await apiHealth(url);
  } catch (err) {
    settingsStatus.textContent = 'Ne udalos\u2019 podklyuchit\u2019sya: ' + err.message;
    settingsStatus.className = 'error';
    return;
  }

  state.workerUrl = url;
  await config.set('workerUrl', url);
  settingsStatus.textContent = 'Podklyucheno \u2713';
  settingsStatus.className = 'success';

  if (Notification.permission === 'granted') {
    await ensurePushSubscription();
  }
  await syncAllReminders();
  updatePushStatusPill();
  updatePermissionUI();
  setTimeout(closeSettings, 600);
  toast('Nastroyki sokhraneny', 'success');
}

async function updatePermissionUI() {
  if (!('Notification' in window)) {
    setBanner('Tvoy brauzer ne podderzhivayet uvedomleniya.', 'warning');
    permissionBtn.hidden = true;
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    permissionBtn.hidden = true;
    if (state.workerUrl && !state.pushSubscribed) {
      setBanner('Uvedomleniya razresheny. Podklyuchayu push...', 'warning');
    } else if (!state.workerUrl) {
      setBanner('Dlya nadyozhnykh uvedomleniy nastroy Worker URL v nastroykakh \u2699\ufe0f', 'warning');
    } else {
      setBanner('', '');
    }
  } else if (perm === 'denied') {
    permissionBtn.hidden = true;
    setBanner('Uvedomleniya zablokirovany. Razreshi ikh v nastroykakh sayta.', 'error');
  } else {
    permissionBtn.hidden = false;
    setBanner('Dlya raboty nuzhno razreshit\u2019 uvedomleniya.', 'warning');
  }
}

async function requestPermission() {
  if (!('Notification' in window)) return;
  try {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      toast('Uvedomleniya vklyucheny', 'success');
      await ensurePushSubscription();
      for (const r of state.reminders) await scheduleLocalNotification(r);
    }
    updatePermissionUI();
  } catch (err) {
    console.warn(err);
  }
}

async function sendTestNotification(e) {
  e.preventDefault();
  if (Notification.permission !== 'granted') {
    await requestPermission();
    if (Notification.permission !== 'granted') return;
  }

  if (state.workerUrl && state.pushSubscribed) {
    try {
      await api('/api/test-push', { method: 'POST', body: {} });
      toast('Test-push otpravlen s backend', 'success');
      return;
    } catch (err) {
      console.warn('Backend test push failed, falling back to local:', err);
    }
  }

  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('push.az', {
    body: 'Test-uvedomleniye. Vsyo rabotayet!',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: 'push-az-test',
  });
  toast('Lokal\u2019noye test-uvedomleniye otpravleno');
}

// ============================================================================
// SW messages (ot klikov po pushu)
// ============================================================================

function setupSWMessageHandler() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', async (event) => {
    const msg = event.data || {};
    if (msg.type === 'reminder-acked') {
      const { reminderId, action } = msg;
      if (!reminderId || reminderId === 'test') return;
      if (action === 'done') {
        await db.delete(reminderId);
        state.reminders = state.reminders.filter((r) => r.id !== reminderId);
        render();
        if (state.takeoverActive && takeoverEl?.dataset.reminderId === reminderId) hideTakeover();
      } else if (action === 'snooze') {
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
    titleEl.focus();
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

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  installHint.hidden = false;
  installHint.textContent = '';
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = 'Ustanovit\u2019 prilozheniye';
  link.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') toast('Ustanovleno', 'success');
    deferredInstall = null;
    installHint.hidden = true;
  });
  installHint.appendChild(link);
});

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
  form.addEventListener('submit', addReminder);
  resetBtn.addEventListener('click', () => { form.reset(); setMinDateTime(); });
  permissionBtn.addEventListener('click', requestPermission);
  testLink.addEventListener('click', sendTestNotification);
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (settingsForm) settingsForm.addEventListener('submit', saveSettings);
  document.querySelectorAll('[data-close-settings]').forEach((b) =>
    b.addEventListener('click', closeSettings),
  );

  if (takeoverDone) takeoverDone.addEventListener('click', takeoverDoneAction);
  if (takeoverSnooze) takeoverSnooze.addEventListener('click', takeoverSnoozeAction);
  if (takeoverSkip) takeoverSkip.addEventListener('click', takeoverSkipAction);

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      tickUpdate();
      updatePermissionUI();
      checkTakeover();
      if (state.workerUrl && Notification.permission === 'granted' && !state.pushSubscribed) {
        await ensurePushSubscription();
      }
    }
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
  setMinDateTime();
  await initConfig();
  await registerSW();
  setupSWMessageHandler();
  await load();
  bindEvents();
  updatePushStatusPill();
  await updatePermissionUI();

  if (state.workerUrl && Notification.permission === 'granted') {
    await ensurePushSubscription();
    syncAllReminders();
  }

  for (const r of state.reminders) await scheduleLocalNotification(r);

  startTick();
  handleURLAction();
})();
