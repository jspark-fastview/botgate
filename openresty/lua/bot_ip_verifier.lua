-- bot_ip_verifier.lua
-- 공식 봇 IP 범위(JSON) 사전 수집 → shared_dict 캐시 → 요청 시 CIDR 매칭
-- rDNS 호출 0회로 검증 가능 (정확도는 봇 회사가 IP 리스트 publish 한 경우에만)
--
-- 동작:
--   refresh_all() — 1시간마다 실행, 공식 JSON 가져와 dict 에 CIDR 적재
--   verify(ip, bot_name) — IP가 해당 봇의 공식 범위에 속하는지 즉시 판단 (μs)
--   has_ranges(bot_name) — IP 데이터가 있는 봇인가? (없으면 rDNS 폴백)

local cjson = require "cjson.safe"
local http  = require "resty.http"
local bit   = require "bit"

local _M = {}
local SHARED = "bot_ip_ranges"
local TTL    = 7200  -- 2h (refresh 1h 주기 + 안전 마진)

-- ── 봇별 IP 범위 source URL ──
-- 공식 publish 한 곳만 등록. Anthropic 등은 공개 안 함 → rDNS 폴백 사용
local SOURCES = {
    Googlebot              = "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
    ["Google-Extended"]    = "https://developers.google.com/static/search/apis/ipranges/special-crawlers.json",
    Bingbot                = "https://www.bing.com/toolbox/bingbot.json",
    GPTBot                 = "https://openai.com/gptbot.json",
    ["ChatGPT-User"]       = "https://openai.com/chatgpt-user.json",
    ["OAI-SearchBot"]      = "https://openai.com/searchbot.json",
    Applebot               = "https://search.developer.apple.com/applebot.json",
}

-- ── IPv4 dotted → 32bit unsigned ──
local function ip_to_num(ip)
    local a, b, c, d = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if not a then return nil end
    a, b, c, d = tonumber(a), tonumber(b), tonumber(c), tonumber(d)
    if a > 255 or b > 255 or c > 255 or d > 255 then return nil end
    return bit.bor(bit.lshift(a, 24), bit.lshift(b, 16), bit.lshift(c, 8), d)
end

-- ── CIDR "1.2.3.0/24" → {net, mask} ──
local function parse_cidr(cidr)
    local prefix, bits = cidr:match("^([%d.]+)/(%d+)$")
    if not prefix then return nil end
    bits = tonumber(bits)
    local n = ip_to_num(prefix)
    if not n or bits < 0 or bits > 32 then return nil end
    local mask = bits == 0 and 0 or bit.lshift(0xFFFFFFFF, 32 - bits)
    return { net = bit.band(n, mask), mask = mask }
end

-- ── 봇 한 개 fetch ──
local function fetch_one(bot_name, url)
    local httpc = http.new()
    httpc:set_timeout(5000)
    local res, err = httpc:request_uri(url, {
        method = "GET",
        ssl_verify = true,
        keepalive = false,
    })
    httpc:close()
    if not res then
        ngx.log(ngx.WARN, "[bot_ip_verifier] ", bot_name, " fetch error: ", err)
        return nil
    end
    if res.status ~= 200 then
        ngx.log(ngx.WARN, "[bot_ip_verifier] ", bot_name, " status ", res.status)
        return nil
    end
    local data = cjson.decode(res.body)
    if not data or type(data.prefixes) ~= "table" then
        ngx.log(ngx.WARN, "[bot_ip_verifier] ", bot_name, " no prefixes in JSON")
        return nil
    end
    local cidrs = {}
    for _, p in ipairs(data.prefixes) do
        local c = p.ipv4Prefix or p.ipPrefix or p.prefix
        if type(c) == "string" then
            local pc = parse_cidr(c)
            if pc then cidrs[#cidrs + 1] = pc end
        end
    end
    return cidrs
end

-- ── 모든 봇 갱신 (timer 에서 호출) ──
function _M.refresh_all()
    ngx.log(ngx.INFO, "[bot_ip_verifier] refresh_all() entered")
    local dict = ngx.shared[SHARED]
    if not dict then
        ngx.log(ngx.ERR, "[bot_ip_verifier] shared dict not found: ", SHARED)
        return
    end

    local total, ok = 0, 0
    for bot_name, url in pairs(SOURCES) do
        total = total + 1
        ngx.log(ngx.INFO, "[bot_ip_verifier] fetching ", bot_name, " from ", url)
        local cidrs = fetch_one(bot_name, url)
        if cidrs and #cidrs > 0 then
            -- net,mask 쌍을 ":" 와 "|" 로 인코딩 (JSON 보다 작고 빠름)
            local parts = {}
            for _, c in ipairs(cidrs) do
                parts[#parts + 1] = c.net .. ":" .. c.mask
            end
            dict:set("ranges:" .. bot_name, table.concat(parts, "|"), TTL)
            ngx.log(ngx.INFO, "[bot_ip_verifier] ", bot_name, " loaded ", #cidrs, " ranges")
            ok = ok + 1
        end
    end
    dict:set("__last_refresh", ngx.now(), TTL)
    dict:set("__bots_loaded", ok, TTL)
    ngx.log(ngx.INFO, "[bot_ip_verifier] refresh done: ", ok, "/", total, " bots")
end

-- ── 검증: ip 가 bot_name 의 공식 범위에 있는가? ──
function _M.verify(ip, bot_name)
    if not ip or not bot_name then return false end
    local dict = ngx.shared[SHARED]
    if not dict then return false end

    local raw = dict:get("ranges:" .. bot_name)
    if not raw then return false end

    local ipn = ip_to_num(ip)
    if not ipn then return false end

    for pair in raw:gmatch("[^|]+") do
        local sep = pair:find(":", 1, true)
        if sep then
            local net  = tonumber(pair:sub(1, sep - 1))
            local mask = tonumber(pair:sub(sep + 1))
            if net and mask and bit.band(ipn, mask) == net then
                return true
            end
        end
    end
    return false
end

-- ── 봇이 공식 IP 데이터를 가지고 있는가? ──
function _M.has_ranges(bot_name)
    if not bot_name then return false end
    local dict = ngx.shared[SHARED]
    if not dict then return false end
    return dict:get("ranges:" .. bot_name) ~= nil
end

-- ── 디버그 정보 ──
function _M.stats()
    local dict = ngx.shared[SHARED]
    if not dict then return {} end
    return {
        last_refresh = dict:get("__last_refresh"),
        bots_loaded  = dict:get("__bots_loaded"),
        sources      = SOURCES,
    }
end

return _M
