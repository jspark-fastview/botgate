-- bot_classifier.lua
-- UA 문자열 → { category, purpose, name, vendor } 분류
--
-- category : bot | other_bot | user
-- purpose  : ai_training | ai_search | ai_assistant | search_engine | seo | social | generic | user
-- name     : 정규화된 봇 이름 (분석 / 그룹핑 용)
-- vendor   : 운영 회사 (OpenAI, Anthropic, Google 등)

local _M = {}

-- ── 봇 정의 (가장 위에 매칭된 게 우선) ────────────────────────
-- patterns 는 substring 매칭 (case-sensitive)
local BOTS = {
    -- ── AI Crawler (학습용 / 인덱싱) ───────────────────────────
    { name="GPTBot",               vendor="OpenAI",     purpose="ai_training", patterns={"GPTBot"} },
    { name="ClaudeBot",            vendor="Anthropic",  purpose="ai_training", patterns={"ClaudeBot"} },
    { name="Claude-Web",           vendor="Anthropic",  purpose="ai_training", patterns={"Claude-Web"} },
    { name="Anthropic-AI",         vendor="Anthropic",  purpose="ai_training", patterns={"anthropic-ai"} },
    { name="Meta-ExternalAgent",   vendor="Meta",       purpose="ai_training", patterns={"Meta-ExternalAgent"} },
    { name="Meta-ExternalFetcher", vendor="Meta",       purpose="ai_training", patterns={"Meta-ExternalFetcher"} },
    { name="FacebookBot",          vendor="Meta",       purpose="ai_training", patterns={"FacebookBot"} },
    { name="Bytespider",           vendor="ByteDance",  purpose="ai_training", patterns={"Bytespider"} },
    { name="TikTokSpider",         vendor="ByteDance",  purpose="ai_training", patterns={"TikTokSpider"} },
    { name="Amazonbot",            vendor="Amazon",     purpose="ai_training", patterns={"Amazonbot"} },
    { name="CCBot",                vendor="CommonCrawl", purpose="ai_training", patterns={"CCBot"} },
    { name="Google-Extended",      vendor="Google",     purpose="ai_training", patterns={"Google-Extended"} },
    { name="Applebot-Extended",    vendor="Apple",      purpose="ai_training", patterns={"Applebot-Extended"} },
    { name="Cohere-AI",            vendor="Cohere",     purpose="ai_training", patterns={"cohere-ai"} },
    { name="Diffbot",              vendor="Diffbot",    purpose="ai_training", patterns={"Diffbot"} },
    { name="ImagesiftBot",         vendor="Imagesift",  purpose="ai_training", patterns={"ImagesiftBot"} },
    { name="Omgili",               vendor="Webz.io",    purpose="ai_training", patterns={"Omgili","Omgilibot"} },
    { name="PetalBot",             vendor="Huawei",     purpose="ai_training", patterns={"PetalBot"} },

    -- ── AI Search (RAG, 인덱싱 후 검색 결과로 활용) ─────────────
    { name="PerplexityBot",        vendor="Perplexity", purpose="ai_search",   patterns={"PerplexityBot"} },
    { name="OAI-SearchBot",        vendor="OpenAI",     purpose="ai_search",   patterns={"OAI-SearchBot"} },
    { name="YouBot",               vendor="You.com",    purpose="ai_search",   patterns={"YouBot"} },

    -- ── AI Assistant (사용자 트리거로 실시간 fetch) ─────────────
    { name="ChatGPT-User",         vendor="OpenAI",     purpose="ai_assistant", patterns={"ChatGPT-User"} },
    { name="Perplexity-User",      vendor="Perplexity", purpose="ai_assistant", patterns={"Perplexity-User"} },
    { name="Manus Bot",            vendor="Manus",      purpose="ai_assistant", patterns={"ManusBot","Manus Bot"} },
    { name="DuckAssistBot",        vendor="DuckDuckGo", purpose="ai_assistant", patterns={"DuckAssistBot"} },

    -- ── Search Engine Crawler (전통 검색엔진) ──────────────────
    { name="Googlebot",            vendor="Google",     purpose="search_engine", patterns={"Googlebot"} },
    { name="BingBot",              vendor="Microsoft",  purpose="search_engine", patterns={"bingbot","BingBot"} },
    { name="Applebot",             vendor="Apple",      purpose="search_engine", patterns={"Applebot"} },
    { name="Baiduspider",          vendor="Baidu",      purpose="search_engine", patterns={"Baiduspider"} },
    { name="YandexBot",            vendor="Yandex",     purpose="search_engine", patterns={"YandexBot"} },
    { name="DuckDuckBot",          vendor="DuckDuckGo", purpose="search_engine", patterns={"DuckDuckBot"} },
    { name="Yeti",                 vendor="Naver",      purpose="search_engine", patterns={"Yeti"} },

    -- ── SEO Crawler (분석 도구) ─────────────────────────────────
    { name="SemrushBot",           vendor="Semrush",    purpose="seo",         patterns={"SemrushBot"} },
    { name="AhrefsBot",            vendor="Ahrefs",     purpose="seo",         patterns={"AhrefsBot"} },
    { name="MJ12bot",              vendor="Majestic",   purpose="seo",         patterns={"MJ12bot"} },
    { name="DotBot",               vendor="Moz",        purpose="seo",         patterns={"DotBot"} },
    { name="BLEXBot",              vendor="WebMeUp",    purpose="seo",         patterns={"BLEXBot"} },
    { name="DataForSEOBot",        vendor="DataForSEO", purpose="seo",         patterns={"DataForSeoBot"} },
    { name="serpstatbot",          vendor="Serpstat",   purpose="seo",         patterns={"serpstatbot"} },

    -- ── Social Preview (메신저 / SNS 링크 미리보기) ─────────────
    { name="Slackbot",             vendor="Slack",      purpose="social",      patterns={"Slackbot"} },
    { name="Twitterbot",           vendor="Twitter/X",  purpose="social",      patterns={"Twitterbot"} },
    { name="FacebookExternalHit",  vendor="Meta",       purpose="social",      patterns={"facebookexternalhit"} },
    { name="LinkedInBot",          vendor="LinkedIn",   purpose="social",      patterns={"LinkedInBot"} },
    { name="WhatsApp",             vendor="Meta",       purpose="social",      patterns={"WhatsApp"} },
    { name="TelegramBot",          vendor="Telegram",   purpose="social",      patterns={"TelegramBot"} },
    { name="Discordbot",           vendor="Discord",    purpose="social",      patterns={"Discordbot"} },
    { name="KakaoTalk-scrap",      vendor="Kakao",      purpose="social",      patterns={"kakaotalk-scrap","kakaostory-scrap"} },

    -- ── 광고 / 인프라 크롤러 ───────────────────────────────────
    { name="AdsTxtCrawler",        vendor="(다양)",     purpose="generic",     patterns={"ads.txt","sellers.json"} },
}

-- 미등록 봇 휴리스틱 (위 매칭 실패 시) — 명확한 봇 표시어만
local OTHER_BOT_PATTERNS = {
    "bot/", "bot ", "crawl", "spider", "slurp", "archive.org", "indexer", "scraper",
}

-- 카탈로그 (UI 에서 봇 목록 표시용) — admin 에서 가져갈 수 있게 export
function _M.catalog()
    local list = {}
    for i, b in ipairs(BOTS) do
        list[i] = {
            name     = b.name,
            vendor   = b.vendor or "(unknown)",
            purpose  = b.purpose,
            patterns = b.patterns,
        }
    end
    return list
end

-- ── classify ─────────────────────────────────────────────────
function _M.classify(ua)
    if not ua or ua == "" then
        return { category="user", purpose="user", name="", vendor="" }
    end

    -- 알려진 봇
    for _, b in ipairs(BOTS) do
        for _, p in ipairs(b.patterns) do
            if ua:find(p, 1, true) then
                local cat
                if b.purpose == "ai_training" or b.purpose == "ai_search" or b.purpose == "ai_assistant" then
                    cat = "bot"  -- rDNS 검증 / 토큰 대상
                else
                    cat = "other_bot"
                end
                return { category=cat, purpose=b.purpose, name=b.name, vendor=b.vendor or "" }
            end
        end
    end

    -- 미등록 봇 패턴
    local ua_lower = ua:lower()
    for _, p in ipairs(OTHER_BOT_PATTERNS) do
        if ua_lower:find(p, 1, true) then
            return { category="other_bot", purpose="generic", name="Unknown Bot", vendor="" }
        end
    end

    -- 사용자
    return { category="user", purpose="user", name="", vendor="" }
end

function _M.is_ai_bot(ua)
    local r = _M.classify(ua)
    return r.category == "bot"
end

return _M
