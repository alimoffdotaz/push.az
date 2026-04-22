-- push.az D1 schema

-- Ustroystva (brauzernyye podpiski Web Push)
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT    PRIMARY KEY,            -- random UUID (generiruyet PWA)
  endpoint      TEXT    NOT NULL UNIQUE,        -- URL push-servisa (FCM / Apple)
  p256dh        TEXT    NOT NULL,               -- VAPID p256dh key ot brauzera (base64url)
  auth          TEXT    NOT NULL,               -- VAPID auth secret (base64url)
  user_agent    TEXT,                           -- dlya debug: kakoy brauzer/ustroystvo
  created_at    INTEGER NOT NULL,               -- ms timestamp
  last_seen_at  INTEGER NOT NULL,               -- obnovlyayem pri kazhdom sync
  revoked_at    INTEGER                         -- stavim yesli push vernul 410 Gone
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);

-- Reminderu
CREATE TABLE IF NOT EXISTS reminders (
  id              TEXT    PRIMARY KEY,
  device_id       TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  note            TEXT    DEFAULT '',
  fire_at         INTEGER NOT NULL,             -- kogda dolzhen srabotat' (ms)
  repeat          TEXT    NOT NULL DEFAULT 'none',  -- none | daily | weekly | monthly
  tone            TEXT    NOT NULL DEFAULT 'friendly', -- friendly | urgent | funny | aggressive
  status          TEXT    NOT NULL DEFAULT 'active',  -- active | acked | cancelled

  -- state scheduler'a
  send_count      INTEGER NOT NULL DEFAULT 0,   -- skol'ko raz uzhe otpravlyali
  last_sent_at    INTEGER,                      -- kogda v posledniy raz otpravili
  next_attempt_at INTEGER,                      -- kogda posleduyushchaya popytka eskalatsii

  acked_at        INTEGER,                      -- kogda pol'zovatel' nazhal "Gotovo"
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,

  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_device ON reminders(device_id);
CREATE INDEX IF NOT EXISTS idx_reminders_schedule ON reminders(status, next_attempt_at, fire_at);

-- Log otpravlennykh pushey (dlya debug + statistiki)
CREATE TABLE IF NOT EXISTS push_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id  TEXT,
  device_id    TEXT,
  sent_at      INTEGER NOT NULL,
  attempt      INTEGER NOT NULL,                -- 1, 2, 3... dlya eskalatsii
  body         TEXT,                            -- kakoy tekst otpravili (dlya analiza povtorov)
  status       INTEGER,                         -- HTTP status ot push-servisa
  error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_log_reminder ON push_log(reminder_id, sent_at);
