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

// viewus.co (apex/subdomain) + localhost 만 허용.
// 와일드카드 origin:true 면 어드민 SPA 외 임의 도메인 origin 에서 Authorization 헤더 노출 가능.
app.register(cors, {
  origin: [/^https:\/\/([a-z0-9-]+\.)?viewus\.co$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
  credentials: true,
})

// ── 어드민 인증 ────────────────────────────────────────────
// ADMIN_KEY: 풀 권한 (read + write)
// STATS_KEY: 읽기 전용 — innerops 같은 외부 모니터링 도구용
//            GET /admin/stats/* + GET /admin/logs 만 허용
const ADMIN_KEY = process.env.ADMIN_KEY?.trim()
const STATS_KEY = process.env.STATS_KEY?.trim()  // optional, 없으면 비활성

if (ADMIN_KEY || STATS_KEY) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/admin')) return
    const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')

    // ADMIN_KEY 매칭이면 항상 통과
    if (ADMIN_KEY && auth === ADMIN_KEY) return

    // STATS_KEY 매칭이면 GET 메서드 + stats/logs 경로만 통과
    if (STATS_KEY && auth === STATS_KEY) {
      if (req.method !== 'GET') {
        return reply.code(403).send({ error: 'STATS_KEY is read-only' })
      }
      if (!req.url.startsWith('/admin/stats') && !req.url.startsWith('/admin/logs')) {
        return reply.code(403).send({ error: 'STATS_KEY allows /admin/stats/* and /admin/logs only' })
      }
      return
    }

    return reply.code(401).send({ error: 'unauthorized' })
  })
}

// UI 정적 파일 서빙 (/ → web/, 루트는 index.html)
app.register(static_, {
  root:   join(__dirname, '../web'),
  prefix: '/',
})

app.register(internalRoutes)
app.register(clientRoutes)
app.register(adminRoutes)
app.register(authRoutes)
app.register(userRoutes)

app.get('/health', () => ({ ok: true }))

app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
