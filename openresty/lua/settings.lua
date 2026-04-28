-- settings.lua
-- token-api 의 /admin/settings 를 가져와 30초 캐시
-- get(key) → string 또는 nil
-- is_strict() → boolean (strict_mode=='1')

local cjson = require "cjson.safe"
local _M = {}

local CACHE_KEY = "settings_json"
local CACHE_TTL = 30  -- seconds

-- ── HTTP GET (cosocket) ──────────────────────────────────
local function fetch_from_api()
    local host = os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local port = tonumber(os.getenv("TOKEN_API_PORT") or "3000")
    local key  = os.getenv("ADMIN_KEY") or ""

    local sock = ngx.socket.tcp()
    sock:settimeout(300)

    local ok, err = sock:connect(host, port)
    if not ok then
        ngx.log(ngx.ERR, "[settings] connect failed: ", err)
        return nil
    end

    local req_lines = {
        "GET /admin/settings HTTP/1.1",
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

    local status_line = sock:receive("*l")
    if not status_line then sock:close(); return nil end
    local status = tonumber(status_line:match("HTTP/%d%.%d (%d+)"))
    if status ~= 200 then sock:close(); return nil end

    while true do
        local line = sock:receive("*l")
        if not line or line == "" then break end
    end

    local body = sock:receive("*a")
    sock:close()
    return body
end

local function load_settings()
    local cache = ngx.shared.rdns_cache

    local cached = cache:get(CACHE_KEY)
    if cached then
        return cjson.decode(cached) or {}
    end

    local body = fetch_from_api()
    if not body then return {} end

    local data = cjson.decode(body) or {}
    cache:set(CACHE_KEY, cjson.encode(data), CACHE_TTL)
    return data
end

function _M.get(key)
    local s = load_settings()
    return s[key]
end

function _M.is_strict()
    -- 설정이 없거나 '0' 이 아니면 strict (안전한 기본값)
    return _M.get("strict_mode") ~= "0"
end

function _M.invalidate()
    ngx.shared.rdns_cache:delete(CACHE_KEY)
end

return _M
