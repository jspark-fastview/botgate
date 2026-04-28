// 어드민 엔드포인트
import { db } from '../db/schema.js'
import { nanoid } from 'nanoid'
import { resolve4, resolveCname } from 'dns/promises'

// 채널 도메인이 우리 ALB(또는 설정된 호스트네임)로 향하는지 확인
async function checkChannelDns(domain) {
  const expected = (process.env.ALB_HOSTNAME || '').trim()
  let cname = null, ips = []
  try {
    const list = await resolveCname(domain)
    cname = list[0] || null
  } catch (_) {}
  try {
    ips = await resolve4(domain)
  } catch (_) {}

  let status = 'unresolved'                                // 도메인 미응답
  if (cname || ips.length) status = 'resolved'             // 응답은 옴 (목적지는 모름)

  if (expected && (cname || ips.length)) {
    let matched = !!(cname && cname.toLowerCase().includes(expected.toLowerCase()))
    if (!matched && ips.length) {
      try {
        const albIps = await resolve4(expected)
        matched = ips.some(ip => albIps.includes(ip))
      } catch (_) {}
    }
    status = matched ? 'connected' : 'mismatch'
  }
  return { domain, status, cname, ips, expected: expected || null }
}

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

// 채널별 요약 — AI 봇 / 기타 봇 / 사용자 3-way 분리 집계
const statsByChannel = db.prepare(`
  SELECT
    c.id, c.name, c.domain, c.upstream, c.active,
    SUM(CASE WHEN l.category = 'bot'       THEN 1 ELSE 0 END) AS bot_total,
    SUM(CASE WHEN l.category = 'other_bot' THEN 1 ELSE 0 END) AS other_bot_total,
    SUM(CASE WHEN l.category = 'user'      THEN 1 ELSE 0 END) AS user_total,
    SUM(CASE WHEN l.category = 'bot' AND l.verified = 1 THEN 1 ELSE 0 END) AS verified,
    SUM(CASE WHEN l.category = 'bot' AND l.verified = 0 THEN 1 ELSE 0 END) AS blocked,
    COUNT(DISTINCT CASE WHEN l.category = 'bot' THEN l.bot_ua END)  AS bot_types
  FROM channels c
  LEFT JOIN access_logs l ON l.domain = c.domain
  GROUP BY c.id
  ORDER BY (bot_total + other_bot_total + user_total) DESC
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

  // 임시토큰 (과금 시스템 placeholder) — billed 요청 카운트 기반
  // 실 결제 연동 전 임시 단가(₩2/요청)로 환산
  app.get('/admin/stats/billing', (req, reply) => {
    const { domain } = req.query
    const where = domain ? `WHERE domain = ?` : ''
    const row = db.prepare(`
      SELECT
        COUNT(*)                                       AS total,
        SUM(CASE WHEN billed = 1 THEN 1 ELSE 0 END)   AS billed
      FROM access_logs ${where}
    `).get(...(domain ? [domain] : []))
    const billed = row.billed || 0
    const unit   = 2  // 임시 단가 ₩2 / 과금 요청
    return reply.send({
      total: row.total || 0,
      billed,
      unit_price: unit,
      estimated_amount: billed * unit,
    })
  })

  // 전체 채널 DNS 연결 상태 일괄 조회
  app.get('/admin/channels/dns-status', async (_req, reply) => {
    const channels = listChannels.all()
    const results = await Promise.all(
      channels.map(c => checkChannelDns(c.domain).then(r => ({ id: c.id, ...r })))
    )
    return reply.send(results)
  })

  // 단일 채널 DNS 연결 상태
  app.get('/admin/channels/:id/dns-check', async (req, reply) => {
    const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id)
    if (!ch) return reply.code(404).send({ error: 'not found' })
    const result = await checkChannelDns(ch.domain)
    return reply.send({ id: ch.id, ...result })
  })

  // UA 별 접근 통계 (?domain= 선택, ?category= 기본 'bot', 'user'/'other_bot' 가능)
  app.get('/admin/stats/bots', (req, reply) => {
    const { domain, category = 'bot' } = req.query
    const conds = []
    const params = []
    if (category && category !== 'all') { conds.push(`category = ?`); params.push(category) }
    if (domain) { conds.push(`domain = ?`); params.push(domain) }
    const where = conds.length ? `WHERE ` + conds.join(' AND ') : ''
    const rows = db.prepare(
      `SELECT bot_ua, COUNT(*) AS count FROM access_logs ${where} GROUP BY bot_ua ORDER BY count DESC`
    ).all(...params)
    return reply.send(rows)
  })

  // 도메인별 통계
  app.get('/admin/stats/domains', (_req, reply) => {
    return reply.send(
      db.prepare(`SELECT domain, COUNT(*) AS count FROM access_logs GROUP BY domain ORDER BY count DESC`).all()
    )
  })

  // 일별 접근량 (?domain= 선택, ?category= 기본 'bot')
  app.get('/admin/stats/daily', (req, reply) => {
    const { domain, category = 'bot' } = req.query
    const conds = [`ts >= datetime('now', '-30 days')`]
    const params = []
    if (category && category !== 'all') { conds.push(`category = ?`); params.push(category) }
    if (domain) { conds.push(`domain = ?`); params.push(domain) }
    const where = `WHERE ` + conds.join(' AND ')
    const rows = db.prepare(
      `SELECT DATE(ts) AS date, COUNT(*) AS count FROM access_logs ${where} GROUP BY date ORDER BY date DESC`
    ).all(...params)
    return reply.send(rows)
  })

  // 시간별 접근량 (?date= 필수, ?domain= 선택, ?category= 기본 'bot')
  app.get('/admin/stats/hourly', (req, reply) => {
    const { date, domain, category = 'bot' } = req.query
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date query param required (YYYY-MM-DD)' })
    }
    const conds = [`DATE(ts) = ?`]
    const params = [date]
    if (category && category !== 'all') { conds.push(`category = ?`); params.push(category) }
    if (domain) { conds.push(`domain = ?`); params.push(domain) }
    const where = `WHERE ` + conds.join(' AND ')
    const rows = db.prepare(
      `SELECT strftime('%H', ts) AS hour, COUNT(*) AS count FROM access_logs ${where} GROUP BY hour ORDER BY hour`
    ).all(...params)
    const map = Object.fromEntries(rows.map(r => [r.hour, r.count]))
    const result = Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, '0')
      return { hour: h, count: map[h] ?? 0 }
    })
    return reply.send(result)
  })

  // 카테고리별 누계 (대시보드 KPI 용)
  app.get('/admin/stats/category', (req, reply) => {
    const { domain } = req.query
    const where = domain ? `WHERE domain = ?` : ''
    const params = domain ? [domain] : []
    const rows = db.prepare(
      `SELECT category, COUNT(*) AS count FROM access_logs ${where} GROUP BY category`
    ).all(...params)
    const result = { bot: 0, other_bot: 0, user: 0 }
    for (const r of rows) result[r.category] = r.count
    return reply.send(result)
  })

  // 최근 로그 (?domain=, ?category=bot|user|all 선택, 기본 bot)
  app.get('/admin/logs', (req, reply) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const { domain, category = 'bot' } = req.query
    const conds = []
    const params = []
    if (category && category !== 'all') { conds.push(`category = ?`); params.push(category) }
    if (domain) { conds.push(`domain = ?`); params.push(domain) }
    const where = conds.length ? `WHERE ` + conds.join(' AND ') : ''
    params.push(limit)
    const rows = db.prepare(
      `SELECT id, token, bot_ua, domain, ip, path, verified, billed, category, ts FROM access_logs ${where} ORDER BY id DESC LIMIT ?`
    ).all(...params)
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

  // ── settings ──────────────────────────────────────────

  // 모든 설정값 조회
  app.get('/admin/settings', (_req, reply) => {
    const rows = db.prepare(`SELECT key, value FROM settings`).all()
    return reply.send(Object.fromEntries(rows.map(r => [r.key, r.value])))
  })

  // 단일 설정값 업데이트 (upsert)
  app.patch('/admin/settings/:key', {
    schema: {
      body: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
    },
  }, (req, reply) => {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(req.params.key, req.body.value)
    invalidateCache()
    return reply.send({ ok: true, key: req.params.key, value: req.body.value })
  })

  // ── users CRUD ────────────────────────────────────────

  // 사용자 목록
  app.get('/admin/users', (_req, reply) => {
    return reply.send(
      db.prepare(
        `SELECT id, email, name, active, created_at FROM users ORDER BY created_at DESC`
      ).all()
    )
  })

  // 활성화/비활성화
  app.patch('/admin/users/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['active'],
        properties: { active: { type: 'boolean' } },
      },
    },
  }, (req, reply) => {
    const result = db.prepare(`UPDATE users SET active = ? WHERE id = ?`)
      .run(req.body.active ? 1 : 0, req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
    return reply.send({ ok: true })
  })

  // 삭제 (sessions 는 CASCADE 로 자동 삭제)
  app.delete('/admin/users/:id', (req, reply) => {
    const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' })
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
