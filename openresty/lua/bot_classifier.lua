-- bot_classifier.lua
-- UA 문자열 → { category, purpose, name } 분류
--
-- category : bot | other_bot | user
-- purpose  : ai_training | ai_search | seo | social | generic | user
-- name     : 정규화된 봇 이름 (분석 / 그룹핑 용)

local _M = {}

-- ── 봇 정의 (가장 위에 매칭된 게 우선) ────────────────────────
-- patterns 는 substring 매칭 (case-sensitive)
local BOTS = {
    -- AI 학습용 (고단가)
    { name="GPTBot",               purpose="ai_training", patterns={"GPTBot"} },
    { name="ClaudeBot",            purpose="ai_training", patterns={"ClaudeBot"} },
    { name="Claude-Web",           purpose="ai_training", patterns={"Claude-Web"} },
    { name="Anthropic-AI",         purpose="ai_training", patterns={"anthropic-ai"} },
    { name="Meta-ExternalAgent",   purpose="ai_training", patterns={"Meta-ExternalAgent"} },
    { name="Meta-ExternalFetcher", purpose="ai_training", patterns={"Meta-ExternalFetcher"} },
    { name="FacebookBot",          purpose="ai_training", patterns={"FacebookBot"} },
    { name="Bytespider",           purpose="ai_training", patterns={"Bytespider"} },
    { name="CCBot",                purpose="ai_training", patterns={"CCBot"} },
    { name="Google-Extended",      purpose="ai_training", patterns={"Google-Extended"} },
    { name="Applebot-Extended",    purpose="ai_training", patterns={"Applebot-Extended"} },
    { name="Cohere-AI",            purpose="ai_training", patterns={"cohere-ai"} },
    { name="Diffbot",              purpose="ai_training", patterns={"Diffbot"} },
    { name="ImagesiftBot",         purpose="ai_training", patterns={"ImagesiftBot"} },
    { name="Omgili",               purpose="ai_training", patterns={"Omgili","Omgilibot"} },

    -- AI 검색 / RAG (중단가)
    { name="PerplexityBot",        purpose="ai_search",   patterns={"PerplexityBot"} },
    { name="Perplexity-User",      purpose="ai_search",   patterns={"Perplexity-User"} },
    { name="OAI-SearchBot",        purpose="ai_search",   patterns={"OAI-SearchBot"} },
    { name="ChatGPT-User",         purpose="ai_search",   patterns={"ChatGPT-User"} },
    { name="YouBot",               purpose="ai_search",   patterns={"YouBot"} },

    -- SEO 크롤러 (저단가 / 차단 정책 가능)
    { name="SemrushBot",           purpose="seo",         patterns={"SemrushBot"} },
    { name="AhrefsBot",            purpose="seo",         patterns={"AhrefsBot"} },
    { name="MJ12bot",              purpose="seo",         patterns={"MJ12bot"} },
    { name="DotBot",               purpose="seo",         patterns={"DotBot"} },
    { name="BLEXBot",              purpose="seo",         patterns={"BLEXBot"} },
    { name="DataForSEOBot",        purpose="seo",         patterns={"DataForSeoBot"} },
    { name="serpstatbot",          purpose="seo",         patterns={"serpstatbot"} },

    -- 소셜 / 링크 프리뷰 (트래픽 유입, 무료 통과 권장)
    { name="Slackbot",             purpose="social",      patterns={"Slackbot"} },
    { name="Twitterbot",           purpose="social",      patterns={"Twitterbot"} },
    { name="FacebookExternalHit",  purpose="social",      patterns={"facebookexternalhit"} },
    { name="LinkedInBot",          purpose="social",      patterns={"LinkedInBot"} },
    { name="WhatsApp",             purpose="social",      patterns={"WhatsApp"} },
    { name="TelegramBot",          purpose="social",      patterns={"TelegramBot"} },
    { name="Discordbot",           purpose="social",      patterns={"Discordbot"} },
    { name="KAKAOTALK-scrap",      purpose="social",      patterns={"kakaotalk-scrap","kakaostory-scrap"} },

    -- 일반 검색엔진 (전통 봇)
    { name="Googlebot",            purpose="generic",     patterns={"Googlebot"} },
    { name="Bingbot",              purpose="generic",     patterns={"bingbot"} },
    { name="Applebot",             purpose="generic",     patterns={"Applebot"} },
    { name="Amazonbot",            purpose="generic",     patterns={"Amazonbot"} },
    { name="Baiduspider",          purpose="generic",     patterns={"Baiduspider"} },
    { name="YandexBot",            purpose="generic",     patterns={"YandexBot"} },
    { name="DuckDuckBot",          purpose="generic",     patterns={"DuckDuckBot"} },
    { name="Yeti",                 purpose="generic",     patterns={"Yeti"} },  -- Naver 봇

    -- ads.txt / sellers.json 크롤러
    { name="AdsTxtCrawler",        purpose="generic",     patterns={"ads.txt","sellers.json"} },
}

-- 미등록 봇 휴리스틱 (위 매칭 실패 시) — 명확한 봇 표시어만
local OTHER_BOT_PATTERNS = {
    "bot/", "bot ", "crawl", "spider", "slurp", "archive.org", "indexer", "scraper",
}

-- ── classify ─────────────────────────────────────────────────
function _M.classify(ua)
    if not ua or ua == "" then
        return { category="user", purpose="user", name="" }
    end

    -- 알려진 봇
    for _, b in ipairs(BOTS) do
        for _, p in ipairs(b.patterns) do
            if ua:find(p, 1, true) then
                local cat = (b.purpose == "ai_training" or b.purpose == "ai_search")
                            and "bot" or "other_bot"
                return { category=cat, purpose=b.purpose, name=b.name }
            end
        end
    end

    -- 미등록 봇 패턴
    local ua_lower = ua:lower()
    for _, p in ipairs(OTHER_BOT_PATTERNS) do
        if ua_lower:find(p, 1, true) then
            return { category="other_bot", purpose="generic", name="Unknown Bot" }
        end
    end

    -- 사용자
    return { category="user", purpose="user", name="" }
end

-- bot_filter 가 rDNS 검증 대상인지 묻는 헬퍼
function _M.is_ai_bot(ua)
    local r = _M.classify(ua)
    return r.category == "bot"
end

return _M
