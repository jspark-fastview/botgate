-- Bot filtering entry point — called from nginx access_by_lua_block
-- Stages: 1) malicious UA block  2) AI bot rDNS verify  3) log + pass

local rdns   = require "rdns"
local logger = require "logger"

local _M = {}

-- immediately blocked UAs (exact substring match, lowercase)
local BLOCK_UA = {
    "masscan", "zgrab", "nikto", "sqlmap", "scrapy",
    "python-requests", "go-http-client", "libwww-perl",
}

-- AI bot UA substrings we care about (must pass rDNS)
local AI_BOT_UA = {
    "GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-Web",
    "Google-Extended", "Googlebot", "Applebot",
    "PerplexityBot", "Amazonbot", "CCBot", "Bytespider",
}

local function ua_lower() return (ngx.var.http_user_agent or ""):lower() end

local function is_blocked_ua(ua)
    for _, pattern in ipairs(BLOCK_UA) do
        if ua:find(pattern, 1, true) then return true, pattern end
    end
    return false
end

local function is_ai_bot_ua(ua)
    local raw = ngx.var.http_user_agent or ""
    for _, pattern in ipairs(AI_BOT_UA) do
        if raw:find(pattern, 1, true) then return true end
    end
    return false
end

local function json_log(data)
    local cjson = require "cjson.safe"
    data.time        = ngx.now()
    data.ip          = ngx.var.remote_addr
    data.method      = ngx.var.request_method
    data.uri         = ngx.var.request_uri
    data.host        = ngx.var.host
    data.ua          = ngx.var.http_user_agent or ""
    ngx.log(ngx.INFO, cjson.encode(data))
end

function _M.run()
    local ua = ua_lower()

    -- stage 1: malicious UA → 403
    local blocked, matched = is_blocked_ua(ua)
    if blocked then
        json_log({ bot_category = "malicious", action = "block", matched_ua = matched })
        ngx.exit(ngx.HTTP_FORBIDDEN)
    end

    -- stage 2: AI bot claimed → rDNS verify
    if is_ai_bot_ua(ua) then
        local is_ai, verified, detail = rdns.verify(
            ngx.var.http_user_agent,
            ngx.var.remote_addr
        )

        if not verified then
            json_log({ bot_category = "fake_ai_bot", action = "block", detail = detail })
            logger.access(ngx.var.http_user_agent, ngx.var.host, ngx.var.remote_addr, false)
            ngx.exit(ngx.HTTP_FORBIDDEN)
        end

        -- verified real AI bot → log and pass (token check comes next phase)
        json_log({ bot_category = "real_ai_bot", action = "pass", detail = detail })
        logger.access(ngx.var.http_user_agent, ngx.var.host, ngx.var.remote_addr, true)
        ngx.req.set_header("X-Bot-Verified", "1")
        return
    end

    -- stage 3: regular user / unknown bot → pass through
end

return _M
