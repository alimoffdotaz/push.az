// Namaz (salah) pushes — Shia / Ja'fari calculation via Aladhan.
// method=0: Shia Ithna-Ashari, Leva Institute, Qum
// midnightMode=1: Jafari midnight = midpoint Sunset → Fajr

import { sendWebPush } from './push.js';

/** Pyat namazov + polnoch po dzhafari (seredina zakata–fadjra). */
export const NAMAZ_PRAYER_IDS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'midnight'];

export const NAMAZ_LEAD_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60];

const PRAYER_EMOJI = {
  fajr: '🌅',
  dhuhr: '☀️',
  asr: '🌤️',
  maghrib: '🌇',
  isha: '🌙',
  midnight: '🌑',
};

const API_TIMING_KEYS = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
  midnight: 'Midnight',
};

const PRAYER_LABEL = {
  ru: {
    fajr: 'Фаджр',
    dhuhr: 'Зухр',
    asr: 'Аср',
    maghrib: 'Магриб',
    isha: 'Иша',
    midnight: 'Полночь',
    title: (name, hm) => `${name} · ${hm}`,
    body: (name, hm) => `Время намаза (джафари, Кум): ${name} — ${hm}.`,
    body_midnight: (hm) =>
      `Полночь по джафари (середина заката–фаджра): ${hm}.\nДо этого — время ночных намазов.`,
    fajr_pre1h_title: (hm) => `Фаджр через час · ${hm}`,
    fajr_pre1h_body: (hm) => `Через час утренний намаз (фаджр) — ${hm}.`,
  },
  az: {
    fajr: 'Fəcr',
    dhuhr: 'Zöhr',
    asr: 'Əsr',
    maghrib: 'Məğrib',
    isha: 'İşa',
    midnight: 'Geceyarı',
    title: (name, hm) => `${name} · ${hm}`,
    body: (name, hm) => `Namaz vaxtı (Cəfəri, Qum): ${name} — ${hm}.`,
    body_midnight: (hm) =>
      `Cəfəri geceyarı (qürub–fəcr ortası): ${hm}.\nBuna qədər gecə namazları vaxtıdır.`,
    fajr_pre1h_title: (hm) => `Fəcr bir saat sonra · ${hm}`,
    fajr_pre1h_body: (hm) => `Bir saat sonra səhər namazı (fəcr) — ${hm}.`,
  },
  en: {
    fajr: 'Fajr',
    dhuhr: 'Dhuhr',
    asr: 'Asr',
    maghrib: 'Maghrib',
    isha: 'Isha',
    midnight: 'Midnight',
    title: (name, hm) => `${name} · ${hm}`,
    body: (name, hm) => `Prayer time (Ja'fari, Qum): ${name} — ${hm}.`,
    body_midnight: (hm) =>
      `Ja'fari midnight (midpoint sunset–Fajr): ${hm}.\nNight prayers are until this time.`,
    fajr_pre1h_title: (hm) => `Fajr in one hour · ${hm}`,
    fajr_pre1h_body: (hm) => `Morning prayer (Fajr) is in one hour — ${hm}.`,
  },
};

function pickLang(lang) {
  return lang === 'az' || lang === 'en' ? lang : 'ru';
}

export function normalizeNamazPrayers(input) {
  if (!Array.isArray(input)) return [...NAMAZ_PRAYER_IDS];
  const out = [];
  for (const x of input) {
    const id = String(x || '').toLowerCase();
    if (NAMAZ_PRAYER_IDS.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeLeadMin(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  const allowed = NAMAZ_LEAD_MINUTES;
  if (allowed.includes(n)) return n;
  const clamped = Math.max(0, Math.min(60, Math.round(n)));
  let best = allowed[0];
  let dist = Math.abs(clamped - best);
  for (const a of allowed) {
    const d = Math.abs(clamped - a);
    if (d < dist) {
      best = a;
      dist = d;
    }
  }
  return best;
}

export function parseNamazSettings(row) {
  if (!row) {
    return {
      enabled: false,
      lat: null,
      lng: null,
      city: '',
      timezone: '',
      prayers: [...NAMAZ_PRAYER_IDS],
      leadMin: 10,
      fajrPre1h: true,
    };
  }
  let prayers = [...NAMAZ_PRAYER_IDS];
  try {
    prayers = normalizeNamazPrayers(JSON.parse(row.namaz_prayers || '[]'));
    if (!prayers.length) prayers = [...NAMAZ_PRAYER_IDS];
  } catch {
    prayers = [...NAMAZ_PRAYER_IDS];
  }
  return {
    enabled: Number(row.namaz_enabled) === 1,
    lat: row.namaz_lat == null ? null : Number(row.namaz_lat),
    lng: row.namaz_lng == null ? null : Number(row.namaz_lng),
    city: row.namaz_city || '',
    timezone: row.namaz_timezone || '',
    prayers,
    leadMin: normalizeLeadMin(row.namaz_lead_min),
    fajrPre1h: row.namaz_fajr_pre1h == null ? true : Number(row.namaz_fajr_pre1h) === 1,
  };
}

function cleanHm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

function hmToMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function getZonedParts(nowMs, timeZone) {
  const tz = timeZone || 'UTC';
  let parts;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    parts = {};
    for (const p of dtf.formatToParts(new Date(nowMs))) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
  } catch {
    const d = new Date(nowMs);
    return {
      dateKey: d.toISOString().slice(0, 10),
      minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
  }
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + minute,
  };
}

export async function fetchNamazTimings(lat, lng, unixSec) {
  const url =
    `https://api.aladhan.com/v1/timings/${unixSec}` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&method=0&midnightMode=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('aladhan HTTP ' + res.status);
  const json = await res.json();
  if (json.code !== 200 || !json.data?.timings) throw new Error('aladhan bad payload');
  const t = json.data.timings;
  const timings = {};
  for (const [id, key] of Object.entries(API_TIMING_KEYS)) {
    timings[id] = cleanHm(t[key]);
  }
  timings.sunset = cleanHm(t.Sunset);
  const timezone = json.data.meta?.timezone || '';
  return { timings, timezone, methodName: json.data.meta?.method?.name || '' };
}

export async function getTodayNamazForUser(env, userId, lat, lng, timezoneHint, nowMs) {
  const tzGuess = timezoneHint || 'UTC';
  const { dateKey } = getZonedParts(nowMs, tzGuess);
  const cached = await env.DB.prepare(
    `SELECT timings_json, timezone, fetched_at FROM namaz_day_cache WHERE user_id = ?1 AND date_key = ?2`,
  )
    .bind(userId, dateKey)
    .first();
  if (cached?.timings_json && nowMs - Number(cached.fetched_at || 0) < 18 * 60 * 60 * 1000) {
    try {
      return {
        dateKey,
        timings: JSON.parse(cached.timings_json),
        timezone: cached.timezone || tzGuess,
        cached: true,
      };
    } catch {}
  }

  const fetched = await fetchNamazTimings(lat, lng, Math.floor(nowMs / 1000));
  const tz = fetched.timezone || tzGuess;
  const zoned = getZonedParts(nowMs, tz);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO namaz_day_cache (user_id, date_key, timings_json, timezone, fetched_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(userId, zoned.dateKey, JSON.stringify(fetched.timings), tz, nowMs)
    .run();
  return { dateKey: zoned.dateKey, timings: fetched.timings, timezone: tz, cached: false };
}

function namazTitlePrefix(prayerId) {
  const e = PRAYER_EMOJI[prayerId] || '🕌';
  return `🕌${e} `;
}

function inNamazWindow(nowMin, targetMin, windowMin) {
  let delta = nowMin - targetMin;
  if (delta < 0) delta += 1440;
  return delta < windowMin;
}

function buildNamazCopy(lang, prayerId, timings) {
  const L = PRAYER_LABEL[pickLang(lang)] || PRAYER_LABEL.ru;
  const hm = timings[prayerId] || '';
  const name = L[prayerId] || prayerId;
  const prefix = namazTitlePrefix(prayerId);
  if (prayerId === 'midnight') {
    return { title: prefix + L.title(name, hm), body: L.body_midnight(hm) };
  }
  return { title: prefix + L.title(name, hm), body: L.body(name, hm) };
}

function buildFajrPre1hCopy(lang, timings) {
  const L = PRAYER_LABEL[pickLang(lang)] || PRAYER_LABEL.ru;
  const hm = timings.fajr || '';
  return {
    title: namazTitlePrefix('fajr') + L.fajr_pre1h_title(hm),
    body: L.fajr_pre1h_body(hm),
  };
}

async function alreadySent(env, userId, dateKey, prayer) {
  const row = await env.DB.prepare(
    `SELECT sent_at FROM namaz_sent WHERE user_id = ?1 AND date_key = ?2 AND prayer = ?3`,
  )
    .bind(userId, dateKey, prayer)
    .first();
  return !!row;
}

async function markSent(env, userId, dateKey, prayer, nowMs) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO namaz_sent (user_id, date_key, prayer, sent_at) VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(userId, dateKey, prayer, nowMs)
    .run();
}

export async function sendNamazPush(env, vapid, userId, lang, prayerId, copy) {
  const devicesRows = await env.DB.prepare(
    `SELECT * FROM devices WHERE user_id = ?1 AND revoked_at IS NULL`,
  )
    .bind(userId)
    .all();
  const devices = devicesRows.results || [];
  if (!vapid || !devices.length) return { web: 0 };

  let web = 0;
  for (const d of devices) {
    const result = await sendWebPush(
      { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth },
      {
        type: 'namaz',
        prayer: prayerId,
        title: copy.title,
        body: copy.body,
        lang: lang || 'ru',
        url: '/',
      },
      vapid,
      { ttl: 300, urgency: 'high', topic: `n-${userId.slice(0, 8)}-${prayerId}` },
    );
    if (result.gone) {
      await env.DB.prepare(`UPDATE devices SET revoked_at = ?1 WHERE id = ?2`)
        .bind(Date.now(), d.id)
        .run();
      continue;
    }
    if (result.ok) web++;
  }
  return { web };
}

/**
 * Cron: dlya vklyuchennykh userov, esli lokalnaya minuta popadaet v okno namaza — odin push.
 */
export async function runNamazScheduler(env, vapid, sendTelegramFn) {
  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT id, lang, namaz_lat, namaz_lng, namaz_timezone, namaz_prayers, namaz_lead_min, namaz_fajr_pre1h
       FROM users
       WHERE namaz_enabled = 1
         AND namaz_lat IS NOT NULL
         AND namaz_lng IS NOT NULL
       LIMIT 300`,
    ).all();
  } catch (err) {
    console.warn('[namaz] users query failed (migration?)', err?.message || err);
    return;
  }

  const list = rows.results || [];
  if (!list.length) return;

  const nowMs = Date.now();
  const WINDOW_MIN = 2;

  for (const u of list) {
    try {
      const prayers = normalizeNamazPrayers(JSON.parse(u.namaz_prayers || '[]'));
      if (!prayers.length) continue;
      const day = await getTodayNamazForUser(
        env,
        u.id,
        Number(u.namaz_lat),
        Number(u.namaz_lng),
        u.namaz_timezone,
        nowMs,
      );
      const zoned = getZonedParts(nowMs, day.timezone || u.namaz_timezone || 'UTC');
      const lang = u.lang || 'ru';
      const leadMin = normalizeLeadMin(u.namaz_lead_min);
      const fajrPre1h = u.namaz_fajr_pre1h == null ? true : Number(u.namaz_fajr_pre1h) === 1;

      const fire = async (eventId, copy) => {
        if (await alreadySent(env, u.id, day.dateKey, eventId)) return;
        await sendNamazPush(env, vapid, u.id, lang, eventId, copy);
        if (typeof sendTelegramFn === 'function') {
          try {
            await sendTelegramFn(env, u.id, copy.title, copy.body, lang);
          } catch (err) {
            console.warn('[namaz] tg', err?.message || err);
          }
        }
        await markSent(env, u.id, day.dateKey, eventId, nowMs);
      };

      for (const prayerId of prayers) {
        const hm = day.timings[prayerId];
        if (!hm) continue;
        const pMin = hmToMinutes(hm);
        if (pMin == null) continue;
        const target = ((pMin - leadMin) % 1440 + 1440) % 1440;
        if (!inNamazWindow(zoned.minutes, target, WINDOW_MIN)) continue;
        await fire(prayerId, buildNamazCopy(lang, prayerId, day.timings));
      }

      // Extra: hour before Fajr (skip if lead is already 60 min — same moment).
      if (fajrPre1h && leadMin !== 60 && day.timings.fajr) {
        const fajrMin = hmToMinutes(day.timings.fajr);
        if (fajrMin != null) {
          const target = ((fajrMin - 60) % 1440 + 1440) % 1440;
          if (inNamazWindow(zoned.minutes, target, WINDOW_MIN)) {
            await fire('fajr_pre1h', buildFajrPre1hCopy(lang, day.timings));
          }
        }
      }
    } catch (err) {
      console.warn('[namaz] user', u.id, err?.message || err);
    }
  }
}

async function reverseGeocodeCity(lat, lng, lang) {
  const accept = lang === 'az' ? 'az,ru,en' : lang === 'en' ? 'en,ru' : 'ru,en';
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lng)}&format=json&zoom=10&accept-language=${encodeURIComponent(accept)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'push.az namaz (https://push-az.pages.dev)',
      },
    });
    if (!res.ok) return '';
    const j = await res.json();
    const a = j.address || {};
    return a.city || a.town || a.village || a.municipality || a.state || j.display_name || '';
  } catch {
    return '';
  }
}

export async function handleGetNamaz(request, env, user) {
  const row = await env.DB.prepare(
    `SELECT namaz_enabled, namaz_lat, namaz_lng, namaz_city, namaz_timezone, namaz_prayers, namaz_lead_min, namaz_fajr_pre1h
     FROM users WHERE id = ?1`,
  )
    .bind(user.userId)
    .first();
  const settings = parseNamazSettings(row);
  let today = null;
  if (settings.lat != null && settings.lng != null) {
    try {
      today = await getTodayNamazForUser(
        env,
        user.userId,
        settings.lat,
        settings.lng,
        settings.timezone,
        Date.now(),
      );
    } catch (err) {
      console.warn('[namaz] preview', err?.message || err);
    }
  }
  return { namaz: settings, today };
}

export async function handleSetNamaz(request, env, user) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const enabled = !!body.enabled;
  const lat = body.lat == null || body.lat === '' ? null : Number(body.lat);
  const lng = body.lng == null || body.lng === '' ? null : Number(body.lng);
  if (enabled) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { error: 'location required', status: 400 };
    }
  }
  let prayers = normalizeNamazPrayers(body.prayers);
  if (!prayers.length) prayers = [...NAMAZ_PRAYER_IDS];
  const leadMin = normalizeLeadMin(body.leadMin ?? body.lead_min);
  const fajrPre1h = body.fajrPre1h !== undefined ? !!body.fajrPre1h : true;

  let city = typeof body.city === 'string' ? body.city.slice(0, 120) : '';
  let timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 80) : '';

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (!city) city = (await reverseGeocodeCity(lat, lng, user.lang || 'ru')).slice(0, 120);
    try {
      const fetched = await fetchNamazTimings(lat, lng, Math.floor(Date.now() / 1000));
      if (fetched.timezone) timezone = fetched.timezone;
      const zoned = getZonedParts(Date.now(), timezone || 'UTC');
      await env.DB.prepare(`DELETE FROM namaz_day_cache WHERE user_id = ?1`).bind(user.userId).run();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO namaz_day_cache (user_id, date_key, timings_json, timezone, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
        .bind(user.userId, zoned.dateKey, JSON.stringify(fetched.timings), timezone, Date.now())
        .run();
    } catch (err) {
      console.warn('[namaz] fetch on save', err?.message || err);
    }
  }

  await env.DB.prepare(
    `UPDATE users SET
       namaz_enabled = ?1,
       namaz_lat = ?2,
       namaz_lng = ?3,
       namaz_city = ?4,
       namaz_timezone = ?5,
       namaz_prayers = ?6,
       namaz_lead_min = ?7,
       namaz_fajr_pre1h = ?8
     WHERE id = ?9`,
  )
    .bind(
      enabled ? 1 : 0,
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null,
      city || null,
      timezone || null,
      JSON.stringify(prayers),
      leadMin,
      fajrPre1h ? 1 : 0,
      user.userId,
    )
    .run();

  const row = await env.DB.prepare(
    `SELECT namaz_enabled, namaz_lat, namaz_lng, namaz_city, namaz_timezone, namaz_prayers, namaz_lead_min, namaz_fajr_pre1h
     FROM users WHERE id = ?1`,
  )
    .bind(user.userId)
    .first();
  return { ok: true, namaz: parseNamazSettings(row) };
}
