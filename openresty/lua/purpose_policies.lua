-- purpose_policies.lua
-- token-api 의 /admin/purpose-policies 를 가져와 30초 캐시
-- get(purpose) → action 문자열 (기본 'pass')

local cjson = require "cjson.safe"
local _M = {}

local CACHE_KEY = "purpose_policies_json"
local CACHE_TTL = 30

local function fetch_from_api()
    local host = os.getenv("ADMIN_API_HOST") or os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local port = tonumber(os.getenv("ADMIN_API_PORT") or os.getenv("TOKEN_API_PORT") or "3000")
    local key  = os.getenv("ADMIN_KEY") or ""

    local sock = ngx.socket.tcp()
    sock:settimeout(5000)
    local ok, err = sock:connect(host, port)
    if not ok then
        ngx.log(ngx.ERR, "[purpose_policies] connect failed: ", err)
        return nil
    end

    local req_lines = {
        "GET /admin/purpose-policies HTTP/1.1",
        "Host: " .. host .. ":" .. port,
        "Connection: close",
    }
    if key ~= "" then
        req_lines[#req_lines + 1] = "Authorization: Bearer " .. key
    end
    req_lines[#req_lines + 1] = ""
    req_lines[#req_lines + 1] = ""
    local req = table.concat(req_lines, "\r\n")

    local sent = sock:send(req)
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

local STABLE_KEY = CACHE_KEY .. "_stable"
local STABLE_TTL = 86400

local function load_policies()
    local cache = ngx.shared.rdns_cache
    local cached = cache:get(CACHE_KEY)
    if cached then return cjson.decode(cached) or {} end

    local body = fetch_from_api()
    if body then
        local data = cjson.decode(body) or {}
        local enc = cjson.encode(data)
        cache:set(CACHE_KEY,  enc, CACHE_TTL)
        cache:set(STABLE_KEY, enc, STABLE_TTL)
        return data
    end

    local stable = cache:get(STABLE_KEY)
    if stable then
        ngx.log(ngx.WARN, "[purpose_policies] fetch failed, falling back to stable cache")
        return cjson.decode(stable) or {}
    end
    return {}
end

-- 기본 fallback (DB 미세팅 시)
local DEFAULTS = {
    ai_training   = "verify",
    ai_search     = "meter",
    ai_assistant  = "pass",
    search_engine = "pass",
    seo           = "block",
    social        = "pass",
    generic       = "pass",
}

function _M.get(purpose)
    if not purpose then return "pass" end
    local p = load_policies()
    return p[purpose] or DEFAULTS[purpose] or "pass"
end

function _M.warm()
    return load_policies()
end

function _M.invalidate()
    ngx.shared.rdns_cache:delete(CACHE_KEY)
end

return _M
