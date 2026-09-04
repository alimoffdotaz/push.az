CREATE TABLE IF NOT EXISTS namaz_sent (
  user_id  TEXT    NOT NULL,
  date_key TEXT    NOT NULL,
  prayer   TEXT    NOT NULL,
  sent_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, date_key, prayer)
);
