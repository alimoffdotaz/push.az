import { config } from '/db.js';

const CACHE = 'push-az-v14';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/db.js',
  '/i18n.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/icon-alert.svg',
  '/icons/icon-192.png',
  '/icons/icon-256.png',
  '/icons/icon-512.png',
  '/icons/icon-alert-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// ============================================================================
// Fetch: stale-while-revalidate dlya assetov, network-first dlya navigatsii
// ============================================================================

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    }),
  );
});

// ============================================================================
// Push event
// ============================================================================

const SW_I18N = {
  ru: {
    default_body: 'Пора!',
    default_notif_body: 'Уведомление',
    final_prefix: '🚨 ПОСЛЕДНИЙ ЗВОНОК — ',
    action_open: 'Открыть и подтвердить',
    action_snooze: 'Отложить 10 мин',
  },
  az: {
    default_body: 'Vaxtıdır!',
    default_notif_body: 'Bildiriş',
    final_prefix: '🚨 SON ZƏNG — ',
    action_open: 'Aç və təsdiq et',
    action_snooze: '10 dəq təxirə',
  },
  en: {
    default_body: 'Time!',
    default_notif_body: 'Notification',
    final_prefix: '🚨 FINAL CALL — ',
    action_open: 'Open and confirm',
    action_snooze: 'Snooze 10 min',
  },
};

function swDict(lang) {
  return SW_I18N[lang] || SW_I18N.ru;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'push.az', body: event.data ? event.data.text() : '' };
  }

  const L = swDict(data.lang);
  if (!data.body && !('title' in data)) data.body = L.default_notif_body;

  const reminderId = data.reminderId || '';
  const isReminder = data.type === 'reminder' && reminderId && reminderId !== 'test';
  const attempt = data.attempt || 1;
  const maxAttempts = data.maxAttempts || 5;
  const pendingCount = Number(data.pendingCount || 0);
  const challenge = data.challenge || null;

  const urgent = attempt >= 3;
  const isFinal = isReminder && attempt >= maxAttempts;
  let title = data.title || 'push.az';
  if (isFinal) title = L.final_prefix + title;
  else if (urgent) title = title + ' \u203c';

  const options = {
    body: data.body || L.default_body,
    icon: urgent || isFinal ? '/icons/icon-alert-512.png' : '/icons/icon-512.png',
    badge: '/icons/icon-192.png',
    // Na finalnoy popytke ne kollapsirovat' s predyduschimi (unikalnyy tag)
    tag: isFinal
      ? 'push-az-final-' + (reminderId || 'generic')
      : 'push-az-' + (reminderId || 'generic'),
    renotify: true,
    requireInteraction: true,
    data: {
      ...data,
      challenge,
      isFinal,
      receivedAt: Date.now(),
      challengeFailures: 0,
    },
    silent: false,
  };

  // Dizayn-reshenie: ACK vozmozhen TOL'KO cherez in-app challenge.
  // V pushe mozhno tol'ko otlozhit' ili otkryt' app. Gotovo v notif net \u2014
  // chtoby nel'zya bylo "avtoматom" ubit' napominaniye.
  if (isReminder) {
    options.actions = [
      { action: 'open', title: L.action_open },
      { action: 'snooze', title: L.action_snooze },
    ];
  }

  if (isReminder) {
    try {
      options.vibrate = isFinal
        ? [300, 100, 300, 100, 300, 100, 600]
        : urgent
          ? [200, 80, 200, 80, 400]
          : [100, 40, 100];
    } catch {}
    if (attempt > 1) {
      options.body = options.body + ' (' + attempt + '/' + maxAttempts + ')';
    }
  }

  // Badge API: na iOS PWA ikonka pokazyvaet chislo. Yesli push \u2014 eto
  // reminder (ili test), stavim min 1. Yesli backend peredal
  // pendingCount > 0 \u2014 ispol'zuem ego.
  let badgeCount = 0;
  if (isReminder) {
    badgeCount = pendingCount > 0 ? pendingCount : 1;
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      setBadge(badgeCount),
    ]),
  );
});

// ============================================================================
// Notification click / action handlers
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};
  const reminderId = data.reminderId || '';
  const challenge = data.challenge || null;
  const notification = event.notification;

  event.waitUntil(
    (async () => {
      const isRealReminder = reminderId && reminderId !== 'test' && !data.local;

      notification.close();

      // === SNOOZE \u2014 edinstvennoye chto mozhno sdelat' iz samogo pusha ===
      if (action === 'snooze') {
        if (isRealReminder) await callAck(reminderId, 'snooze', 10);
        await notifyClients({ type: 'reminder-snoozed', reminderId });
        return;
      }

      // === Vsyo ostal'noye (tap po tyelu, action='open') \u2014 otkryvaem app.
      // Ack proizoydyot tol'ko kogda polzovatel' projdyot in-app challenge.
      await notifyClients({
        type: 'open-challenge',
        reminderId,
      });
      await focusClient();
    })(),
  );
});

self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  console.log('[sw] notification closed without interaction', data?.reminderId);
});

// ============================================================================
// Badge API (schyotchik na ikonke PWA)
// ============================================================================

async function setBadge(count) {
  try {
    if (count > 0) {
      if (self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
    } else {
      if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
    }
  } catch (err) {
    // not supported \u2014 ignore
  }
}

async function updateBadgeAfterAck(data) {
  const pending = Number(data?.pendingCount || 0);
  // Posle ack uменьшаем schyotchik
  const remaining = Math.max(0, pending - 1);
  await setBadge(remaining);
}

// ============================================================================
// Helpers
// ============================================================================

async function callAck(reminderId, action, minutes = 10) {
  try {
    const workerUrl = await config.get('workerUrl', '');
    const deviceId = await config.get('deviceId', '');
    if (!workerUrl || !deviceId) return;
    await fetch(workerUrl.replace(/\/+$/, '') + '/api/ack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({ reminderId, action, minutes }),
    });
  } catch (err) {
    console.warn('[sw] ack failed:', err);
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of clients) {
    try { c.postMessage(message); } catch {}
  }
}

async function focusClient() {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of all) {
    if ('focus' in c) {
      try { await c.focus(); return; } catch {}
    }
  }
  if (self.clients.openWindow) {
    try { await self.clients.openWindow('/'); } catch {}
  }
}

// ============================================================================
// Soobshcheniya ot osnovnogo prilozheniya (napr. synchronize badge)
// ============================================================================

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'set-badge') {
    setBadge(Number(msg.count || 0));
  } else if (msg.type === 'clear-badge') {
    setBadge(0);
  }
});
