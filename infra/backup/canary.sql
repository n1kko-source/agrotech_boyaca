CREATE TABLE IF NOT EXISTS agrotech_backup_canary (
  id smallint PRIMARY KEY,
  dumped_at timestamptz NOT NULL
);
INSERT INTO agrotech_backup_canary (id, dumped_at)
VALUES (1, now())
ON CONFLICT (id) DO UPDATE SET dumped_at = excluded.dumped_at;
