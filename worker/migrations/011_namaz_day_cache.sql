CREATE TABLE IF NOT EXISTS namaz_day_cache (
  user_id      TEXT    NOT NULL,
  date_key     TEXT    NOT NULL,
  timings_json TEXT    NOT NULL,
  timezone     TEXT,
  fetched_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, date_key)
);
