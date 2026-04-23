-- push.az D1 schema (s autentifikatsiey)

-- Pol'zovateli
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,            -- random ULID/UUID
  display_name  TEXT,                           -- chelovecheskoye imya, opcional'no
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

-- WebAuthn credentials (passkeys)
CREATE TABLE IF NOT EXISTS credentials (
  id                TEXT    PRIMARY KEY,        -- credential.id (base64url)
  user_id           TEXT    NOT NULL,
  public_key        TEXT    NOT NULL,           -- base64 public key
  counter           INTEGER NOT NULL DEFAULT 0, -- WebAuthn signature counter
  transports        TEXT,                       -- json array: usb, ble, internal, hybrid
  device_name       TEXT,                       -- "iPhone Face ID", "MacBook Touch ID"
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);

-- Sessii (Bearer tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,              -- random 32-byte hex token
  user_id     TEXT    NOT NULL,
  device_id   TEXT,                             -- s kakogo ustroystva voshli
  user_agent  TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,                 -- 90 dney po umolchaniyu
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- WebAuthn challenges (vremennoye xranilishche dlya begin/finish)
CREATE TABLE IF NOT EXISTS auth_challenges (
  id          TEXT    PRIMARY KEY,              -- random
  challenge   TEXT    NOT NULL,                 -- base64 challenge
  type        TEXT    NOT NULL,                 -- 'registration' | 'authentication'
  user_id     TEXT,                             -- for registration / known user auth
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL                  -- 5 minut
);
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON auth_challenges(expires_at);

-- Ustroystva (brauzernyye podpiski Web Push)
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT    PRIMARY KEY,            -- random UUID (generiruyet PWA)
  user_id       TEXT,                           -- privyazka k userу posle login
  endpoint      TEXT    NOT NULL UNIQUE,
  p256dh        TEXT    NOT NULL,
  auth          TEXT    NOT NULL,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  revoked_at    INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);

-- Reminderu
CREATE TABLE IF NOT EXISTS reminders (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT,                         -- glavnyy "vlаdelets"
  device_id       TEXT    NOT NULL,             -- kakoye ustroystvo sozdalo (dlya migratsii)
  title           TEXT    NOT NULL,
  note            TEXT    DEFAULT '',
  fire_at         INTEGER NOT NULL,
  repeat          TEXT    NOT NULL DEFAULT 'none',
  tone            TEXT    NOT NULL DEFAULT 'friendly',
  status          TEXT    NOT NULL DEFAULT 'active',

  send_count      INTEGER NOT NULL DEFAULT 0,
  last_sent_at    INTEGER,
  next_attempt_at INTEGER,

  acked_at        INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_device ON reminders(device_id);
CREATE INDEX IF NOT EXISTS idx_reminders_schedule ON reminders(status, next_attempt_at, fire_at);

-- Log otpravlennykh pushey
CREATE TABLE IF NOT EXISTS push_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id  TEXT,
  device_id    TEXT,
  user_id      TEXT,
  sent_at      INTEGER NOT NULL,
  attempt      INTEGER NOT NULL,
  body         TEXT,
  status       INTEGER,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_log_reminder ON push_log(reminder_id, sent_at);
