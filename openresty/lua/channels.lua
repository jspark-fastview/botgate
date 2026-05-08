-- channels.lua
-- token-api 에서 채널 목록을 가져와 shared dict 에 60초 캐시
-- get_upstream(host) → upstream URL 또는 nil

local cjson = require "cjson.safe"
local _M = {}

local CACHE_KEY = "channels_json"
local CACHE_TTL = 60   -- seconds

-- ── HTTP GET (cosocket) ──────────────────────────────────
local function fetch_channels_from_api()
    local host = os.getenv("ADMIN_API_HOST") or os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local port = tonumber(os.getenv("ADMIN_API_PORT") or os.getenv("TOKEN_API_PORT") or "3000")
    local key  = os.getenv("ADMIN_KEY") or ""

    local sock = ngx.socket.tcp()
    sock:settimeout(300)

    local ok, err = sock:connect(host, port)
    if not ok then
        ngx.log(ngx.ERR, "[channels] connect failed: ", err)
        return nil
    end

    local req_lines = {
        "GET /admin/channels HTTP/1.1",
        "Host: " .. host .. ":" .. port,
        "Connection: close",
    }
    if key ~= "" then
        req_lines[#req_lines + 1] = "Authorization: Bearer " .. key
    end
    req_lines[#req_lines + 1] = ""
    req_lines[#req_lines + 1] = ""
    local req = table.concat(req_lines, "\r\n")

    local sent, serr = sock:send(req)
    if not sent then sock:close(); return nil end

    -- 상태줄
    local status_line = sock:receive("*l")
    if not status_line then sock:close(); return nil end
    local status = tonumber(status_line:match("HTTP/%d%.%d (%d+)"))
    if status ~= 200 then sock:close(); return nil end

    -- 헤더 건너뜀
    while true do
        local line = sock:receive("*l")
        if not line or line == "" then break end
    end

    local body = sock:receive("*a")
    sock:close()
    return body
end

-- ── 채널 로드 (캐시 우선 + last-known-good 폴백) ────────
-- fresh 캐시(60s) 만료 → admin-api fetch
-- fetch 실패 시 stable 캐시(24h) 폴백 → admin-api 일시적 장애 시 트래픽 끊김 방지
local STABLE_KEY = CACHE_KEY .. "_stable"
local STABLE_TTL = 86400  -- 24h

local function load_channels()
    local cache = ngx.shared.rdns_cache

    -- 1. fresh cache (60s)
    local cached = cache:get(CACHE_KEY)
    if cached then return cjson.decode(cached) or {} end

    -- 2. fetch
    local body = fetch_channels_from_api()
    if body then
        local channels = cjson.decode(body) or {}
        local active = {}
        for _, ch in ipairs(channels) do
            if ch.active == 1 or ch.active == true then
                active[#active + 1] = ch
            end
        end
        local enc = cjson.encode(active)
        cache:set(CACHE_KEY,  enc, CACHE_TTL)
        cache:set(STABLE_KEY, enc, STABLE_TTL)
        return active
    end

    -- 3. fetch 실패 → stable 캐시 폴백
    local stable = cache:get(STABLE_KEY)
    if stable then
        ngx.log(ngx.WARN, "[channels] fetch failed, falling back to stable cache")
        return cjson.decode(stable) or {}
    end

    -- 4. 둘 다 비어있음 (cold start + admin-api 부팅 중) → 짧은 NEGATIVE 캐시로 부하 방지
    -- 60초 동안 모든 요청이 fetch 시도하면 admin-api 폭주. 5초 빈 결과 캐시.
    cache:set(CACHE_KEY, "[]", 5)
    ngx.log(ngx.ERR, "[channels] cold start: no cache, admin-api unreachable")
    return {}
end

-- ── Host 헤더 → upstream URL ─────────────────────────────
-- 반환: upstream 문자열 (예: "http://origin.example.com") 또는 nil
-- apex(pure-beef.kr) 와 www(www.pure-beef.kr) 는 동일 채널로 자동 매핑
function _M.get_upstream(host)
    if not host or host == "" then return nil end
    local channels = load_channels()

    -- 1. 정확 매칭
    for _, ch in ipairs(channels) do
        if ch.domain == host then
            return ch.upstream
        end
    end

    -- 2. www. 접두 제거 후 매칭 (www.pure-beef.kr → pure-beef.kr)
    local stripped = host:gsub("^www%.", "")
    if stripped ~= host then
        for _, ch in ipairs(channels) do
            if ch.domain == stripped then
                return ch.upstream
            end
        end
    end

    -- 3. www. 접두 추가 후 매칭 (pure-beef.kr → www.pure-beef.kr 로 등록된 경우)
    if not host:match("^www%.") then
        local with_www = "www." .. host
        for _, ch in ipairs(channels) do
            if ch.domain == with_www then
                return ch.upstream
            end
        end
    end

    return nil
end

-- 캐시 강제 무효화 (채널 변경 직후 호출 가능)
-- 캐시 강제 채우기 (시작 시 prefetch 용)
function _M.warm()
    return load_channels()
end

function _M.invalidate()
    ngx.shared.rdns_cache:delete(CACHE_KEY)
end

return _M
