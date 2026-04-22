// Web Push sender: VAPID (RFC 8292) + ECE aes128gcm encryption (RFC 8291 + RFC 8188)
// Realizatsiya na chistom Web Crypto API, bez vneshnikh zavisimostey.

const enc = new TextEncoder();

// ---------- base64url helpers ----------

export function b64uEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// ---------- VAPID signing key import ----------

async function importVapidPrivateKey(privB64u, pubB64u) {
  const privBytes = b64uDecode(privB64u);
  const pubBytes = b64uDecode(pubB64u);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY dolzhen byt 65-baytnym uncompressed P-256 klyuchom (base64url)');
  }
  if (privBytes.length !== 32) {
    throw new Error('VAPID_PRIVATE_KEY dolzhen byt 32-baytnym skalyarom (base64url)');
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(pubBytes.slice(1, 33)),
    y: b64uEncode(pubBytes.slice(33, 65)),
    d: b64uEncode(privBytes),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

// ---------- VAPID JWT (ES256) ----------

export async function createVapidJWT(audience, subject, privB64u, pubB64u, ttlSec = 12 * 3600) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
    sub: subject,
  };
  const signingInput =
    b64uEncode(enc.encode(JSON.stringify(header))) +
    '.' +
    b64uEncode(enc.encode(JSON.stringify(payload)));

  const key = await importVapidPrivateKey(privB64u, pubB64u);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(signingInput),
  );
  return signingInput + '.' + b64uEncode(sig);
}

// ---------- HKDF helper ----------

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ---------- ECE aes128gcm encryption ----------

async function encryptPayload(payload, p256dhB64u, authB64u) {
  const plaintext = payload instanceof Uint8Array ? payload : enc.encode(String(payload));

  const localPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localPair.publicKey));

  const uaPubBytes = b64uDecode(p256dhB64u);
  const uaPubKey = await crypto.subtle.importKey(
    'raw',
    uaPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, localPair.privateKey, 256),
  );

  const authSecret = b64uDecode(authB64u);
  const infoPrk = concat(enc.encode('WebPush: info\0'), uaPubBytes, localPubRaw);
  const prkKey = await hkdf(authSecret, ecdhSecret, infoPrk, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prkKey, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prkKey, enc.encode('Content-Encoding: nonce\0'), 12);

  const padded = concat(plaintext, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded),
  );

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(localPubRaw, 21);

  return concat(header, ciphertext);
}

// ---------- Main sender ----------

export async function sendWebPush(subscription, payload, vapid, opts = {}) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await createVapidJWT(audience, vapid.subject, vapid.privateKey, vapid.publicKey);

  const body =
    payload == null
      ? null
      : await encryptPayload(
          typeof payload === 'string' ? payload : JSON.stringify(payload),
          subscription.p256dh,
          subscription.auth,
        );

  const headers = {
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    TTL: String(opts.ttl ?? 60),
    Urgency: opts.urgency ?? 'high',
  };
  if (opts.topic) headers.Topic = opts.topic;
  if (body) {
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Length'] = String(body.length);
  }

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body,
  });

  const text = await response.text().catch(() => '');
  return {
    status: response.status,
    ok: response.ok,
    gone: response.status === 410 || response.status === 404,
    body: text,
  };
}
