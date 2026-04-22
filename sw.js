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

  if (challenge && Array.isArray(challenge.buttons) && challenge.buttons.length === 2) {
    options.actions = [
      { action: 'btn-' + challenge.buttons[0], title: String(challenge.buttons[0]) },
      { action: 'btn-' + challenge.buttons[1], title: String(challenge.buttons[1]) },
    ];
  } else if (isReminder) {
    options.actions = [
      { action: 'done', title: '\u2713 Gotovo' },
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

      // === CHALLENGE MODE ===
      if (challenge && typeof action === 'string' && action.startsWith('btn-')) {
        const pressed = Number(action.slice(4));
        if (pressed === Number(challenge.correct)) {
          // Pravil'no \u2192 akaem
          notification.close();
          if (isRealReminder) {
            await callAck(reminderId, 'done', 10);
          }
          await notifyClients({
            type: 'reminder-acked',
            reminderId,
            action: 'done',
          });
          await updateBadgeAfterAck(data);
          await focusClient();
          return;
        } else {
          // Nepravil'naya knopka \u2192 ne akaem, pokazyvaem novyy notif s novym challenge
          notification.close();
          await showWrongAnswer(data);
          return;
        }
      }

      // === CHALLENGE NO PRESSED BUTTON (tap po tyelu) ===
      // Yesli u pusha byl challenge, a polьzovatel' prosto tapnul po kartochke \u2014
      // NE akaem. Prosto otkryvaem prilozheniye.
      if (challenge && !action) {
        notification.close();
        await focusClient();
        return;
      }

      // === BEZ CHALLENGE: standartnaya logika ===
      notification.close();

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

      if (action !== 'snooze') {
        await updateBadgeAfterAck(data);
      }

      if (action === 'snooze') return;

      await focusClient();
    })(),
  );
});

self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  console.log('[sw] notification closed without interaction', data?.reminderId);
});

// ============================================================================
// Wrong-answer re-show \u2014 lokal'no generiruyem novyy challenge
// ============================================================================

async function showWrongAnswer(prevData) {
  const reminderId = prevData.reminderId || '';
  const failures = Number(prevData.challengeFailures || 0) + 1;
  const newChallenge = makeLocalChallenge();
  const prefix = failures >= 2 ? '\u203c Vnimatel\u2019no. ' : 'Nepravil\u2019no. ';
  const body = prefix + newChallenge.phrase;

  await self.registration.showNotification(prevData.title || 'push.az', {
    body,
    icon: '/icons/icon-alert.svg',
    badge: '/icons/icon.svg',
    tag: 'push-az-' + (reminderId || 'generic'),
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 100, 300],
    data: {
      ...prevData,
      challenge: newChallenge,
      challengeFailures: failures,
    },
    actions: [
      { action: 'btn-' + newChallenge.buttons[0], title: String(newChallenge.buttons[0]) },
      { action: 'btn-' + newChallenge.buttons[1], title: String(newChallenge.buttons[1]) },
    ],
  });
}

function makeLocalChallenge() {
  const digits = [2, 3, 4, 5, 6, 7, 8, 9];
  const correct = digits[Math.floor(Math.random() * digits.length)];
  let distractor;
  do {
    distractor = digits[Math.floor(Math.random() * digits.length)];
  } while (distractor === correct);
  const swap = Math.random() < 0.5;
  const buttons = swap ? [distractor, correct] : [correct, distractor];
  const phrases = [
    (n) => `Hold push, nazhmi [${n}]`,
    (n) => `Long-press \u2192 [${n}]`,
    (n) => `Derzhi i tap [${n}]`,
    (n) => `Na etot raz \u2014 [${n}]`,
  ];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)](correct);
  return { correct, buttons, phrase };
}

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
