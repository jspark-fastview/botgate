import Fastify from 'fastify'
import cors   from '@fastify/cors'
import static_ from '@fastify/static'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import internalRoutes from './routes/internal.js'
import clientRoutes   from './routes/client.js'
import adminRoutes    from './routes/admin.js'
import authRoutes     from './routes/auth.js'
import userRoutes     from './routes/user.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(__dirname, '../data'), { recursive: true })

// DB 초기화 (import side-effect)
await import('./db/schema.js')

const app = Fastify({ logger: true })

// PoC: 전체 오픈, 운영 시 origin 지정
app.register(cors, { origin: true })

// ── 어드민 인증 ────────────────────────────────────────────
// ADMIN_KEY 환경변수가 설정된 경우 /admin/* 엔드포인트 보호
const ADMIN_KEY = process.env.ADMIN_KEY?.trim()
if (ADMIN_KEY) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/admin')) return
    const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
    if (auth !== ADMIN_KEY) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })
}

// UI 정적 파일 서빙 (/ui → web/)
app.register(static_, {
  root:   join(__dirname, '../web'),
  prefix: '/ui/',
})

app.register(internalRoutes)
app.register(clientRoutes)
app.register(adminRoutes)
app.register(authRoutes)
app.register(userRoutes)

app.get('/health', () => ({ ok: true }))

app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
