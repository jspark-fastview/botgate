-- channels.lua
-- admin-api 에서 채널 목록을 가져와 shared dict 에 60초 캐시
--
-- 게이트웨이로 라우팅되는 조건 (모두 만족):
--   - active = 1
--   - integration_mode = "reverse_proxy"   (external 모드는 퍼블리셔가 직접 /v1/verify 호출)
--   - verified_at IS NOT NULL              (도메인 소유 검증 통과)
--
-- API:
--   get_upstream(host)  → upstream URL 또는 nil  (legacy — proxy 만 필요한 호출자)
--   get_channel(host)   → {id, upstream, domain, ...} 또는 nil  (full record — 향후 per-site 로직용)

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
    sock:settimeout(5000)   -- cold start 시 JVM 첫 응답이 ~500ms 까지 갈 수 있음

    local ok, err = sock:connect(host, port)
    if not ok then
        ngx.log(ngx.ERR, "[channels] connect failed: ", err)
        return nil
    end

    local req_lines = {
        "GET /admin/channels HTTP/1.0",
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
    if status ~= 200 then
        ngx.log(ngx.ERR, "[channels] bad status ", status)
        sock:close(); return nil
    end

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
        local servable = {}
        for _, ch in ipairs(channels) do
            local is_active   = (ch.active == 1) or (ch.active == true)
            -- integration_mode 컬럼이 없는 옛 행 (마이그레이션 전) 도 reverse_proxy 로 간주
            local is_proxy    = (ch.integration_mode == nil)
                              or (ch.integration_mode == cjson.null)
                              or (ch.integration_mode == "reverse_proxy")
            -- verified_at 도 옛 행은 nil — 기존 운영 중인 채널 보호 위해 nil 도 OK 처리
            -- (신규 채널은 verification 통과 시점에만 verified_at 셋, OpenResty 에 노출되기 전엔 등록 자체가 안 되니 안전)
            local is_verified = (ch.verified_at ~= nil) and (ch.verified_at ~= cjson.null)
                              or false
            -- 옛 행 호환: site_key_hash 컬럼이 없거나 비어있으면 = 마이그레이션 이전 채널 = 그대로 서빙
            local is_legacy   = (ch.verify_token == nil) or (ch.verify_token == cjson.null)
            if is_active and is_proxy and (is_verified or is_legacy) then
                servable[#servable + 1] = ch
            end
        end
        local enc = cjson.encode(servable)
        cache:set(CACHE_KEY,  enc, CACHE_TTL)
        cache:set(STABLE_KEY, enc, STABLE_TTL)
        return servable
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

-- ── Host 헤더 → channel 레코드 ─────────────────────────────
-- 반환: channel table {id, domain, upstream, integration_mode, ...} 또는 nil
-- apex(pure-beef.kr) 와 www(www.pure-beef.kr) 는 동일 채널로 자동 매핑
function _M.get_channel(host)
    if not host or host == "" then return nil end
    local channels = load_channels()

    -- 1. 정확 매칭
    for _, ch in ipairs(channels) do
        if ch.domain == host then return ch end
    end

    -- 2. www. 접두 제거 후 매칭 (www.pure-beef.kr → pure-beef.kr)
    local stripped = host:gsub("^www%.", "")
    if stripped ~= host then
        for _, ch in ipairs(channels) do
            if ch.domain == stripped then return ch end
        end
    end

    -- 3. www. 접두 추가 후 매칭 (pure-beef.kr → www.pure-beef.kr 로 등록된 경우)
    if not host:match("^www%.") then
        local with_www = "www." .. host
        for _, ch in ipairs(channels) do
            if ch.domain == with_www then return ch end
        end
    end

    return nil
end

-- legacy — upstream 만 반환. 신규 호출은 get_channel 권장.
function _M.get_upstream(host)
    local ch = _M.get_channel(host)
    return ch and ch.upstream or nil
end

-- 캐시 강제 무효화 (채널 변경 직후 호출 가능)
-- 캐시 강제 채우기 (시작 시 prefetch 용)
function _M.warm()
    return load_channels()
end

-- 채널 cache 채워져 있는지 — K8s readinessProbe 가 사용 (cold start 트래픽 차단)
function _M.is_ready()
    local cache = ngx.shared.rdns_cache
    if not cache then return false end
    -- fresh 또는 stable cache 둘 중 하나라도 있으면 ready
    return cache:get(CACHE_KEY) ~= nil or cache:get(STABLE_KEY) ~= nil
end

function _M.invalidate()
    ngx.shared.rdns_cache:delete(CACHE_KEY)
end

return _M
