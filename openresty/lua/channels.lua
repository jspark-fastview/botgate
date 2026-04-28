-- channels.lua
-- token-api 에서 채널 목록을 가져와 shared dict 에 60초 캐시
-- get_upstream(host) → upstream URL 또는 nil

local cjson = require "cjson.safe"
local _M = {}

local CACHE_KEY = "channels_json"
local CACHE_TTL = 60   -- seconds

-- ── HTTP GET (cosocket) ──────────────────────────────────
local function fetch_channels_from_api()
    local host = os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local port = tonumber(os.getenv("TOKEN_API_PORT") or "3000")
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

-- ── 채널 로드 (캐시 우선) ────────────────────────────────
local function load_channels()
    local cache = ngx.shared.rdns_cache   -- 기존 shared dict 재활용

    local cached = cache:get(CACHE_KEY)
    if cached then
        return cjson.decode(cached) or {}
    end

    local body = fetch_channels_from_api()
    if not body then return {} end

    local channels = cjson.decode(body) or {}
    -- active 만 필터링
    local active = {}
    for _, ch in ipairs(channels) do
        if ch.active == 1 or ch.active == true then
            active[#active + 1] = ch
        end
    end

    cache:set(CACHE_KEY, cjson.encode(active), CACHE_TTL)
    return active
end

-- ── Host 헤더 → upstream URL ─────────────────────────────
-- 반환: upstream 문자열 (예: "http://origin.example.com") 또는 nil
function _M.get_upstream(host)
    local channels = load_channels()
    for _, ch in ipairs(channels) do
        if ch.domain == host then
            return ch.upstream
        end
    end
    return nil
end

-- 캐시 강제 무효화 (채널 변경 직후 호출 가능)
function _M.invalidate()
    ngx.shared.rdns_cache:delete(CACHE_KEY)
end

return _M
