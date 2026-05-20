-- V3: 봇 무한 크롤 방지 + 봇 카탈로그 확장
-- 2026-05-20

-- ── path_rules 강화 — 페이지네이션 / 검색 / 무한 cardinality 차단 ──
-- 범용 패턴 (WordPress + Next.js + 일반 CMS 공통)
-- ⚠️ active=0 으로 seed — 운영자가 admin UI 에서 명시적으로 활성화 (강제 적용 안 함).
-- 채널마다 검색/페이지네이션 URL 구조 다르고 봇 차단 정책도 다르니 운영자 선택.
INSERT INTO path_rules (id, pattern, action, note, active) VALUES
  ('pr_pagination_query',    '*?page=*',         'meter', '페이지네이션 query — 봇 무한 크롤 방지', 0),
  ('pr_pagination_paged',    '*?paged=*',        'meter', '페이지네이션 (WordPress)',              0),
  ('pr_pagination_path_wp',  '/page/*',          'meter', '페이지네이션 path (WordPress)',         0),
  ('pr_search_s',            '*?s=*',            'meter', '검색 (WordPress 기본)',                 0),
  ('pr_search_q',            '*?q=*',            'meter', '검색 (q param)',                        0),
  ('pr_search_query',        '*?search=*',       'meter', '검색 (search param)',                    0),
  ('pr_search_path',         '/search/*',        'meter', '검색 path',                              0),
  ('pr_tag',                 '/tag/*',           'meter', '태그 — 무한 cardinality',               0),
  ('pr_tags',                '/tags/*',          'meter', '태그 (복수형)',                          0),
  ('pr_archive',             '/archive/*',       'meter', '아카이브',                               0),
  ('pr_archives',            '/archives/*',      'meter', '아카이브 (복수형)',                      0),
  ('pr_feed',                '*/feed*',          'allow', 'RSS feed — 정당 봇 (Feedly 등) 허용',    0),
  ('pr_wp_login',            '/wp-login.php',    'block', 'WordPress 로그인 — 봇 차단',            0),
  ('pr_wp_admin_ajax',       '/wp-admin/admin-ajax.php', 'allow', 'WordPress 정상 AJAX 허용',       0),
  ('pr_wp_xmlrpc',           '/xmlrpc.php',      'block', 'WordPress XML-RPC 차단 (악용 빈발)',    0)
ON CONFLICT (pattern) DO NOTHING;

-- ── bot_catalog 확장 — Downloader / Email harvester / Scanner / SEO crawler ──

-- SEO crawlers (purpose=seo) — 마케팅 사이트 분석. 정당 봇이지만 트래픽 큼.
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('AhrefsBot',         'Ahrefs',         'seo',  '["AhrefsBot"]'::jsonb,         0, 1),
  ('SemrushBot',        'Semrush',        'seo',  '["SemrushBot"]'::jsonb,        0, 1),
  ('MJ12bot',           'Majestic',       'seo',  '["MJ12bot"]'::jsonb,           0, 1),
  ('DotBot',            'Moz',            'seo',  '["DotBot"]'::jsonb,            0, 1),
  ('SerpstatBot',       'Serpstat',       'seo',  '["SerpstatBot"]'::jsonb,       0, 1),
  ('BLEXBot',           'WebMeUp',        'seo',  '["BLEXBot"]'::jsonb,           0, 1),
  ('DataForSeoBot',     'DataForSEO',     'seo',  '["DataForSeoBot"]'::jsonb,     0, 1),
  ('SiteAuditBot',      'Moz',            'seo',  '["SiteAuditBot"]'::jsonb,      0, 1),
  ('SeznamBot',         'Seznam',         'seo',  '["SeznamBot"]'::jsonb,         0, 1),
  ('LinkpadBot',        'Linkpad',        'seo',  '["LinkpadBot"]'::jsonb,        0, 1),
  ('SEOkicks',          'SEOkicks',       'seo',  '["SEOkicks"]'::jsonb,          0, 1),
  ('Megaindex',         'Megaindex',      'seo',  '["MegaIndex"]'::jsonb,         0, 1),
  ('BacklinksExtendedBot','SEMrush',      'seo',  '["BacklinksExtendedBot"]'::jsonb, 0, 1),
  ('SiteScoreCrawler',  'SiteScore',      'seo',  '["SiteScoreCrawler"]'::jsonb,  0, 1),
  ('SEOZoomBot',        'SEOZoom',        'seo',  '["SEOZoomBot"]'::jsonb,        0, 1)
ON CONFLICT (name) DO NOTHING;

-- Search engines (purpose=search_engine) — 일반 검색 엔진. 정당 봇.
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('Googlebot',         'Google',         'search_engine', '["Googlebot"]'::jsonb,           0, 1),
  ('Bingbot',           'Microsoft',      'search_engine', '["bingbot"]'::jsonb,             0, 1),
  ('DuckDuckBot',       'DuckDuckGo',     'search_engine', '["DuckDuckBot"]'::jsonb,         0, 1),
  ('YandexBot',         'Yandex',         'search_engine', '["YandexBot"]'::jsonb,           0, 1),
  ('BaiduSpider',       'Baidu',          'search_engine', '["Baiduspider"]'::jsonb,         0, 1),
  ('Sogou',             'Sogou',          'search_engine', '["Sogou"]'::jsonb,               0, 1),
  ('360Spider',         'Qihoo 360',      'search_engine', '["360Spider"]'::jsonb,           0, 1),
  ('NaverYeti',         'Naver',          'search_engine', '["Yeti"]'::jsonb,                0, 1),
  ('DaumBot',           'Daum',           'search_engine', '["Daumoa"]'::jsonb,              0, 1),
  ('Applebot',          'Apple',          'search_engine', '["Applebot"]'::jsonb,            0, 1),
  ('PetalBot',          'Huawei',         'search_engine', '["PetalBot"]'::jsonb,            0, 1),
  ('QwantBot',          'Qwant',          'search_engine', '["Qwantify"]'::jsonb,            0, 1)
ON CONFLICT (name) DO NOTHING;

-- Social media bots (purpose=social) — 미리보기 / 공유. 정당.
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('FacebookExternalHit', 'Meta',         'social', '["facebookexternalhit"]'::jsonb,        0, 1),
  ('Twitterbot',          'X',            'social', '["Twitterbot"]'::jsonb,                  0, 1),
  ('LinkedInBot',         'LinkedIn',     'social', '["LinkedInBot"]'::jsonb,                 0, 1),
  ('SlackBot',            'Slack',        'social', '["Slackbot-LinkExpanding","Slackbot"]'::jsonb, 0, 1),
  ('TelegramBot',         'Telegram',     'social', '["TelegramBot"]'::jsonb,                 0, 1),
  ('Discordbot',          'Discord',      'social', '["Discordbot"]'::jsonb,                  0, 1),
  ('WhatsApp',            'Meta',         'social', '["WhatsApp"]'::jsonb,                    0, 1),
  ('KakaoTalkPreview',    'Kakao',        'social', '["kakaotalk-scrap"]'::jsonb,             0, 1),
  ('NaverPreview',        'Naver',        'social', '["NaverPreview"]'::jsonb,                0, 1),
  ('Pinterestbot',        'Pinterest',    'social', '["Pinterest"]'::jsonb,                   0, 1),
  ('RedditBot',           'Reddit',       'social', '["redditbot"]'::jsonb,                   0, 1)
ON CONFLICT (name) DO NOTHING;

-- AI Crawlers (purpose=ai_training) — 추가
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('GPTBot',              'OpenAI',       'ai_training', '["GPTBot"]'::jsonb,                  0, 1),
  ('ChatGPT-User',        'OpenAI',       'ai_search',   '["ChatGPT-User"]'::jsonb,            0, 1),
  ('OAI-SearchBot',       'OpenAI',       'ai_search',   '["OAI-SearchBot"]'::jsonb,           0, 1),
  ('ClaudeBot',           'Anthropic',    'ai_training', '["ClaudeBot"]'::jsonb,               0, 1),
  ('Claude-Web',          'Anthropic',    'ai_assistant','["Claude-Web"]'::jsonb,              0, 1),
  ('PerplexityBot',       'Perplexity',   'ai_search',   '["PerplexityBot"]'::jsonb,           0, 1),
  ('YouBot',              'You.com',      'ai_search',   '["YouBot"]'::jsonb,                  0, 1),
  ('Bytespider',          'ByteDance',    'ai_training', '["Bytespider"]'::jsonb,              0, 1),
  ('Amazonbot',           'Amazon',       'ai_training', '["Amazonbot"]'::jsonb,               0, 1),
  ('CCBot',               'CommonCrawl',  'ai_training', '["CCBot"]'::jsonb,                   0, 1),
  ('GoogleExtended',      'Google',       'ai_training', '["Google-Extended"]'::jsonb,         0, 1),
  ('AppleExtended',       'Apple',        'ai_training', '["Applebot-Extended"]'::jsonb,       0, 1),
  ('Meta-ExternalAgent',  'Meta',         'ai_training', '["Meta-ExternalAgent"]'::jsonb,      0, 1),
  ('cohere-ai',           'Cohere',       'ai_training', '["cohere-ai"]'::jsonb,               0, 1),
  ('Diffbot',             'Diffbot',      'ai_training', '["Diffbot"]'::jsonb,                 0, 1),
  ('TimpiBot',            'Timpi',        'ai_training', '["TimpiBot"]'::jsonb,                0, 1),
  ('AndiBot',             'Andi',         'ai_search',   '["AndiBot"]'::jsonb,                 0, 1),
  ('PhindBot',            'Phind',        'ai_search',   '["PhindBot"]'::jsonb,                0, 1)
ON CONFLICT (name) DO NOTHING;

-- Downloaders / Archivers / Scrapers (is_malicious=1) — 콘텐츠 대량 다운로드 도구
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('HTTrack',             'HTTrack',      'malicious',  '["HTTrack","httrack"]'::jsonb,        1, 1),
  ('Wget',                'GNU',          'malicious',  '["Wget/","wget/"]'::jsonb,            1, 1),
  ('curl',                'curl',         'malicious',  '["curl/"]'::jsonb,                    1, 1),
  ('WebCopier',           'WebCopier',    'malicious',  '["WebCopier"]'::jsonb,                1, 1),
  ('OfflineExplorer',     'MetaProducts', 'malicious',  '["Offline Explorer"]'::jsonb,         1, 1),
  ('WebZIP',              'WebZIP',       'malicious',  '["WebZIP"]'::jsonb,                   1, 1),
  ('SiteSucker',          'SiteSucker',   'malicious',  '["SiteSucker"]'::jsonb,               1, 1),
  ('Heritrix',            'IA',           'malicious',  '["Heritrix"]'::jsonb,                 1, 1),
  ('ArchiveBot',          'IA',           'malicious',  '["ArchiveBot"]'::jsonb,               1, 1),
  ('Webscrapbook',        'Webscrapbook', 'malicious',  '["Webscrapbook"]'::jsonb,             1, 1)
ON CONFLICT (name) DO NOTHING;

-- Email harvesters (is_malicious=1) — 이메일 주소 수집기. 100% 악성.
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('EmailCollector',      'Attack',       'malicious',  '["EmailCollector"]'::jsonb,           1, 1),
  ('EmailWolf',           'Attack',       'malicious',  '["EmailWolf"]'::jsonb,                1, 1),
  ('EmailHarvest',        'Attack',       'malicious',  '["EmailHarvest"]'::jsonb,             1, 1),
  ('EmailSpider',         'Attack',       'malicious',  '["EmailSpider"]'::jsonb,              1, 1),
  ('Email Siphon',        'Attack',       'malicious',  '["Email Siphon"]'::jsonb,             1, 1),
  ('ExtractorPro',        'Attack',       'malicious',  '["ExtractorPro"]'::jsonb,             1, 1),
  ('CherryPicker',        'Attack',       'malicious',  '["CherryPicker"]'::jsonb,             1, 1)
ON CONFLICT (name) DO NOTHING;

-- Vulnerability scanners (is_malicious=1) — 공격 도구. MALICIOUS 의 hardcoded 와 일관성.
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('Nikto',               'Attack',       'malicious',  '["Nikto","nikto"]'::jsonb,            1, 1),
  ('SQLMap',              'Attack',       'malicious',  '["sqlmap"]'::jsonb,                   1, 1),
  ('Acunetix',            'Attack',       'malicious',  '["Acunetix","acunetix"]'::jsonb,      1, 1),
  ('Nessus',              'Attack',       'malicious',  '["Nessus","nessus"]'::jsonb,          1, 1),
  ('Nuclei',              'Attack',       'malicious',  '["Nuclei","nuclei"]'::jsonb,          1, 1),
  ('WPScan',              'Attack',       'malicious',  '["WPScan","wpscan"]'::jsonb,          1, 1),
  ('Masscan',             'Attack',       'malicious',  '["masscan"]'::jsonb,                  1, 1),
  ('OpenVAS',             'Attack',       'malicious',  '["OpenVAS","openvas"]'::jsonb,        1, 1),
  ('Skipfish',            'Attack',       'malicious',  '["skipfish"]'::jsonb,                 1, 1),
  ('Wapiti',              'Attack',       'malicious',  '["Wapiti"]'::jsonb,                   1, 1),
  ('OWASP-ZAP',           'Attack',       'malicious',  '["OWASP ZAP","zaproxy"]'::jsonb,      1, 1),
  ('Joomscan',            'Attack',       'malicious',  '["joomscan"]'::jsonb,                 1, 1),
  ('Vega',                'Attack',       'malicious',  '["Vega/"]'::jsonb,                    1, 1)
ON CONFLICT (name) DO NOTHING;

-- Generic library / automation (is_malicious=1 — 콘텐츠 사이트 정책상 차단)
INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled) VALUES
  ('Python-Requests',     'Library',      'malicious',  '["python-requests"]'::jsonb,          1, 1),
  ('Python-urllib',       'Library',      'malicious',  '["python-urllib","Python-urllib"]'::jsonb, 1, 0),
  ('Go-Http-Client',      'Library',      'malicious',  '["Go-http-client"]'::jsonb,           1, 1),
  ('Java-Http',           'Library',      'malicious',  '["Java/1.","Java/2."]'::jsonb,        1, 1),
  ('Apache-HttpClient',   'Library',      'malicious',  '["Apache-HttpClient"]'::jsonb,        1, 1),
  ('Scrapy',              'Library',      'malicious',  '["Scrapy"]'::jsonb,                   1, 1),
  ('PhantomJS',           'Headless',     'malicious',  '["PhantomJS"]'::jsonb,                1, 1),
  ('HeadlessChrome',      'Headless',     'malicious',  '["HeadlessChrome"]'::jsonb,           1, 1)
ON CONFLICT (name) DO NOTHING;
