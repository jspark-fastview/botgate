import Fastify from 'fastify'
import cors from '@fastify/cors'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import internalRoutes from './routes/internal.js'
import clientRoutes   from './routes/client.js'
import adminRoutes    from './routes/admin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(__dirname, '../data'), { recursive: true })

// DB 초기화 (import side-effect)
await import('./db/schema.js')

const app = Fastify({ logger: true })

// PoC: 전체 오픈, 운영 시 origin 지정
app.register(cors, { origin: true })

app.register(internalRoutes)
app.register(clientRoutes)
app.register(adminRoutes)

app.get('/health', () => ({ ok: true }))

app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
