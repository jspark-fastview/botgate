-- Bot filtering entry point — called from nginx access_by_lua_block
-- Stages:
--   1) malicious UA  → 403
--   2) AI bot UA
--        a) rDNS 통과          → pass (무료 검증 봇)
--        b) rDNS 실패 + token  → token-api 검증 → 통과 or 401
--        c) rDNS 실패 + token 없음 → 402 (등록 필요)
--   3) 일반 트래픽  → pass

local rdns             = require "rdns"
local ip_verifier      = require "bot_ip_verifier"
local logger           = require "logger"
local path_rules       = require "path_rules"
local settings         = require "settings"
local bot_classifier   = require "bot_classifier"
local purpose_policies = require "purpose_policies"
local cjson            = require "cjson.safe"

local _M = {}

-- (악성 패턴은 bot_classifier.lua 의 MALICIOUS 리스트로 통합)

-- ── 헬퍼 ────────────────────────────────────────────────────────────────

local function ua_lower() return (ngx.var.http_user_agent or ""):lower() end

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
-- ── 토큰 검증 캐시 (5분 TTL) ─────────────────────────────
-- internal-api → SQLite 호출 비용 절감. 토큰은 거의 변하지 않으니 hit 률 99%+
-- revoke 시점부터 최대 5분간 stale 가능 — 비즈니스상 허용
local TOKEN_CACHE_TTL = 300

local function validate_token_uncached(token, ua, host, ip)
    local api_host = os.getenv("INTERNAL_API_HOST") or os.getenv("TOKEN_API_HOST") or "127.0.0.1"
    local api_port = tonumber(os.getenv("INTERNAL_API_PORT") or os.getenv("TOKEN_API_PORT") or "3000")

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

-- 캐시 wrapper — 외부 호출자는 이 함수만 사용
local function validate_token(token, ua, host, ip)
    if not token or token == "" then return false, nil end
    local cache = ngx.shared.token_cache
    if cache then
        local cached = cache:get(token)
        if cached then
            -- 형식: "1|paid" / "0|" — pipe 로 valid + plan 합침
            local v, plan = cached:match("^(%d)|(.*)$")
            if v then return v == "1", (plan ~= "" and plan or nil) end
        end
    end
    local valid, plan = validate_token_uncached(token, ua, host, ip)
    if cache then
        -- 결과 캐시 (실패도 캐시 — invalid 토큰 폭주 방지)
        cache:set(token, (valid and "1" or "0") .. "|" .. (plan or ""), TOKEN_CACHE_TTL)
    end
    return valid, plan
end

-- ── 메인 필터 ─────────────────────────────────────────────────────────

-- ── Loki access log 용 ngx.ctx 헬퍼 ─────────────────────────────────
-- log_by_lua_block (bot.conf) 가 이 ctx 를 ngx.var.* 로 옮겨 JSON 출력
local function _record(action, verified, billed, blocked)
    ngx.ctx.access_logged = true
    ngx.ctx.bot_action    = action
    ngx.ctx.bot_verified  = verified and "1" or "0"
    ngx.ctx.bot_billed    = billed and "1" or "0"
    ngx.ctx.bot_blocked   = blocked and "1" or "0"
    -- ngx.var 에도 즉시 — log_by_lua_block 의 ngx.ctx 가 안 보이는 케이스 대비
    ngx.var.bot_action       = action
    ngx.var.bot_verified_log = verified and "1" or "0"
    ngx.var.bot_billed       = billed and "1" or "0"
    ngx.var.bot_blocked      = blocked and "1" or "0"
end

function _M.run()
    -- pcall 랩핑 — Lua 내부 오류 시 500 대신 통과 (fail-open)
    local ok, err = pcall(function()

    local raw_ua = ngx.var.http_user_agent
    local path   = ngx.var.request_uri:match("^([^?]*)")  -- query string 제거
    local ip     = ngx.var.remote_addr
    local host   = ngx.var.host

    -- 분류 (가장 먼저 — 악성 / 봇 / 사용자)
    local cls = bot_classifier.classify(raw_ua)
    ngx.ctx.classification = cls
    -- ngx.var.* 도 즉시 set — ngx.exit 후 log_by_lua_block 의 ngx.ctx 가
    -- 빈 케이스 (verify/block 응답) 에서도 access_log JSON 에 분류 정보 유지
    ngx.var.bot_name     = cls.name or ""
    ngx.var.bot_vendor   = cls.vendor or ""
    ngx.var.bot_purpose  = cls.purpose or ""
    ngx.var.bot_category = cls.category or "user"

    -- stage 1: 악성 봇 / 공격 도구 → 즉시 403 + 로깅 (blocked=true)
    if cls.category == "malicious" then
        json_log({ bot_category = "malicious", action = "block",
                   bot_name = cls.name, vendor = cls.vendor })
        logger.access(raw_ua or "", host, ip, path, false, false,
                      "malicious", "malicious", cls.name, cls.vendor, true)
        _record("block", false, false, true)
        ngx.header["X-Botgate-Error"] = "malicious-blocked"
        return ngx.exit(ngx.HTTP_FORBIDDEN)
    end

    -- stage 2: 봇/기타봇 인 경우 — 목적별 정책 적용
    if cls.category == "bot" or cls.category == "other_bot" then
        -- stage 2-0: path rule — block 룰은 정책보다 우선 차단
        local rule_action = path_rules.match(path)
        if rule_action == "block" then
            json_log({ bot_category = "path_blocked", action = "block", path = path,
                       bot_name = cls.name, bot_purpose = cls.purpose })
            logger.access(raw_ua, host, ip, path, false, false, cls.category, cls.purpose, cls.name, cls.vendor, true)
            _record("block", false, false, true)
            return ngx.exit(ngx.HTTP_FORBIDDEN)
        end

        -- 목적(purpose) 별 정책 조회
        local policy_action = purpose_policies.get(cls.purpose)
        local billed = (rule_action == "meter") or (policy_action == "meter")

        -- pass / meter — 그냥 통과 (필요 시 과금 헤더만)
        if policy_action == "pass" or policy_action == "meter" then
            json_log({ bot_category = cls.category, action = "policy_pass", policy = policy_action,
                       bot_name = cls.name, bot_purpose = cls.purpose })
            logger.access(raw_ua, host, ip, path, true, billed, cls.category, cls.purpose, cls.name, cls.vendor, false)
            _record(billed and "meter" or "pass", true, billed, false)
            ngx.req.set_header("X-Bot-Verified", "policy:" .. policy_action)
            ngx.req.set_header("X-Bot-Purpose",  cls.purpose)
            ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
            return
        end

        -- block — 즉시 403
        if policy_action == "block" then
            json_log({ bot_category = cls.category, action = "policy_block", policy = "block",
                       bot_name = cls.name, bot_purpose = cls.purpose })
            logger.access(raw_ua, host, ip, path, false, false, cls.category, cls.purpose, cls.name, cls.vendor, true)
            _record("block", false, false, true)
            ngx.header["X-Botgate-Error"] = "purpose-blocked"
            return ngx.exit(ngx.HTTP_FORBIDDEN)
        end

        -- gone — 410 (SEO 친화 차단, 색인 회수)
        if policy_action == "gone" then
            json_log({ bot_category = cls.category, action = "policy_gone", policy = "gone",
                       bot_name = cls.name, bot_purpose = cls.purpose })
            logger.access(raw_ua, host, ip, path, false, false, cls.category, cls.purpose, cls.name, cls.vendor, true)
            _record("gone", false, false, true)
            ngx.header["X-Botgate-Error"] = "purpose-gone"
            return ngx.exit(410)
        end

        -- token_only — 토큰 있어야 통과 (rDNS 안 봄)
        if policy_action == "token_only" then
            local token = ngx.req.get_headers()["X-Bot-Token"]
            if not token or token == "" then
                logger.access(raw_ua, host, ip, path, false, false, cls.category, cls.purpose, cls.name, cls.vendor, true)
                _record("token_required", false, false, true)
                ngx.header["X-Botgate-Error"]    = "token-required"
                ngx.header["X-Botgate-Register"] = "https://botgate.io/register"
                return ngx.exit(402)
            end
            local valid, plan = validate_token(token, raw_ua, host, ip)
            if not valid then
                _record("token_invalid", false, false, true)
                ngx.header["X-Botgate-Error"] = "invalid-token"
                return ngx.exit(401)
            end
            logger.access(raw_ua, host, ip, path, true, billed, cls.category, cls.purpose, cls.name, cls.vendor, false)
            _record(billed and "meter" or "pass", true, billed, false)
            ngx.req.set_header("X-Bot-Verified", "token")
            ngx.req.set_header("X-Bot-Purpose",  cls.purpose)
            ngx.req.set_header("X-Bot-Plan",     plan or "free")
            ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
            return
        end

        -- verify (default for AI training)
        -- 1순위: 공식 IP 범위 lookup (DNS 호출 0, μs 단위)
        -- 2순위: rDNS 검증 (1순위 데이터 없는 봇만)
        -- ai_assistant/generic 은 둘 다 스킵
        local rdns_verifiable = (cls.purpose ~= "ai_assistant" and cls.purpose ~= "generic")
        local verified, detail, verify_method = false, "skipped (non-verifiable)", "none"

        if rdns_verifiable and ip_verifier.has_ranges(cls.name) then
            -- 1순위: IP 범위 매칭
            if ip_verifier.verify(ip, cls.name) then
                verified, detail, verify_method = true, "ip-range match", "ip-list"
            else
                verified, detail, verify_method = false, "ip-range mismatch (possible spoofing)", "ip-list"
            end
        elseif rdns_verifiable then
            -- 2순위: rDNS (IP 데이터 없는 봇 폴백)
            local _ignore
            _ignore, verified, detail = rdns.verify(raw_ua, ip)
            verify_method = "rdns"
        end

        if verified then
            json_log({ bot_category = "real_ai_bot", action = "pass", path = path,
                       detail = detail, bot_name = cls.name, bot_purpose = cls.purpose,
                       method = verify_method })
            logger.access(raw_ua, host, ip, path, true, billed, cls.category, cls.purpose, cls.name, cls.vendor, false)
            _record(billed and "meter" or "pass", true, billed, false)
            ngx.req.set_header("X-Bot-Verified", verify_method)
            ngx.req.set_header("X-Bot-Purpose",  cls.purpose)
            ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
            return
        end

        local token = ngx.req.get_headers()["X-Bot-Token"]
        if not token or token == "" then
            if not settings.is_strict() then
                json_log({ bot_category = "ai_bot_lenient_pass", action = "pass", mode = "lenient",
                           detail = detail, bot_name = cls.name, bot_purpose = cls.purpose })
                logger.access(raw_ua, host, ip, path, false, billed, cls.category, cls.purpose, cls.name, cls.vendor, false)
                _record(billed and "meter" or "pass", false, billed, false)
                ngx.req.set_header("X-Bot-Verified", "lenient")
                ngx.req.set_header("X-Bot-Purpose",  cls.purpose)
                ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
                return
            end
            json_log({ bot_category = "ai_bot_unregistered", action = "block402", detail = detail,
                       bot_name = cls.name, bot_purpose = cls.purpose })
            logger.access(raw_ua, host, ip, path, false, false, cls.category, cls.purpose, cls.name, cls.vendor, true)
            _record("token_required", false, false, true)
            ngx.header["X-Botgate-Error"]    = "token-required"
            ngx.header["X-Botgate-Register"] = "https://botgate.io/register"
            return ngx.exit(402)
        end

        local valid, plan = validate_token(token, raw_ua, host, ip)
        if not valid then
            json_log({ bot_category = "ai_bot_invalid_token", action = "block401",
                       bot_name = cls.name, bot_purpose = cls.purpose })
            _record("token_invalid", false, false, true)
            ngx.header["X-Botgate-Error"] = "invalid-token"
            return ngx.exit(401)
        end

        json_log({ bot_category = "ai_bot_token", action = "pass", plan = plan,
                   bot_name = cls.name, bot_purpose = cls.purpose })
        logger.access(raw_ua, host, ip, path, true, billed, cls.category, cls.purpose, cls.name, cls.vendor, false)
        _record(billed and "meter" or "pass", true, billed, false)
        ngx.req.set_header("X-Bot-Verified", "token")
        ngx.req.set_header("X-Bot-Purpose",  cls.purpose)
        ngx.req.set_header("X-Bot-Plan",     plan or "free")
        ngx.req.set_header("X-Bot-Billed",   billed and "1" or "0")
        return
    end

    -- stage 3: 일반 사용자 트래픽 → 통과

    end) -- pcall end

    if not ok then
        ngx.log(ngx.ERR, "[botgate] filter error (fail-open): ", tostring(err))
        ngx.req.set_header("X-Botgate-Mode", "error-passthrough")
    end
end

return _M
