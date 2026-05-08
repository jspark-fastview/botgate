# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# API_URL은 빌드 타임에 routes-manifest.json에 구워지므로 ARG로 주입
ARG API_URL=http://admin-api:3002
ENV API_URL=${API_URL}
RUN --mount=type=cache,target=/root/.npm npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public* ./public/
EXPOSE 3003
ENV PORT=3003
CMD ["node", "server.js"]
