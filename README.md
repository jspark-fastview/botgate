# botgate

OpenResty 기반 AI 봇 rDNS 검증 및 트래픽 수익화 게이트웨이 PoC.

AI 크롤러(GPTBot, ClaudeBot 등)의 User-Agent 사칭을 PTR + forward DNS 이중 검증으로 차단하고, 검증된 봇의 접근을 토큰 기반으로 관리합니다.

## 아키텍처

```
AI봇 / 일반 사용자
       ↓
  OpenResty (botgate)
  ├─ 악성 UA → 403
  ├─ AI봇 rDNS 검증 실패 → 403
  └─ 검증 통과 → origin 통과 + 이벤트 로깅
       ↓ (fire-and-forget)
   token-api (Fastify)
  ├─ /internal  - OpenResty 전용 (검증, 로깅)
  ├─ /tokens    - 클라이언트 (토큰 발급/사용량)
  └─ /admin     - 어드민 (통계, 토큰 관리)
       ↓
     SQLite
```

## 구조

```
botgate/
├── docker-compose.yml           # dev  (포트 8081)
├── docker-compose.prod.yml      # prod (포트 80, Cloudflare realip)
├── openresty/
│   ├── nginx.conf
│   ├── lua/
│   │   ├── rdns.lua             # PTR + forward A 이중 검증 / 1시간 캐시
│   │   ├── bot_filter.lua       # 악성 UA 차단 → AI봇 rDNS 게이트
│   │   └── logger.lua           # 비동기 fire-and-forget → token-api
│   └── conf.d/
│       ├── dev/bot.conf         # X-Test-IP 헤더로 rDNS 직접 테스트 가능
│       └── prod/bot.conf        # CF-Connecting-IP realip 처리
└── token-api/                   # Fastify + SQLite
    └── src/routes/
        ├── internal.js          # 토큰 검증 + 접근 기록
        ├── client.js            # 토큰 발급/사용량 조회
        └── admin.js             # 토큰 관리 + 통계
```

## 봇 처리 흐름

```
요청 수신
  │
  ├─ 악성 UA (sqlmap, masscan 등) ──────────→ 403  (로깅 없음)
  │
  ├─ AI봇 UA (GPTBot, ClaudeBot 등)
  │     │
  │     ├─ PTR 없음 / hostname 패턴 불일치
  │     │   → 403 + access_log (verified=false)
  │     │
  │     └─ PTR + forward A 검증 통과
  │         → X-Bot-Verified: 1 + origin 통과
  │         + access_log (verified=true)
  │
  └─ 일반 UA ───────────────────────────────→ 통과 (로깅 없음)
```

## 지원 AI 봇

| 봇 | PTR 패턴 |
|---|---|
| GPTBot, ChatGPT-User | `*.openai.com` |
| ClaudeBot, Claude-Web | `*.anthropic.com` |
| Googlebot, Google-Extended | `*.googlebot.com` |
| Applebot | `*.apple.com` |
| PerplexityBot | `*.perplexity.ai` |
| Amazonbot | `*.amazon.com` |
| CCBot | `*.commoncrawl.org` |
| Bytespider | `*.bytedance.com` |

## API

| 호출자 | 메서드 | 엔드포인트 | 설명 |
|---|---|---|---|
| OpenResty | POST | `/internal/tokens/validate` | 토큰 유효성 확인 |
| OpenResty | POST | `/internal/access` | 봇 접근 기록 |
| 클라이언트 UI | POST | `/tokens` | 토큰 발급 신청 |
| 클라이언트 UI | GET | `/tokens/:token/usage` | 사용량 조회 |
| 어드민 UI | GET/POST | `/admin/tokens` | 토큰 목록/발급 |
| 어드민 UI | PATCH/DELETE | `/admin/tokens/:id` | 활성화/삭제 |
| 어드민 UI | GET | `/admin/stats/bots` | 봇별 접근 통계 |
| 어드민 UI | GET | `/admin/stats/domains` | 도메인별 통계 |
| 어드민 UI | GET | `/admin/stats/daily` | 일별 접근량 (30일) |

## 실행

### Dev
```bash
docker compose up -d

# rDNS 직접 테스트 (X-Test-IP로 IP 오버라이드)
curl -H "User-Agent: Googlebot/2.1" \
     -H "X-Test-IP: 66.249.64.1" \
     http://localhost:8081/test/rdns

# 봇 통계 확인
curl http://localhost:3000/admin/stats/bots
```

### Prod (Cloudflare 앞단)
```bash
docker compose -f docker-compose.prod.yml up -d
```

prod는 `set_real_ip_from`으로 Cloudflare IP 대역을 신뢰하고 `CF-Connecting-IP`를 `$remote_addr`로 자동 교체합니다. Lua 코드 변경 없이 rDNS가 봇 실IP 기준으로 동작합니다.

## Roadmap

- [ ] 토큰 기반 AI봇 유료 접근 (402 Payment Required)
- [ ] 클라이언트 UI (토큰 발급/사용량)
- [ ] 어드민 UI (통계 대시보드)
- [ ] Elasticsearch 전환 (트래픽 증가 시)
