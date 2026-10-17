CREATE TABLE IF NOT EXISTS birthday_editors (
  id TEXT PRIMARY KEY NOT NULL,
  account_number TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_salt BLOB NOT NULL,
  password_hash BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS birthday_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  editor_id TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (editor_id) REFERENCES birthday_editors(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS birthday_sessions_editor_idx ON birthday_sessions(editor_id);
CREATE INDEX IF NOT EXISTS birthday_sessions_expiry_idx ON birthday_sessions(expires_at_ms);

CREATE TABLE IF NOT EXISTS birthday_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES birthday_editors(id)
);

CREATE TABLE IF NOT EXISTS birthday_site_share (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  share_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS birthday_auth_attempts (
  scope TEXT NOT NULL,
  client_ip TEXT NOT NULL,
  window_start_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (scope, client_ip)
);
CREATE INDEX IF NOT EXISTS birthday_auth_attempts_window_idx ON birthday_auth_attempts(window_start_ms);
