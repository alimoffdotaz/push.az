import { config } from '/db.js';

const CACHE = 'push-az-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/db.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
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

  const title = data.title || 'push.az';
  const reminderId = data.reminderId || '';
  const attempt = data.attempt || 1;
  const maxAttempts = data.maxAttempts || 5;

  const isReminder = data.type === 'reminder' && reminderId && reminderId !== 'test';

  const options = {
    body: data.body || 'Vremya!',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: 'push-az-' + (reminderId || 'generic'),
    renotify: true,
    requireInteraction: true,
    data: { ...data, receivedAt: Date.now() },
    silent: false,
  };

  if (isReminder) {
    options.actions = [
      { action: 'done', title: '\u2713 Gotovo' },
      { action: 'snooze', title: 'Otlozhit\u2019 10m' },
    ];
    try { options.vibrate = attempt >= 3 ? [200, 80, 200, 80, 400] : [100, 40, 100]; } catch {}
    if (attempt > 1) {
      options.body = options.body + '\n(' + attempt + '/' + maxAttempts + ')';
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================================================
// Notification click / action handlers
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};
  const reminderId = data.reminderId || '';

  event.notification.close();

  event.waitUntil(
    (async () => {
      const isRealReminder = reminderId && reminderId !== 'test' && !data.local;

      if (isRealReminder && (action === 'done' || action === 'snooze' || action === '')) {
        const effectiveAction = action === 'snooze' ? 'snooze' : 'done';
        if (action !== '' || data.type === 'reminder') {
          await callAck(reminderId, effectiveAction, 10);
        }
      }

      await notifyClients({
        type: 'reminder-acked',
        reminderId,
        action: action || (data.type === 'reminder' ? 'done' : 'open'),
      });

      if (action === 'snooze') return;

      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await c.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow('/');
      }
    })(),
  );
});

self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  console.log('[sw] notification closed without interaction', data?.reminderId);
});

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
