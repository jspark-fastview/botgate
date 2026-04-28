-- path_rules.lua
-- token-api 에서 경로 규칙을 가져와 lua_shared_dict 에 60초 캐시
-- action: "allow" | "block" | "meter"

local cjson = require "cjson.safe"
local _M = {}

local CACHE_KEY = "path_rules_json"
local CACHE_TTL = 60   -- seconds

-- ── HTTP GET (cosocket) ──────────────────────────────────
local function fetch_rules_from_api()
    local host = os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local port = tonumber(os.getenv("TOKEN_API_PORT") or "3000")
    local key  = os.getenv("ADMIN_KEY") or ""

    local sock = ngx.socket.tcp()
    sock:settimeout(300)

    local ok, err = sock:connect(host, port)
    if not ok then
        ngx.log(ngx.ERR, "[path_rules] connect failed: ", err)
        return nil
    end

    local req_lines = {
        "GET /admin/path-rules HTTP/1.1",
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

-- ── 규칙 로드 (캐시 우선) ────────────────────────────────
local function load_rules()
    local cache = ngx.shared.rdns_cache   -- 기존 shared dict 재활용

    local cached = cache:get(CACHE_KEY)
    if cached then
        return cjson.decode(cached) or {}
    end

    local body = fetch_rules_from_api()
    if not body then return {} end

    local rules = cjson.decode(body) or {}
    -- active 만 필터링
    local active = {}
    for _, r in ipairs(rules) do
        if r.active == 1 or r.active == true then
            active[#active + 1] = r
        end
    end

    cache:set(CACHE_KEY, cjson.encode(active), CACHE_TTL)
    return active
end

-- ── 패턴 매칭 (longest prefix, * 와일드카드) ─────────────
-- 반환: action ("allow"|"block"|"meter") 또는 nil (규칙 없음 → meter 기본)
function _M.match(path)
    local rules = load_rules()
    local best_action = nil
    local best_len    = -1

    for _, r in ipairs(rules) do
        local pat = r.pattern
        local matched = false
        local match_len = 0

        if pat:sub(-1) == "*" then
            -- 와일드카드 prefix: /admin/* → /admin/ 이후 모두
            local prefix = pat:sub(1, -2)
            if path:sub(1, #prefix) == prefix then
                matched   = true
                match_len = #prefix
            end
        else
            -- 정확히 일치
            if path == pat then
                matched   = true
                match_len = #pat
            end
        end

        if matched and match_len > best_len then
            best_action = r.action
            best_len    = match_len
        end
    end

    return best_action or "meter"   -- 기본값: meter
end

-- 캐시 강제 무효화 (룰 변경 직후 호출 가능)
function _M.invalidate()
    local cache = ngx.shared.rdns_cache
    cache:delete(CACHE_KEY)
end

return _M
