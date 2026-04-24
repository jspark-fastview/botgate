-- rDNS verification for AI bot authentication
-- Flow: PTR lookup → hostname pattern match → forward A record confirms same IP

local resolver = require "resty.dns.resolver"

local _M = {}

-- known AI bot PTR hostname patterns
local AI_BOT_PATTERNS = {
    { ua = "GPTBot",         ptr = "%.openai%.com$"       },
    { ua = "ChatGPT-User",   ptr = "%.openai%.com$"       },
    { ua = "ClaudeBot",      ptr = "%.anthropic%.com$"    },
    { ua = "Claude-Web",     ptr = "%.anthropic%.com$"    },
    { ua = "Google-Extended",ptr = "%.googlebot%.com$"    },
    { ua = "Googlebot",      ptr = "%.googlebot%.com$"    },
    { ua = "Applebot",       ptr = "%.apple%.com$"        },
    { ua = "PerplexityBot",  ptr = "%.perplexity%.ai$"    },
    { ua = "Amazonbot",      ptr = "%.amazon%.com$"       },
    { ua = "CCBot",          ptr = "%.commoncrawl%.org$"  },
    { ua = "Bytespider",     ptr = "%.bytedance%.com$"    },
}

local DNS_SERVERS   = { "8.8.8.8", "1.1.1.1" }
local DNS_TIMEOUT   = 3000  -- ms
local CACHE_TTL     = 3600  -- seconds (shared dict TTL)
local CACHE_DICT    = "rdns_cache"

-- ip → "4.3.2.1.in-addr.arpa"
local function to_ptr_name(ip)
    local a, b, c, d = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if not a then return nil end
    return d .. "." .. c .. "." .. b .. "." .. a .. ".in-addr.arpa"
end

local function new_resolver()
    local r, err = resolver:new({
        nameservers       = DNS_SERVERS,
        retrans           = 2,
        timeout           = DNS_TIMEOUT,
        no_random_port    = true,
    })
    return r, err
end

-- PTR lookup → returns hostname string or nil
local function ptr_lookup(ip)
    local ptr_name = to_ptr_name(ip)
    if not ptr_name then return nil, "invalid ip: " .. ip end

    local r, err = new_resolver()
    if not r then return nil, "resolver init failed: " .. (err or "") end

    local answers, err = r:query(ptr_name, { qtype = r.TYPE_PTR }, {})
    if not answers then return nil, "PTR query failed: " .. (err or "") end
    if answers.errcode then return nil, "PTR error: " .. (answers.errstr or answers.errcode) end

    for _, ans in ipairs(answers) do
        if ans.ptrdname then
            return ans.ptrdname
        end
    end
    return nil, "no PTR record"
end

-- forward A lookup → returns first IP string or nil
local function a_lookup(hostname)
    local r, err = new_resolver()
    if not r then return nil, err end

    local answers, err = r:query(hostname, { qtype = r.TYPE_A }, {})
    if not answers then return nil, err end
    if answers.errcode then return nil, answers.errstr end

    for _, ans in ipairs(answers) do
        if ans.address then
            return ans.address
        end
    end
    return nil, "no A record"
end

-- detect which AI bot UA pattern matches (case-insensitive prefix search)
local function match_ai_bot(user_agent)
    if not user_agent then return nil end
    for _, bot in ipairs(AI_BOT_PATTERNS) do
        if user_agent:find(bot.ua, 1, true) then
            return bot
        end
    end
    return nil
end

-- cache key per IP+bot_ua (같은 IP라도 봇 종류별로 따로 캐시)
local function cache_key(ip, bot_ua) return "rdns:" .. ip .. ":" .. bot_ua end

local function cache_get(ip, bot_ua)
    local dict = ngx.shared[CACHE_DICT]
    if not dict then return nil end
    return dict:get(cache_key(ip, bot_ua))
end

local function cache_set(ip, bot_ua, valid)
    local dict = ngx.shared[CACHE_DICT]
    if not dict then return end
    dict:set(cache_key(ip, bot_ua), valid and "1" or "0", CACHE_TTL)
end

-- main entry point
-- returns: is_ai_bot (bool), is_verified (bool), detail (string)
function _M.verify(user_agent, remote_addr)
    local bot = match_ai_bot(user_agent)
    if not bot then
        return false, false, "not an ai bot ua"
    end

    -- check cache first (IP + bot 종류 조합)
    local cached = cache_get(remote_addr, bot.ua)
    if cached == "1" then
        return true, true, "cached:valid"
    elseif cached == "0" then
        return true, false, "cached:invalid"
    end

    -- PTR lookup
    local hostname, err = ptr_lookup(remote_addr)
    if not hostname then
        cache_set(remote_addr, bot.ua, false)
        return true, false, "ptr failed: " .. (err or "")
    end

    -- hostname must match expected pattern for this bot
    if not hostname:match(bot.ptr) then
        ngx.log(ngx.WARN, "[rdns] ptr mismatch ua=", bot.ua,
                " ip=", remote_addr, " ptr=", hostname, " expected=", bot.ptr)
        cache_set(remote_addr, bot.ua, false)
        return true, false, "ptr pattern mismatch: " .. hostname
    end

    -- forward confirm: hostname must resolve back to same IP
    local fwd_ip, err = a_lookup(hostname)
    if not fwd_ip then
        cache_set(remote_addr, bot.ua, false)
        return true, false, "forward lookup failed: " .. (err or "")
    end

    if fwd_ip ~= remote_addr then
        ngx.log(ngx.WARN, "[rdns] forward mismatch ua=", bot.ua,
                " claimed_ip=", remote_addr, " resolved=", fwd_ip)
        cache_set(remote_addr, bot.ua, false)
        return true, false, "forward ip mismatch: " .. fwd_ip .. " != " .. remote_addr
    end

    ngx.log(ngx.INFO, "[rdns] verified ua=", bot.ua, " ip=", remote_addr, " ptr=", hostname)
    cache_set(remote_addr, bot.ua, true)
    return true, true, "verified: " .. hostname
end

return _M
