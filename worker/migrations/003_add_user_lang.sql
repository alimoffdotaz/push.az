-- 003_add_user_lang.sql
-- Dobаvlyayem kolonku s predpochtitel'nym yazykom pol'zovatelya (ru | az | en).
-- Vypolnyat' odin raz posle deploya koda, kotoryy uzhe znayet pro lang.

ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'ru';
