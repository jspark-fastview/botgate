-- Bot filtering entry point — called from nginx access_by_lua_block
-- Stages:
--   1) malicious UA  → 403
--   2) AI bot UA
--        a) rDNS 통과          → pass (무료 검증 봇)
--        b) rDNS 실패 + token  → token-api 검증 → 통과 or 401
--        c) rDNS 실패 + token 없음 → 402 (등록 필요)
--   3) 일반 트래픽  → pass

local rdns       = require "rdns"
local logger     = require "logger"
local path_rules = require "path_rules"
local settings   = require "settings"
local cjson      = require "cjson.safe"

local _M = {}

-- 즉시 차단 UA (소문자 substring)
local BLOCK_UA = {
    "masscan", "zgrab", "nikto", "sqlmap", "scrapy",
    "python-requests", "go-http-client", "libwww-perl",
}

-- rDNS 검증 대상 AI 봇 UA
local AI_BOT_UA = {
    "GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-Web",
    "Google-Extended", "Googlebot", "Applebot",
    "PerplexityBot", "Amazonbot", "CCBot", "Bytespider",
}

-- ── 헬퍼 ────────────────────────────────────────────────────────────────

local function ua_lower() return (ngx.var.http_user_agent or ""):lower() end

local function is_blocked_ua(ua)
    for _, p in ipairs(BLOCK_UA) do
        if ua:find(p, 1, true) then return true, p end
    end
    return false
end

local function is_ai_bot_ua(ua)
    local raw = ngx.var.http_user_agent or ""
    for _, p in ipairs(AI_BOT_UA) do
        if raw:find(p, 1, true) then return true end
    end
    return false
end

local function json_log(data)
    data.time   = ngx.now()
    data.ip     = ngx.var.remote_addr
    data.method = ngx.var.request_method
    data.uri    = ngx.var.request_uri
    data.host   = ngx.var.host
    data.ua     = ngx.var.http_user_agent or ""
    ngx.log(ngx.INFO, cjson.encode(data))
end

-- ── 토큰 검증 (동기 cosocket) ─────────────────────────────────────────
-- 반환: valid (bool), plan (string|nil)
local function validate_token(token, ua, host, ip)
    local api_host = os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local api_port = tonumber(os.getenv("TOKEN_API_PORT") or "3000")

    local sock = ngx.socket.tcp()
    sock:settimeout(500)   -- 500 ms

    local ok, err = sock:connect(api_host, api_port)
    if not ok then
        ngx.log(ngx.ERR, "[token] connect failed: ", err)
        return false, nil
    end

    local payload = cjson.encode({
        token  = token,
        bot_ua = ua,
        domain = host,
        ip     = ip,
    })

    local req = table.concat({
        "POST /internal/tokens/validate HTTP/1.1",
        "Host: " .. api_host .. ":" .. api_port,
        "Content-Type: application/json",
        "Content-Length: " .. #payload,
        "Connection: close",
        "",
        payload,
    }, "\r\n")

    local sent, serr = sock:send(req)
    if not sent then
        ngx.log(ngx.ERR, "[token] send failed: ", serr)
        sock:close()
        return false, nil
    end

    -- 상태줄 읽기
    local status_line = sock:receive("*l")
    if not status_line then sock:close(); return false, nil end
    local status = tonumber(status_line:match("HTTP/%d%.%d (%d+)"))

    -- 헤더 건너뜀
    while true do
        local line = sock:receive("*l")
        if not line or line == "" then break end
    end

    -- 바디 읽기
    local body = sock:receive("*a")
    sock:close()

    if status ~= 200 then return false, nil end

    local data = body and cjson.decode(body)
    if not data then return false, nil end

    return data.valid == true, data.plan
end

-- ── 메인 필터 ─────────────────────────────────────────────────────────

function _M.run()
    local ua   = ua_lower()
    local path = ngx.var.request_uri:match("^([^?]*)")  -- query string 제거

    -- stage 1: 악성 UA → 403
    local blocked, matched = is_blocked_ua(ua)
    if blocked then
        json_log({ bot_category = "malicious", action = "block", matched_ua = matched })
        return ngx.exit(ngx.HTTP_FORBIDDEN)
    end

    -- stage 2: AI 봇 UA
    if is_ai_bot_ua(ua) then
        local raw_ua = ngx.var.http_user_agent
        local ip     = ngx.var.remote_addr
        local host   = ngx.var.host

        -- stage 2-0: path rule — block 룰은 검증 여부와 무관하게 차단
        local rule_action = path_rules.match(path)
        if rule_action == "block" then
            json_log({ bot_category = "path_blocked", action = "block", path = path })
            return ngx.exit(ngx.HTTP_FORBIDDEN)
        end

        local billed = (rule_action == "meter")

        local _, verified, detail = rdns.verify(raw_ua, ip)

        if verified then
            -- 2a) rDNS 통과
            json_log({ bot_category = "real_ai_bot", action = "pass",
                       path = path, rule = rule_action, detail = detail })
            logger.access(raw_ua, host, ip, path, true, billed)
            ngx.ctx.access_logged = true
            ngx.req.set_header("X-Bot-Verified", "rdns")
            ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
            return
        end

        -- 2b/c) rDNS 실패 → 토큰 확인
        local token = ngx.req.get_headers()["X-Bot-Token"]

        if not token or token == "" then
            -- 토큰 없음
            if not settings.is_strict() then
                -- 관대 모드: rDNS 실패 + 토큰 없어도 통과 (verified=false 로깅만)
                json_log({ bot_category = "ai_bot_lenient_pass", action = "pass",
                           detail = detail, mode = "lenient" })
                logger.access(raw_ua, host, ip, path, false, billed)
                ngx.ctx.access_logged = true
                ngx.req.set_header("X-Bot-Verified", "lenient")
                ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
                return
            end
            -- strict 모드: 차단
            json_log({ bot_category = "ai_bot_unregistered", action = "block402", detail = detail })
            logger.access(raw_ua, host, ip, path, false, false)
            ngx.ctx.access_logged = true
            ngx.header["X-Botgate-Error"]    = "token-required"
            ngx.header["X-Botgate-Register"] = "https://botgate.io/register"
            return ngx.exit(402)
        end

        local valid, plan = validate_token(token, raw_ua, host, ip)

        if not valid then
            json_log({ bot_category = "ai_bot_invalid_token", action = "block401",
                       token_prefix = token:sub(1,8) })
            ngx.header["X-Botgate-Error"] = "invalid-token"
            return ngx.exit(401)
        end

        -- 토큰 유효 → 통과
        json_log({ bot_category = "ai_bot_token", action = "pass",
                   plan = plan, path = path, rule = rule_action })
        ngx.req.set_header("X-Bot-Verified", "token")
        ngx.req.set_header("X-Bot-Plan",     plan or "free")
        ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
        return
    end

    -- stage 3: 일반 트래픽 → 통과
end

return _M
