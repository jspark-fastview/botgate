-- V1__init.sql — Postgres 16 (K8s 환경).
-- 기존 SQLite schema.js / schema.sql 의 Postgres 변환.
--
-- SQLite → Postgres 차이:
--   INTEGER PRIMARY KEY AUTOINCREMENT  → BIGSERIAL PRIMARY KEY
--   TEXT NOT NULL DEFAULT (datetime('now')) → TIMESTAMPTZ NOT NULL DEFAULT now()
--   INSERT OR IGNORE  → INSERT ... ON CONFLICT DO NOTHING
--   INTEGER (boolean 용) → 유지 (0/1) — app 코드 일관성
--   TEXT (JSON) → JSONB (네이티브 + 인덱싱 가능)

-- ── tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
  id          TEXT PRIMARY KEY,
  token       TEXT UNIQUE NOT NULL,
  owner       TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  user_id     TEXT
);

-- ── access_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_logs (
  id          BIGSERIAL PRIMARY KEY,
  token       TEXT,
  bot_ua      TEXT NOT NULL,
  domain      TEXT NOT NULL,
  ip          TEXT NOT NULL,
  path        TEXT,
  verified    INTEGER NOT NULL DEFAULT 0,
  billed      INTEGER NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'bot',
  bot_purpose TEXT NOT NULL DEFAULT 'generic',
  bot_name    TEXT,
  bot_vendor  TEXT,
  blocked     INTEGER NOT NULL DEFAULT 0,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_token FOREIGN KEY (token) REFERENCES tokens(token)
);
CREATE INDEX IF NOT EXISTS idx_access_logs_token  ON access_logs(token);
CREATE INDEX IF NOT EXISTS idx_access_logs_ts     ON access_logs(ts);
CREATE INDEX IF NOT EXISTS idx_access_logs_domain ON access_logs(domain);

-- ── users / sessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('strict_mode', '1') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('bypass_mode', '0') ON CONFLICT DO NOTHING;

-- ── purpose_policies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purpose_policies (
  purpose TEXT PRIMARY KEY,
  action  TEXT NOT NULL DEFAULT 'pass'
);
INSERT INTO purpose_policies (purpose, action) VALUES
  ('ai_training',   'verify'),
  ('ai_search',     'meter'),
  ('ai_assistant',  'pass'),
  ('search_engine', 'pass'),
  ('seo',           'block'),
  ('social',        'pass'),
  ('generic',       'pass')
ON CONFLICT DO NOTHING;

-- ── channels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  domain              TEXT NOT NULL UNIQUE,
  domain_canonical    TEXT,
  upstream            TEXT NOT NULL DEFAULT '',
  active              INTEGER NOT NULL DEFAULT 1,
  owner_id            TEXT,
  site_key_hash       TEXT,
  verify_token        TEXT,
  verified_at         TIMESTAMPTZ,
  verification_method TEXT,
  integration_mode    TEXT NOT NULL DEFAULT 'reverse_proxy',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── path_rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS path_rules (
  id         TEXT PRIMARY KEY,
  pattern    TEXT NOT NULL UNIQUE,
  action     TEXT NOT NULL DEFAULT 'meter'
               CHECK(action IN ('allow','block','meter')),
  note       TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO path_rules (id, pattern, action, note) VALUES
  ('pr_1', '/robots.txt',   'allow', '크롤러 기본 허용'),
  ('pr_2', '/sitemap.xml',  'allow', '사이트맵 허용'),
  ('pr_3', '/sitemap*.xml', 'allow', '다국어 사이트맵 허용'),
  ('pr_4', '/admin/*',      'block', '관리자 영역 차단'),
  ('pr_5', '/articles/*',   'meter', '기사 콘텐츠 과금'),
  ('pr_6', '/reports/*',    'meter', '리포트 과금'),
  ('pr_7', '/columns/*',    'meter', '칼럼 과금')
ON CONFLICT DO NOTHING;

-- ── bot_catalog ───────────────────────────────────────────────────────
-- patterns 를 JSONB 로 (Postgres 네이티브). JSON path 쿼리/인덱싱 가능.
CREATE TABLE IF NOT EXISTS bot_catalog (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  vendor       TEXT NOT NULL,
  purpose      TEXT NOT NULL,
  patterns     JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_malicious INTEGER NOT NULL DEFAULT 0,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious) VALUES
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
  ('Apache-HttpClient',    'Library',      'malicious',     '["apache-httpclient"]', 1)
ON CONFLICT (name) DO NOTHING;
