import { db } from '/db.js';

const state = {
  reminders: [],
  tickTimer: null,
  triggerSupported: 'showTrigger' in Notification.prototype,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const form = $('#reminder-form');
const titleEl = $('#title');
const noteEl = $('#note');
const whenEl = $('#when');
const repeatEl = $('#repeat');
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

const REPEAT_LABEL = {
  none: '',
  daily: 'yezhednevno',
  weekly: 'yezhenedel\u2019no',
  monthly: 'yezhemesyachno',
};

function uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
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
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', {
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
  return diff < 0 ? 'prosrocheno · ' + label + ' nazad' : 'cherez ' + label;
}

function relativeClass(ts) {
  const diff = ts - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 60 * 60 * 1000) return 'soon';
  return '';
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

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
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

async function load() {
  state.reminders = (await db.getAll()) || [];
  state.reminders.sort((a, b) => a.fireAt - b.fireAt);
  render();
}

function render() {
  const now = Date.now();
  const upcoming = [];
  const past = [];
  for (const r of state.reminders) {
    if (r.fireAt >= now - 60 * 1000 || r.repeat !== 'none') upcoming.push(r);
    else past.push(r);
  }

  listEl.innerHTML = '';
  upcoming.forEach((r) => listEl.appendChild(renderItem(r)));
  emptyState.hidden = upcoming.length > 0;
  countBadge.textContent = String(upcoming.length);

  if (past.length) {
    pastSection.hidden = false;
    pastListEl.innerHTML = '';
    past
      .slice()
      .reverse()
      .slice(0, 20)
      .forEach((r) => pastListEl.appendChild(renderItem(r, true)));
  } else {
    pastSection.hidden = true;
  }
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

  node.querySelector('.reminder-time').textContent = formatWhen(r.fireAt);
  const rel = node.querySelector('.reminder-relative');
  rel.textContent = '· ' + relativeLabel(r.fireAt);
  const cls = relativeClass(r.fireAt);
  if (cls) rel.classList.add(cls);

  if (isPast) {
    node.querySelector('[data-action="snooze"]').hidden = true;
  }

  node
    .querySelector('[data-action="delete"]')
    .addEventListener('click', () => deleteReminder(r.id));
  const snoozeBtn = node.querySelector('[data-action="snooze"]');
  if (snoozeBtn) {
    snoozeBtn.addEventListener('click', () => snoozeReminder(r.id, 10));
  }

  return node;
}

async function addReminder(e) {
  e.preventDefault();
  const title = titleEl.value.trim();
  const note = noteEl.value.trim();
  const whenStr = whenEl.value;
  const repeat = repeatEl.value;
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
    createdAt: Date.now(),
  };

  await db.put(reminder);
  state.reminders.push(reminder);
  state.reminders.sort((a, b) => a.fireAt - b.fireAt);
  await scheduleNotification(reminder);
  render();
  form.reset();
  setMinDateTime();
  titleEl.focus();
  toast('Reminder dobavlen', 'success');
}

async function deleteReminder(id) {
  await db.delete(id);
  state.reminders = state.reminders.filter((r) => r.id !== id);
  await cancelScheduledNotification(id);
  render();
  toast('Udaleno');
}

async function snoozeReminder(id, minutes) {
  const r = state.reminders.find((x) => x.id === id);
  if (!r) return;
  r.fireAt = Date.now() + minutes * 60000;
  await db.put(r);
  state.reminders.sort((a, b) => a.fireAt - b.fireAt);
  await scheduleNotification(r);
  render();
  toast('Otlozheno na ' + minutes + ' min');
}

async function scheduleNotification(r) {
  if (Notification.permission !== 'granted') return;
  if (!state.triggerSupported) return;
  const reg = await navigator.serviceWorker.ready;
  try {
    await cancelScheduledNotification(r.id);
    const fireAt = nextFireAt(r);
    await reg.showNotification(r.title, {
      body: r.note || 'Vremya!',
      tag: 'push-az-' + r.id,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      showTrigger: new TimestampTrigger(fireAt),
      data: { id: r.id, repeat: r.repeat, fireAt },
      renotify: true,
      requireInteraction: true,
    });
  } catch (err) {
    console.warn('Failed to schedule trigger notification', err);
  }
}

async function cancelScheduledNotification(id) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const notes = await reg.getNotifications({
    tag: 'push-az-' + id,
    includeTriggered: true,
  });
  notes.forEach((n) => n.close());
}

async function reScheduleAll() {
  if (!state.triggerSupported) return;
  for (const r of state.reminders) {
    await scheduleNotification(r);
  }
}

function startTick() {
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = setInterval(checkDue, 15000);
  checkDue();
}

async function checkDue() {
  const now = Date.now();
  let changed = false;
  for (const r of state.reminders) {
    if (r.fireAt <= now + 500 && !r._fired) {
      r._fired = true;
      await fireNow(r);
      if (r.repeat && r.repeat !== 'none') {
        r.fireAt = nextFireAt(r);
        r._fired = false;
        await db.put(r);
      }
      changed = true;
    }
  }
  if (changed) {
    state.reminders.sort((a, b) => a.fireAt - b.fireAt);
    render();
  } else {
    for (const node of listEl.children) {
      const id = node.dataset.id;
      const r = state.reminders.find((x) => x.id === id);
      if (!r) continue;
      const rel = node.querySelector('.reminder-relative');
      rel.textContent = '· ' + relativeLabel(r.fireAt);
      rel.classList.remove('soon', 'overdue');
      const cls = relativeClass(r.fireAt);
      if (cls) rel.classList.add(cls);
    }
  }
}

async function fireNow(r) {
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(r.title, {
    body: r.note || 'Vremya!',
    tag: 'push-az-live-' + r.id,
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    requireInteraction: true,
    data: { id: r.id },
  });
}

async function updatePermissionUI() {
  if (!('Notification' in window)) {
    setBanner(
      'Tvoy brauzer ne podderzhivayet uvedomleniya. Reminder budet rabotat\u2019 bez push.',
      'warning',
    );
    permissionBtn.hidden = true;
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    permissionBtn.hidden = true;
    if (!state.triggerSupported) {
      setBanner(
        'Uvedomleniya rabotayut tol\u2019ko poka vkladka otkryta (brauzer ne podderzhivayet TimestampTrigger). Ustanovi sayt kak prilozheniye dlya nadyozhnosti.',
        'warning',
      );
    } else {
      setBanner('', '');
    }
  } else if (perm === 'denied') {
    permissionBtn.hidden = true;
    setBanner(
      'Uvedomleniya zablokirovany. Razreshi ikh v nastroykakh sayta, chtoby reminder rabotal.',
      'error',
    );
  } else {
    permissionBtn.hidden = false;
    setBanner('Dlya rabotky nuzhno razreshit\u2019 uvedomleniya.', 'warning');
  }
}

async function requestPermission() {
  if (!('Notification' in window)) return;
  try {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      toast('Uvedomleniya vklyucheny', 'success');
      await reScheduleAll();
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
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('push.az', {
    body: 'Test-uvedomleniye. Vsyo rabotayet!',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: 'push-az-test',
  });
  toast('Otpravleno');
}

function handleURLAction() {
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'new') {
    titleEl.focus();
    history.replaceState({}, '', location.pathname);
  }
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    console.log('SW registered', reg.scope);
  } catch (err) {
    console.warn('SW registration failed', err);
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
    if (outcome === 'accepted') toast('Ustanovlennno', 'success');
    deferredInstall = null;
    installHint.hidden = true;
  });
  installHint.appendChild(link);
});

form.addEventListener('submit', addReminder);
resetBtn.addEventListener('click', () => {
  form.reset();
  setMinDateTime();
});
permissionBtn.addEventListener('click', requestPermission);
testLink.addEventListener('click', sendTestNotification);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkDue();
    updatePermissionUI();
  }
});

(async function init() {
  setMinDateTime();
  await registerSW();
  await load();
  await updatePermissionUI();
  await reScheduleAll();
  startTick();
  handleURLAction();
})();
