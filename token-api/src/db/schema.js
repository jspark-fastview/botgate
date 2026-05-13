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
  `ALTER TABLE access_logs ADD COLUMN path     TEXT`,
  `ALTER TABLE access_logs ADD COLUMN billed   INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE access_logs ADD COLUMN category    TEXT NOT NULL DEFAULT 'bot'`,
  `ALTER TABLE access_logs ADD COLUMN bot_purpose TEXT NOT NULL DEFAULT 'generic'`,
  `ALTER TABLE access_logs ADD COLUMN bot_name    TEXT`,
  `ALTER TABLE access_logs ADD COLUMN bot_vendor  TEXT`,
  `ALTER TABLE access_logs ADD COLUMN blocked     INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE channels    ADD COLUMN owner_id TEXT`,
  `ALTER TABLE tokens      ADD COLUMN user_id  TEXT`,
  // ── 외부 통합/사이트 검증 (Tollbit-style) ───────────────────────
  // site_key_hash: 외부에서 /v1/verify 호출 시 X-Site-Key 검증 (bcrypt/sha256 해시)
  // verify_token: 도메인 소유 검증용 nonce — DNS TXT 또는 well-known 으로 노출 요구
  // verified_at:  소유 검증 통과 시점 (null = pending)
  // verification_method: 'dns_txt' | 'well_known' | null
  // integration_mode: 'reverse_proxy' (기본, 우리 ALB 가 origin) | 'external' (퍼블리셔가 SDK/Worker 로 호출)
  `ALTER TABLE channels    ADD COLUMN site_key_hash       TEXT`,
  `ALTER TABLE channels    ADD COLUMN verify_token        TEXT`,
  `ALTER TABLE channels    ADD COLUMN verified_at         TEXT`,
  `ALTER TABLE channels    ADD COLUMN verification_method TEXT`,
  `ALTER TABLE channels    ADD COLUMN integration_mode    TEXT NOT NULL DEFAULT 'reverse_proxy'`,
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

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 전역 설정 (key/value)
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 기본값
  -- strict_mode = '1' : rDNS 실패 시 토큰 없으면 차단(현재 동작)
  -- strict_mode = '0' : rDNS 실패해도 통과 (verified=false 로깅만)
  INSERT OR IGNORE INTO settings (key, value) VALUES ('strict_mode', '1');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('bypass_mode', '0');

  -- 봇 목적(purpose)별 정책
  -- action: pass | meter | verify | token_only | block | gone
  --   pass       : 그냥 통과
  --   meter      : 통과 + 과금
  --   verify     : rDNS 검증 (실패 시 strict_mode 따름) — AI 봇 기본
  --   token_only : 토큰 있어야만 통과
  --   block      : 403 차단
  --   gone       : 410 차단 (SEO 친화 — 색인 회수)
  CREATE TABLE IF NOT EXISTS purpose_policies (
    purpose TEXT PRIMARY KEY,
    action  TEXT NOT NULL DEFAULT 'pass'
  );

  INSERT OR IGNORE INTO purpose_policies (purpose, action) VALUES
    ('ai_training',   'verify'),
    ('ai_search',     'meter'),
    ('ai_assistant',  'pass'),
    ('search_engine', 'pass'),
    ('seo',           'block'),
    ('social',        'pass'),
    ('generic',       'pass');
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

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

  CREATE TABLE IF NOT EXISTS bot_catalog (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    vendor       TEXT NOT NULL,
    purpose      TEXT NOT NULL,
    patterns     TEXT NOT NULL DEFAULT '[]',
    is_malicious INTEGER NOT NULL DEFAULT 0,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO bot_catalog (name, vendor, purpose, patterns, is_malicious) VALUES
    ('GPTBot',               'OpenAI',       'ai_training',   '["GPTBot"]', 0),
    ('ClaudeBot',            'Anthropic',    'ai_training',   '["ClaudeBot"]', 0),
    ('Claude-Web',           'Anthropic',    'ai_training',   '["Claude-Web"]', 0),
    ('Anthropic-AI',         'Anthropic',    'ai_training',   '["anthropic-ai"]', 0),
    ('Meta-ExternalAgent',   'Meta',         'ai_training',   '["Meta-ExternalAgent"]', 0),
    ('Meta-ExternalFetcher', 'Meta',         'ai_training',   '["Meta-ExternalFetcher"]', 0),
    ('FacebookBot',          'Meta',         'ai_training',   '["FacebookBot"]', 0),
    ('Bytespider',           'ByteDance',    'ai_training',   '["Bytespider"]', 0),
    ('TikTokSpider',         'ByteDance',    'ai_training',   '["TikTokSpider"]', 0),
    ('Amazonbot',            'Amazon',       'ai_training',   '["Amazonbot"]', 0),
    ('CCBot',                'CommonCrawl',  'ai_training',   '["CCBot"]', 0),
    ('Google-Extended',      'Google',       'ai_training',   '["Google-Extended"]', 0),
    ('Applebot-Extended',    'Apple',        'ai_training',   '["Applebot-Extended"]', 0),
    ('Cohere-AI',            'Cohere',       'ai_training',   '["cohere-ai"]', 0),
    ('Diffbot',              'Diffbot',      'ai_training',   '["Diffbot"]', 0),
    ('ImagesiftBot',         'Imagesift',    'ai_training',   '["ImagesiftBot"]', 0),
    ('Omgili',               'Webz.io',      'ai_training',   '["Omgili","Omgilibot"]', 0),
    ('PetalBot',             'Huawei',       'ai_training',   '["PetalBot"]', 0),
    ('DeepSeekBot',          'DeepSeek',     'ai_training',   '["DeepSeekBot"]', 0),
    ('Qwenbot',              'Alibaba',      'ai_training',   '["Qwenbot","Qwen-Bot"]', 0),
    ('MistralBot',           'Mistral',      'ai_training',   '["MistralBot"]', 0),
    ('PerplexityBot',        'Perplexity',   'ai_search',     '["PerplexityBot"]', 0),
    ('OAI-SearchBot',        'OpenAI',       'ai_search',     '["OAI-SearchBot"]', 0),
    ('YouBot',               'You.com',      'ai_search',     '["YouBot"]', 0),
    ('xAI-SearchBot',        'xAI',          'ai_search',     '["xAI-SearchBot"]', 0),
    ('ChatGPT-User',         'OpenAI',       'ai_assistant',  '["ChatGPT-User"]', 0),
    ('Perplexity-User',      'Perplexity',   'ai_assistant',  '["Perplexity-User"]', 0),
    ('Manus Bot',            'Manus',        'ai_assistant',  '["ManusBot","Manus Bot"]', 0),
    ('DuckAssistBot',        'DuckDuckGo',   'ai_assistant',  '["DuckAssistBot"]', 0),
    ('Googlebot',            'Google',       'search_engine', '["Googlebot"]', 0),
    ('BingBot',              'Microsoft',    'search_engine', '["bingbot","BingBot"]', 0),
    ('Applebot',             'Apple',        'search_engine', '["Applebot"]', 0),
    ('Baiduspider',          'Baidu',        'search_engine', '["Baiduspider"]', 0),
    ('YandexBot',            'Yandex',       'search_engine', '["YandexBot"]', 0),
    ('DuckDuckBot',          'DuckDuckGo',   'search_engine', '["DuckDuckBot"]', 0),
    ('Yeti',                 'Naver',        'search_engine', '["Yeti"]', 0),
    ('Brave SearchBot',      'Brave',        'search_engine', '["Brave SearchBot"]', 0),
    ('SemrushBot',           'Semrush',      'seo',           '["SemrushBot"]', 0),
    ('AhrefsBot',            'Ahrefs',       'seo',           '["AhrefsBot"]', 0),
    ('MJ12bot',              'Majestic',     'seo',           '["MJ12bot"]', 0),
    ('DotBot',               'Moz',          'seo',           '["DotBot"]', 0),
    ('BLEXBot',              'WebMeUp',      'seo',           '["BLEXBot"]', 0),
    ('DataForSEOBot',        'DataForSEO',   'seo',           '["DataForSeoBot"]', 0),
    ('serpstatbot',          'Serpstat',     'seo',           '["serpstatbot"]', 0),
    ('Screaming Frog',       'Screaming Frog','seo',          '["Screaming Frog SEO Spider"]', 0),
    ('Slackbot',             'Slack',        'social',        '["Slackbot"]', 0),
    ('Twitterbot',           'Twitter/X',    'social',        '["Twitterbot"]', 0),
    ('FacebookExternalHit',  'Meta',         'social',        '["facebookexternalhit"]', 0),
    ('LinkedInBot',          'LinkedIn',     'social',        '["LinkedInBot"]', 0),
    ('WhatsApp',             'Meta',         'social',        '["WhatsApp"]', 0),
    ('TelegramBot',          'Telegram',     'social',        '["TelegramBot"]', 0),
    ('Discordbot',           'Discord',      'social',        '["Discordbot"]', 0),
    ('KakaoTalk-scrap',      'Kakao',        'social',        '["kakaotalk-scrap","kakaostory-scrap"]', 0),
    ('Pinterestbot',         'Pinterest',    'social',        '["Pinterest"]', 0),
    ('AdsTxtCrawler',        '(다양)',        'generic',       '["ads.txt","sellers.json"]', 0),
    ('Nikto',                'Attack',       'malicious',     '["nikto"]', 1),
    ('SQLMap',               'Attack',       'malicious',     '["sqlmap"]', 1),
    ('Acunetix',             'Attack',       'malicious',     '["acunetix"]', 1),
    ('Nessus',               'Attack',       'malicious',     '["nessus"]', 1),
    ('Nuclei',               'Attack',       'malicious',     '["nuclei"]', 1),
    ('OpenVAS',              'Attack',       'malicious',     '["openvas"]', 1),
    ('w3af',                 'Attack',       'malicious',     '["w3af"]', 1),
    ('WPScan',               'Attack',       'malicious',     '["wpscan"]', 1),
    ('Masscan',              'Attack',       'malicious',     '["masscan"]', 1),
    ('Zgrab',                'Attack',       'malicious',     '["zgrab"]', 1),
    ('Nmap',                 'Attack',       'malicious',     '["nmap scripting","nmap-scan"]', 1),
    ('Scrapy',               'Scraper',      'malicious',     '["scrapy"]', 1),
    ('HTTrack',              'Scraper',      'malicious',     '["httrack"]', 1),
    ('Wget',                 'Scraper',      'malicious',     '["wget/"]', 1),
    ('LibWWW-Perl',          'Scraper',      'malicious',     '["libwww-perl"]', 1),
    ('Python-Requests',      'Library',      'malicious',     '["python-requests"]', 1),
    ('Python-urllib',        'Library',      'malicious',     '["python-urllib"]', 1),
    ('Go-Http-Client',       'Library',      'malicious',     '["go-http-client"]', 1),
    ('Java-Http',            'Library',      'malicious',     '["java/1.","java/2."]', 1),
    ('Apache-HttpClient',    'Library',      'malicious',     '["apache-httpclient"]', 1);
`)
