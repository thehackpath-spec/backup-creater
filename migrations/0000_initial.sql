CREATE TABLE IF NOT EXISTS player_data (
  user_id INTEGER PRIMARY KEY,
  donated INTEGER NOT NULL DEFAULT 0,
  raised INTEGER NOT NULL DEFAULT 0,
  purse INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  data_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_versions (
  version_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  donated INTEGER NOT NULL,
  raised INTEGER NOT NULL,
  purse INTEGER NOT NULL,
  pending INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS player_versions_user_id_created_at
  ON player_versions(user_id, created_at DESC);
