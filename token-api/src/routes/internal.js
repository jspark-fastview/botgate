// OpenResty Lua에서 호출하는 내부 엔드포인트 — 응답 속도 최우선
import { db } from '../db/schema.js'

const validateStmt = db.prepare(`
  SELECT id, plan, active FROM tokens
  WHERE token = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
`)

const logStmt = db.prepare(`
  INSERT INTO access_logs (token, bot_ua, domain, ip, verified)
  VALUES (?, ?, ?, ?, ?)
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
    const { token, bot_ua, domain, ip } = req.body
    const row = validateStmt.get(token)

    logStmt.run(token, bot_ua, domain, ip, row ? 1 : 0)

    if (!row) {
      return reply.code(401).send({ valid: false })
    }
    return reply.send({ valid: true, plan: row.plan })
  })

  // OpenResty: rDNS 통과한 봇 접근 기록 (토큰 없는 경우)
  // POST /internal/access
  app.post('/internal/access', {
    schema: {
      body: {
        type: 'object',
        required: ['bot_ua', 'domain', 'ip', 'verified'],
        properties: {
          bot_ua:   { type: 'string' },
          domain:   { type: 'string' },
          ip:       { type: 'string' },
          verified: { type: 'boolean' },
        },
      },
    },
  }, (req, reply) => {
    const { bot_ua, domain, ip, verified } = req.body
    logStmt.run(null, bot_ua, domain, ip, verified ? 1 : 0)
    return reply.code(204).send()
  })
}
