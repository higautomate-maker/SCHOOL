PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS demo_state (
  tenant_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
