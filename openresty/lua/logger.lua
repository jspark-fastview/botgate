-- 비동기 access log → token-api /internal/access
-- ngx.timer.at(0) 로 응답 블로킹 없이 fire-and-forget

local cjson = require "cjson.safe"

local _M = {}

local HOST = os.getenv("TOKEN_API_HOST") or "token-api"
local PORT = tonumber(os.getenv("TOKEN_API_PORT")) or 3000

local function send(premature, payload)
    if premature then return end

    local sock = ngx.socket.tcp()
    sock:settimeout(2000)

    local ok, err = sock:connect(HOST, PORT)
    if not ok then
        ngx.log(ngx.WARN, "[logger] connect failed: ", err)
        return
    end

    local body = cjson.encode(payload)
    local req  = "POST /internal/access HTTP/1.1\r\n"
              .. "Host: " .. HOST .. "\r\n"
              .. "Content-Type: application/json\r\n"
              .. "Content-Length: " .. #body .. "\r\n"
              .. "Connection: close\r\n"
              .. "\r\n"
              .. body

    local _, err = sock:send(req)
    if err then
        ngx.log(ngx.WARN, "[logger] send failed: ", err)
    end

    sock:close()
end

-- bot_ua, domain, ip, path, verified(bool), billed(bool), category, bot_purpose, bot_name
function _M.access(bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name)
    local ok, err = ngx.timer.at(0, send, {
        bot_ua      = bot_ua   or "",
        domain      = domain   or "",
        ip          = ip       or "",
        path        = path     or "",
        verified    = verified == true,
        billed      = billed   == true,
        category    = category or "bot",
        bot_purpose = bot_purpose or "generic",
        bot_name    = bot_name or "",
    })
    if not ok then
        ngx.log(ngx.WARN, "[logger] timer failed: ", err)
    end
end

return _M
