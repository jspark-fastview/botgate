// 사용자 인증 (register / login / logout / me)
import { db }    from '../db/schema.js'
import { nanoid } from 'nanoid'
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

// ── 패스워드 유틸 ──────────────────────────────────────────
async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex')
  const buf  = await scryptAsync(pw, salt, 64)
  return `${salt}:${buf.toString('hex')}`
}

async function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':')
  const hashBuf = Buffer.from(hash, 'hex')
  const derived  = await scryptAsync(pw, salt, 64)
  return timingSafeEqual(hashBuf, derived)
}

// ── 세션 미들웨어 (user routes 에서 import) ─────────────────
export function sessionAuth(req, reply, done) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (!token) return reply.code(401).send({ error: 'not authenticated' })

  const row = db.prepare(`
    SELECT s.token, u.id, u.email, u.name, u.active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token)

  if (!row || !row.active) return reply.code(401).send({ error: 'session expired' })
  req.user = row
  done()
}

// ── 라우트 ─────────────────────────────────────────────────
export default async function authRoutes(app) {

  // 회원가입
  app.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name:     { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password, name } = req.body
    const id   = 'u_' + nanoid(10)
    const hash = await hashPassword(password)
    try {
      db.prepare(`INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)`).run(id, email, hash, name)
    } catch (e) {
      if (e.message.includes('UNIQUE')) return reply.code(409).send({ error: '이미 사용 중인 이메일이에요.' })
      throw e
    }
    return reply.code(201).send({ id, email, name })
  })

  // 로그인
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body
    const user = db.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).get(email)
    if (!user) return reply.code(401).send({ error: '이메일 또는 비밀번호가 잘못됐어요.' })

    const ok = await verifyPassword(password, user.password_hash)
    if (!ok) return reply.code(401).send({ error: '이메일 또는 비밀번호가 잘못됐어요.' })

    // 기존 세션 정리 (선택)
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')`).run(user.id)

    const token     = nanoid(48)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        .toISOString().replace('T', ' ').slice(0, 19)
    db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, user.id, expiresAt)

    return reply.send({ token, id: user.id, email: user.email, name: user.name })
  })

  // 로그아웃
  app.post('/auth/logout', (req, reply) => {
    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
    if (token) db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token)
    return reply.send({ ok: true })
  })

  // 내 정보
  app.get('/auth/me', { preHandler: sessionAuth }, (req, reply) => {
    return reply.send({ id: req.user.id, email: req.user.email, name: req.user.name })
  })
}
