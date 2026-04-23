-- Vypolny po odnomu zaprosu v D1 Console.
-- Kazhdyy zapros = odna stroka. Vstavlyay po odnomu i zhmi Execute.

CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, display_name TEXT, created_at INTEGER NOT NULL, last_login_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports TEXT, device_name TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER);

CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);

CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT, user_agent TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, type TEXT NOT NULL, user_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS idx_challenges_expires ON auth_challenges(expires_at);

ALTER TABLE devices ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

ALTER TABLE reminders ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);

ALTER TABLE push_log ADD COLUMN user_id TEXT;
