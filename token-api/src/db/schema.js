import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../../data/botgate.db')

export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    id          TEXT PRIMARY KEY,
    token       TEXT UNIQUE NOT NULL,
    owner       TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS access_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT,
    bot_ua     TEXT NOT NULL,
    domain     TEXT NOT NULL,
    ip         TEXT NOT NULL,
    verified   INTEGER NOT NULL DEFAULT 0,
    ts         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (token) REFERENCES tokens(token)
  );

  CREATE INDEX IF NOT EXISTS idx_access_logs_token  ON access_logs(token);
  CREATE INDEX IF NOT EXISTS idx_access_logs_ts     ON access_logs(ts);
  CREATE INDEX IF NOT EXISTS idx_access_logs_domain ON access_logs(domain);
`)
