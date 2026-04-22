import { config } from '/db.js';

const CACHE = 'push-az-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/db.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/icon-alert.svg',
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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'push.az', body: event.data ? event.data.text() : 'Uvedomleniye' };
  }

  const reminderId = data.reminderId || '';
  const isReminder = data.type === 'reminder' && reminderId && reminderId !== 'test';
  const attempt = data.attempt || 1;
  const maxAttempts = data.maxAttempts || 5;
  const pendingCount = Number(data.pendingCount || 0);
  const challenge = data.challenge || null;

  const urgent = attempt >= 3;
  const title = (data.title || 'push.az') + (urgent ? ' \u203c' : '');

  const options = {
    body: data.body || 'Vremya!',
    icon: urgent ? '/icons/icon-alert.svg' : '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: 'push-az-' + (reminderId || 'generic'),
    renotify: true,
    requireInteraction: true,
    data: {
      ...data,
      challenge,
      receivedAt: Date.now(),
      challengeFailures: 0,
    },
    silent: false,
  };

  // Dizayn-reshenie: ACK vozmozhen TOL'KO cherez in-app challenge.
  // V pushe mozhno tol'ko otlozhit' ili otkryt' app. Gotovo v notif net \u2014
  // chtoby nel'zya bylo "avtoматom" ubit' napominaniye.
  if (isReminder || data.type === 'test') {
    options.actions = [
      { action: 'open', title: 'Otkryt\u2019 i podtverdit\u2019' },
      { action: 'snooze', title: 'Otlozhit\u2019 10m' },
    ];
  }

  if (isReminder) {
    try { options.vibrate = urgent ? [200, 80, 200, 80, 400] : [100, 40, 100]; } catch {}
    if (attempt > 1) {
      options.body = options.body + ' (' + attempt + '/' + maxAttempts + ')';
    }
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      setBadge(pendingCount),
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
