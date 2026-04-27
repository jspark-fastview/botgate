import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../../data/botgate.db')

export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 기존 DB 컬럼 추가 마이그레이션 (없는 경우에만)
for (const sql of [
  `ALTER TABLE access_logs ADD COLUMN path   TEXT`,
  `ALTER TABLE access_logs ADD COLUMN billed INTEGER NOT NULL DEFAULT 0`,
]) {
  try { db.exec(sql) } catch (_) { /* 이미 있으면 무시 */ }
}

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
    path       TEXT,
    verified   INTEGER NOT NULL DEFAULT 0,
    billed     INTEGER NOT NULL DEFAULT 0,
    ts         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (token) REFERENCES tokens(token)
  );

  CREATE INDEX IF NOT EXISTS idx_access_logs_token  ON access_logs(token);
  CREATE INDEX IF NOT EXISTS idx_access_logs_ts     ON access_logs(ts);
  CREATE INDEX IF NOT EXISTS idx_access_logs_domain ON access_logs(domain);

  CREATE TABLE IF NOT EXISTS channels (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    domain      TEXT NOT NULL UNIQUE,
    upstream    TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS path_rules (
    id         TEXT PRIMARY KEY,
    pattern    TEXT NOT NULL UNIQUE,
    action     TEXT NOT NULL DEFAULT 'meter'
                 CHECK(action IN ('allow','block','meter')),
    note       TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 기본 룰 (이미 있으면 무시)
  INSERT OR IGNORE INTO path_rules (id, pattern, action, note) VALUES
    ('pr_1', '/robots.txt',     'allow', '크롤러 기본 허용'),
    ('pr_2', '/sitemap.xml',    'allow', '사이트맵 허용'),
    ('pr_3', '/sitemap*.xml',   'allow', '다국어 사이트맵 허용'),
    ('pr_4', '/admin/*',        'block', '관리자 영역 차단'),
    ('pr_5', '/articles/*',     'meter', '기사 콘텐츠 과금'),
    ('pr_6', '/reports/*',      'meter', '리포트 과금'),
    ('pr_7', '/columns/*',      'meter', '칼럼 과금');
`)
