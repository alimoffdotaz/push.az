-- Telegram migratsiya — odin zapros na stroku dlya D1 Console.

CREATE TABLE IF NOT EXISTS telegram_links (chat_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, username TEXT, first_name TEXT, linked_at INTEGER NOT NULL, last_msg_at INTEGER);

CREATE INDEX IF NOT EXISTS idx_tg_user ON telegram_links(user_id);

CREATE TABLE IF NOT EXISTS telegram_link_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);

CREATE INDEX IF NOT EXISTS idx_tg_codes_user ON telegram_link_codes(user_id);

CREATE INDEX IF NOT EXISTS idx_tg_codes_expires ON telegram_link_codes(expires_at);
