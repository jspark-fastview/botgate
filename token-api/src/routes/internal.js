// OpenResty Lua에서 호출하는 내부 엔드포인트 — 응답 속도 최우선
import { db } from '../db/schema.js'

// bot_catalog 캐시 (메모리, 30초 TTL)
let _catalogCache = null
let _catalogAt    = 0

function getBotCatalog() {
  const now = Date.now()
  if (_catalogCache && now - _catalogAt < 30_000) return _catalogCache
  const rows = db.prepare(`SELECT * FROM bot_catalog WHERE enabled = 1 ORDER BY is_malicious, purpose, name`).all()
  _catalogCache = {
    version:   now,
    bots:      rows.filter(r => !r.is_malicious).map(r => ({ name: r.name, vendor: r.vendor, purpose: r.purpose, patterns: JSON.parse(r.patterns || '[]') })),
    malicious: rows.filter(r =>  r.is_malicious).map(r => ({ name: r.name, vendor: r.vendor, patterns: JSON.parse(r.patterns || '[]') })),
  }
  _catalogAt = now
  return _catalogCache
}

const validateStmt = db.prepare(`
  SELECT id, plan, active FROM tokens
  WHERE token = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
`)

const logStmt = db.prepare(`
  INSERT INTO access_logs (token, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, bot_vendor, blocked)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

export default async function internalRoutes(app) {
  // OpenResty: X-Bot-Token 헤더 검증
  // POST /internal/tokens/validate
  // body: { token, bot_ua, domain, ip }
  app.post('/internal/tokens/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'bot_ua', 'domain', 'ip'],
        properties: {
          token:   { type: 'string' },
          bot_ua:  { type: 'string' },
          domain:  { type: 'string' },
          ip:      { type: 'string' },
        },
      },
    },
  }, (req, reply) => {
    const { token, bot_ua, domain, ip, path = null, billed = false,
            bot_purpose = 'generic', bot_name = null, bot_vendor = null } = req.body
    const row = validateStmt.get(token)

    // 무효 토큰은 null 로 기록. blocked=1 (검증 실패는 401 차단) / 0 (통과)
    logStmt.run(row ? token : null, bot_ua, domain, ip, path, row ? 1 : 0, billed ? 1 : 0, 'bot', bot_purpose, bot_name, bot_vendor, row ? 0 : 1)

    if (!row) {
      return reply.code(401).send({ valid: false })
    }
    return reply.send({ valid: true, plan: row.plan })
  })

  // OpenResty: 접근 기록 (봇 또는 사용자)
  // POST /internal/access
  app.post('/internal/access', {
    schema: {
      body: {
        type: 'object',
        required: ['bot_ua', 'domain', 'ip', 'verified'],
        properties: {
          bot_ua:      { type: 'string' },
          domain:      { type: 'string' },
          ip:          { type: 'string' },
          path:        { type: 'string' },
          verified:    { type: 'boolean' },
          billed:      { type: 'boolean' },
          category:    { type: 'string', enum: ['malicious', 'bot', 'other_bot', 'user'] },
          bot_purpose: { type: 'string', enum: ['malicious','ai_training','ai_search','ai_assistant','search_engine','seo','social','generic','user'] },
          bot_name:    { type: 'string' },
          bot_vendor:  { type: 'string' },
          blocked:     { type: 'boolean' },
        },
      },
    },
  }, (req, reply) => {
    const { bot_ua, domain, ip, path = null, verified, billed = false,
            category = 'bot', bot_purpose = 'generic', bot_name = null, bot_vendor = null,
            blocked = false } = req.body
    logStmt.run(null, bot_ua, domain, ip, path, verified ? 1 : 0, billed ? 1 : 0, category, bot_purpose, bot_name, bot_vendor, blocked ? 1 : 0)
    return reply.code(204).send()
  })

  // OpenResty init_worker용 — 봇 카탈로그 JSON
  app.get('/internal/bot-catalog', (_req, reply) => {
    return reply.send(getBotCatalog())
  })

  // OpenResty bypass 상태 (10초 폴링용 — 초경량)
  app.get('/internal/bypass', (_req, reply) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'bypass_mode'`).get()
    return reply.send({ bypass: row?.value === '1' })
  })
}
