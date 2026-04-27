// 어드민 엔드포인트
import { db } from '../db/schema.js'
import { nanoid } from 'nanoid'

const listTokens = db.prepare(`
  SELECT id, token, owner, plan, active, created_at, expires_at FROM tokens
  ORDER BY created_at DESC
`)

const insertToken = db.prepare(`
  INSERT INTO tokens (id, token, owner, plan) VALUES (?, ?, ?, ?)
`)

const setActive = db.prepare(`
  UPDATE tokens SET active = ? WHERE id = ?
`)

const deleteToken = db.prepare(`
  DELETE FROM tokens WHERE id = ?
`)

const statsByBot = db.prepare(`
  SELECT bot_ua, COUNT(*) AS count
  FROM access_logs
  GROUP BY bot_ua
  ORDER BY count DESC
`)

const statsByDomain = db.prepare(`
  SELECT domain, COUNT(*) AS count
  FROM access_logs
  GROUP BY domain
  ORDER BY count DESC
`)

const statsByDay = db.prepare(`
  SELECT DATE(ts) AS date, COUNT(*) AS count
  FROM access_logs
  WHERE ts >= datetime('now', '-30 days')
  GROUP BY date
  ORDER BY date DESC
`)

const recentLogs = db.prepare(`
  SELECT id, token, bot_ua, domain, ip, verified, ts
  FROM access_logs
  ORDER BY id DESC
  LIMIT ?
`)

export default async function adminRoutes(app) {
  // 토큰 목록
  app.get('/admin/tokens', (_req, reply) => {
    return reply.send(listTokens.all())
  })

  // 토큰 수동 발급
  app.post('/admin/tokens', {
    schema: {
      body: {
        type: 'object',
        required: ['owner'],
        properties: {
          owner: { type: 'string' },
          plan:  { type: 'string', enum: ['free', 'paid'], default: 'paid' },
        },
      },
    },
  }, (req, reply) => {
    const { owner, plan = 'paid' } = req.body
    const id    = nanoid()
    const token = `bg_${nanoid(32)}`
    insertToken.run(id, token, owner, plan)
    return reply.code(201).send({ id, token, owner, plan })
  })

  // 토큰 활성화/비활성화
  app.patch('/admin/tokens/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['active'],
        properties: { active: { type: 'boolean' } },
      },
    },
  }, (req, reply) => {
    const result = setActive.run(req.body.active ? 1 : 0, req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
    return reply.send({ ok: true })
  })

  // 토큰 삭제
  app.delete('/admin/tokens/:id', (req, reply) => {
    const result = deleteToken.run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  // 봇별 접근 통계
  app.get('/admin/stats/bots', (_req, reply) => {
    return reply.send(statsByBot.all())
  })

  // 도메인별 통계
  app.get('/admin/stats/domains', (_req, reply) => {
    return reply.send(statsByDomain.all())
  })

  // 일별 접근량 (30일)
  app.get('/admin/stats/daily', (_req, reply) => {
    return reply.send(statsByDay.all())
  })

  // 최근 로그
  app.get('/admin/logs', (req, reply) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    return reply.send(recentLogs.all(limit))
  })
}
