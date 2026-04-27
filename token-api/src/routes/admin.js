// 어드민 엔드포인트
import { db } from '../db/schema.js'
import { nanoid } from 'nanoid'

// OpenResty 캐시 무효화 (채널/경로규칙 변경 직후 호출)
async function invalidateCache() {
  const host = process.env.OPENRESTY_HOST ?? 'openresty'
  const port = process.env.OPENRESTY_PORT ?? '80'
  try {
    await fetch(`http://${host}:${port}/_internal/cache/invalidate`)
  } catch (_) { /* 실패해도 무시 — 60초 후 자동 만료 */ }
}

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

// 삭제 전 로그의 token 참조를 null 로 변환 (FK 제약 해소)
const nullifyLogs = db.prepare(`
  UPDATE access_logs SET token = NULL
  WHERE token = (SELECT token FROM tokens WHERE id = ?)
`)

// 채널별 요약 (channels 테이블과 LEFT JOIN)
const statsByChannel = db.prepare(`
  SELECT
    c.id, c.name, c.domain, c.upstream, c.active,
    COUNT(l.id)               AS total,
    SUM(CASE WHEN l.verified = 1 THEN 1 ELSE 0 END) AS verified,
    SUM(CASE WHEN l.verified = 0 THEN 1 ELSE 0 END) AS blocked,
    COUNT(DISTINCT l.bot_ua)  AS bot_types
  FROM channels c
  LEFT JOIN access_logs l ON l.domain = c.domain
  GROUP BY c.id
  ORDER BY total DESC
`)

// ── channels ─────────────────────────────────────────────
const listChannels = db.prepare(`
  SELECT id, name, domain, upstream, active, created_at
  FROM channels ORDER BY created_at DESC
`)
const insertChannel = db.prepare(`
  INSERT INTO channels (id, name, domain, upstream) VALUES (?, ?, ?, ?)
`)
const updateChannel = db.prepare(`
  UPDATE channels SET name = ?, domain = ?, upstream = ?, active = ? WHERE id = ?
`)
const deleteChannel = db.prepare(`DELETE FROM channels WHERE id = ?`)

// ── path_rules ────────────────────────────────────────────
const listRules = db.prepare(`
  SELECT id, pattern, action, note, active, created_at
  FROM path_rules ORDER BY created_at ASC
`)
const insertRule = db.prepare(`
  INSERT INTO path_rules (id, pattern, action, note) VALUES (?, ?, ?, ?)
`)
const updateRule = db.prepare(`
  UPDATE path_rules SET action = ?, note = ?, active = ? WHERE id = ?
`)
const deleteRule = db.prepare(`
  DELETE FROM path_rules WHERE id = ?
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
    nullifyLogs.run(req.params.id)          // 로그 참조 먼저 null 처리
    const result = deleteToken.run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  // 채널별 요약 통계
  app.get('/admin/stats/channels', (_req, reply) => {
    return reply.send(statsByChannel.all())
  })

  // 봇별 접근 통계 (?domain= 선택)
  app.get('/admin/stats/bots', (req, reply) => {
    const { domain } = req.query
    const where = domain ? `WHERE domain = ?` : ''
    const rows = db.prepare(
      `SELECT bot_ua, COUNT(*) AS count FROM access_logs ${where} GROUP BY bot_ua ORDER BY count DESC`
    ).all(...(domain ? [domain] : []))
    return reply.send(rows)
  })

  // 도메인별 통계
  app.get('/admin/stats/domains', (_req, reply) => {
    return reply.send(
      db.prepare(`SELECT domain, COUNT(*) AS count FROM access_logs GROUP BY domain ORDER BY count DESC`).all()
    )
  })

  // 일별 접근량 (?domain= 선택)
  app.get('/admin/stats/daily', (req, reply) => {
    const { domain } = req.query
    const where = domain ? `WHERE domain = ? AND ts >= datetime('now', '-30 days')` : `WHERE ts >= datetime('now', '-30 days')`
    const rows = db.prepare(
      `SELECT DATE(ts) AS date, COUNT(*) AS count FROM access_logs ${where} GROUP BY date ORDER BY date DESC`
    ).all(...(domain ? [domain] : []))
    return reply.send(rows)
  })

  // 시간별 접근량 (?date= 필수, ?domain= 선택)
  app.get('/admin/stats/hourly', (req, reply) => {
    const { date, domain } = req.query
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date query param required (YYYY-MM-DD)' })
    }
    const where = domain ? `WHERE DATE(ts) = ? AND domain = ?` : `WHERE DATE(ts) = ?`
    const rows = db.prepare(
      `SELECT strftime('%H', ts) AS hour, COUNT(*) AS count FROM access_logs ${where} GROUP BY hour ORDER BY hour`
    ).all(...(domain ? [date, domain] : [date]))
    const map = Object.fromEntries(rows.map(r => [r.hour, r.count]))
    const result = Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, '0')
      return { hour: h, count: map[h] ?? 0 }
    })
    return reply.send(result)
  })

  // 최근 로그 (?domain= 선택)
  app.get('/admin/logs', (req, reply) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const { domain } = req.query
    const where = domain ? `WHERE domain = ?` : ''
    const rows = db.prepare(
      `SELECT id, token, bot_ua, domain, ip, path, verified, billed, ts FROM access_logs ${where} ORDER BY id DESC LIMIT ?`
    ).all(...(domain ? [domain, limit] : [limit]))
    return reply.send(rows)
  })

  // ── channels CRUD ──────────────────────────────────────

  // 목록
  app.get('/admin/channels', (_req, reply) => {
    return reply.send(listChannels.all())
  })

  // 추가
  app.post('/admin/channels', {
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
    const { name, domain, upstream } = req.body
    const id = 'ch_' + nanoid(8)
    try {
      insertChannel.run(id, name, domain, upstream)
    } catch (e) {
      if (e.message.includes('UNIQUE')) return reply.code(409).send({ error: 'domain already exists' })
      throw e
    }
    invalidateCache()
    return reply.code(201).send({ id, name, domain, upstream, active: 1 })
  })

  // 수정
  app.patch('/admin/channels/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:     { type: 'string' },
          domain:   { type: 'string' },
          upstream: { type: 'string' },
          active:   { type: 'boolean' },
        },
      },
    },
  }, (req, reply) => {
    const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id)
    if (!existing) return reply.code(404).send({ error: 'not found' })
    const name     = req.body.name     ?? existing.name
    const domain   = req.body.domain   ?? existing.domain
    const upstream = req.body.upstream ?? existing.upstream
    const active   = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active
    updateChannel.run(name, domain, upstream, active, req.params.id)
    invalidateCache()
    return reply.send({ ok: true })
  })

  // 삭제
  app.delete('/admin/channels/:id', (req, reply) => {
    const result = deleteChannel.run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
    invalidateCache()
    return reply.code(204).send()
  })

  // ── path_rules CRUD ────────────────────────────────────

  // 목록
  app.get('/admin/path-rules', (_req, reply) => {
    return reply.send(listRules.all())
  })

  // 추가
  app.post('/admin/path-rules', {
    schema: {
      body: {
        type: 'object',
        required: ['pattern', 'action'],
        properties: {
          pattern: { type: 'string', minLength: 1 },
          action:  { type: 'string', enum: ['allow', 'block', 'meter'] },
          note:    { type: 'string' },
        },
      },
    },
  }, (req, reply) => {
    const { pattern, action, note = '' } = req.body
    const id = 'pr_' + nanoid(8)
    try {
      insertRule.run(id, pattern, action, note)
    } catch (e) {
      if (e.message.includes('UNIQUE')) return reply.code(409).send({ error: 'pattern already exists' })
      throw e
    }
    invalidateCache()
    return reply.code(201).send({ id, pattern, action, note, active: 1 })
  })

  // 수정 (action / note / active)
  app.patch('/admin/path-rules/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['allow', 'block', 'meter'] },
          note:   { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
  }, (req, reply) => {
    const existing = db.prepare('SELECT * FROM path_rules WHERE id = ?').get(req.params.id)
    if (!existing) return reply.code(404).send({ error: 'not found' })
    const action = req.body.action  ?? existing.action
    const note   = req.body.note   ?? existing.note
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active
    updateRule.run(action, note, active, req.params.id)
    invalidateCache()
    return reply.send({ ok: true })
  })

  // 삭제
  app.delete('/admin/path-rules/:id', (req, reply) => {
    const result = deleteRule.run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
    invalidateCache()
    return reply.code(204).send()
  })
}
