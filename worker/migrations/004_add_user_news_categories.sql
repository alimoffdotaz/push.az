-- Vybранные kategorii interesnыkh zаметoк v push / Telegram (JSON massiv id)
ALTER TABLE users ADD COLUMN news_categories TEXT NOT NULL DEFAULT '[]';
