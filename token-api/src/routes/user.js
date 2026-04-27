// 채널 오너 유저 라우트 (/me/*)
// 세션 토큰이 있으면 유저 데이터를 반환하고, 없으면 빈 응답을 돌려준다.
// (로그인 UI 미구현 — 추후 sessionAuth 미들웨어로 교체 예정)
import { db }    from '../db/schema.js'
import { nanoid } from 'nanoid'

function getUser(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  return db.prepare(`
    SELECT s.token, u.id, u.email, u.name, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) || null
}

export default async function userRoutes(app) {

  // ── 대시보드 요약 ─────────────────────────────────────────
  app.get('/me/dashboard', (req, reply) => {
    const user = getUser(req)
    if (!user) return reply.send({ channels: [], stats: [] })

    const channels = db.prepare(
      `SELECT id, name, domain FROM channels WHERE owner_id = ?`
    ).all(user.id)

    if (!channels.length) return reply.send({ channels: [], stats: [] })

    const ph    = channels.map(() => '?').join(',')
    const stats = db.prepare(`
      SELECT domain,
             COUNT(*)                                        AS total,
             SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END)  AS verified,
             COUNT(DISTINCT bot_ua)                          AS bot_types
      FROM   access_logs
      WHERE  domain IN (${ph})
      GROUP  BY domain
    `).all(...channels.map(c => c.domain))

    return reply.send({ channels, stats })
  })

  // ── 내 채널 목록 ──────────────────────────────────────────
  app.get('/me/channels', (req, reply) => {
    const user = getUser(req)
    if (!user) return reply.send([])
    return reply.send(
      db.prepare(
        `SELECT id, name, domain, upstream, active, created_at
         FROM   channels
         WHERE  owner_id = ?
         ORDER  BY created_at DESC`
      ).all(user.id)
    )
  })

  // ── 채널 추가 ─────────────────────────────────────────────
  app.post('/me/channels', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'domain', 'upstream'],
        properties: {
          name:     { type: 'string', minLength: 1 },
          domain:   { type: 'string', minLength: 1 },
          upstream: { type: 'string', minLength: 1 },
        },
      },
    },
  }, (req, reply) => {
    const user = getUser(req)
    if (!user) return reply.code(401).send({ error: 'not authenticated' })

    const { name, domain, upstream } = req.body
    const id = 'ch_' + nanoid(8)
    try {
      db.prepare(
        `INSERT INTO channels (id, name, domain, upstream, owner_id) VALUES (?, ?, ?, ?, ?)`
      ).run(id, name, domain, upstream, user.id)
    } catch (e) {
      if (e.message.includes('UNIQUE')) return reply.code(409).send({ error: 'domain already exists' })
      throw e
    }
    return reply.code(201).send({ id, name, domain, upstream, active: 1 })
  })

  // ── 내 토큰 목록 ──────────────────────────────────────────
  app.get('/me/tokens', (req, reply) => {
    const user = getUser(req)
    if (!user) return reply.send([])
    return reply.send(
      db.prepare(
        `SELECT id, token, owner, plan, active, created_at, expires_at
         FROM   tokens
         WHERE  user_id = ?
         ORDER  BY created_at DESC`
      ).all(user.id)
    )
  })

  // ── 프로필 조회 ───────────────────────────────────────────
  app.get('/me/profile', (req, reply) => {
    const user = getUser(req)
    if (!user) return reply.code(401).send({ error: 'not authenticated' })
    return reply.send({ id: user.id, email: user.email, name: user.name })
  })
}
