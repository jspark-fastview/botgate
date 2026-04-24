// 클라이언트(AI회사/봇 운영자) 향 엔드포인트
import { db } from '../db/schema.js'
import { nanoid } from 'nanoid'

const insertToken = db.prepare(`
  INSERT INTO tokens (id, token, owner, plan)
  VALUES (?, ?, ?, ?)
`)

const getUsage = db.prepare(`
  SELECT
    COUNT(*)                                      AS total,
    COUNT(CASE WHEN verified = 1 THEN 1 END)      AS verified,
    COUNT(CASE WHEN DATE(ts) = DATE('now') THEN 1 END) AS today
  FROM access_logs
  WHERE token = ?
`)

const getTokenByValue = db.prepare(`
  SELECT id, owner, plan, active, created_at, expires_at
  FROM tokens WHERE token = ?
`)

export default async function clientRoutes(app) {
  // 토큰 발급 신청
  // POST /tokens   body: { owner }
  app.post('/tokens', {
    schema: {
      body: {
        type: 'object',
        required: ['owner'],
        properties: {
          owner: { type: 'string', minLength: 1 },
          plan:  { type: 'string', enum: ['free', 'paid'], default: 'free' },
        },
      },
    },
  }, (req, reply) => {
    const { owner, plan = 'free' } = req.body
    const id    = nanoid()
    const token = `bg_${nanoid(32)}`
    insertToken.run(id, token, owner, plan)
    return reply.code(201).send({ token, plan })
  })

  // 사용량 조회
  // GET /tokens/:token/usage
  app.get('/tokens/:token/usage', (req, reply) => {
    const row = getTokenByValue.get(req.params.token)
    if (!row) return reply.code(404).send({ error: 'token not found' })

    const usage = getUsage.get(req.params.token)
    return reply.send({ ...row, usage })
  })
}
