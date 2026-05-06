# GuardUs (구 botgate)

AI 봇 트래픽 수익화 게이트웨이 — OpenResty + Fastify + SQLite

**GitHub**: `https://github.com/jspark-fastview/botgate` (→ guardus 로 rename 예정)
**EC2**: `13.125.250.55` (t4g.medium / Ubuntu 24.04 / arm64)
**ALB**: `botgate-alb-1398826218.ap-northeast-2.elb.amazonaws.com`

## 구조

```
openresty/          Lua 기반 리버스 프록시 (봇 분류/정책/과금)
token-api/          Fastify API + SQLite (어드민/포털/토큰)
web/                정적 SPA (index/admin/portal/user.html + bg-*.jsx)
```

## 개발

```bash
docker compose up -d        # localhost:8081
git push origin main        # CI/CD → EC2 자동 배포
```

## 핵심 규칙

- `X-Botgate-Bypass` 헤더명은 **절대 바꾸지 말 것** — Cloudflare WAF 룰 의존
- `GUARDUS_BYPASS_KEY` 환경변수가 해당 헤더의 값을 담음
- apex/www 도메인 중복 등록 X — 자동 매핑됨
- upstream 호출 시 Host 헤더 = 채널 도메인 유지 (backend ALB host-rule 호환)
- `?_bgts=` 캐시버스터 추가 X — WordPress canonical redirect 루프 유발

## 리브랜딩 현황 (botgate → GuardUs)

- [ ] 소스 전체 치환 (`botgate` → `GuardUs`/`guardus`, `BOTGATE` → `GUARDUS`)
- [ ] CSS rename: `botgate-marketing.css` → `guardus-marketing.css`
- [ ] DB: `botgate.db` → `guardus.db`
- [ ] GitHub 레포 rename: `botgate` → `guardus`
- [ ] 도메인 변경은 나중에 (Cloudflare WAF 헤더 포함)

## 등록 채널

| 도메인 | 방식 |
|---|---|
| `viewus.co` | Cloudflare Worker `/en` |
| `pikle.io` / `www.pikle.io` | Route 53 CNAME → ALB |
| `pure-beef.kr` / `www.pure-beef.kr` | Cloudflare DNS-only → ALB |

## 봇 정책

- 4-way 분류: `malicious` / `bot` / `other_bot` / `user`
- 7 purpose: ai_training / ai_search / ai_assistant / search_engine / seo / social / generic
- 6 액션: pass / meter / verify / token_only / block / gone

## 외부 모니터링 연동 (innerops 등)

### 인증 키
- `ADMIN_KEY` — 풀 권한 (read + write). 어드민 SPA 전용.
- `STATS_KEY` — **read-only** 키 (2026-05 추가). 외부 모니터링 도구용.
  - GET `/admin/stats/*` 와 `/admin/logs` 만 허용
  - 그 외 경로/메서드는 403

### Authorization 헤더
```
GET /admin/stats/summary
Authorization: Bearer <STATS_KEY>
```

### 통합 엔드포인트 (innerops crawl 페이지 전용)
`GET /admin/stats/summary?domain=<선택>` — 한 번 호출로 모든 KPI:
```json
{
  "source": "guardus",
  "totalToday": <int>,
  "botPctToday": <float 0~1>,
  "blockedToday": <int>,
  "today4way": { "user": N, "bot": N, "other_bot": N, "malicious": N },
  "hourly": [{ "hour": "00", "user": N, "bot": N, "other_bot": N, "malicious": N }, ...24],
  "botCategories": [{ "name": "GPTBot", "purpose": "ai_training", "action": "meter", "requests": N }, ...],
  "purposes": { "ai_training": N, ... },
  "actions": { "pass": N, "meter": N, "block": N, ... },
  "channels": [{ "domain": "viewus.co", "totalReq": N, "botReq": N, "blockedReq": N }, ...]
}
```

### 키 발급 방법
```bash
# 32바이트 랜덤
openssl rand -hex 32

# .env 또는 docker-compose 환경변수에 추가
STATS_KEY=<생성된_키>

# innerops 쪽 .env 에도 같은 값
GUARDUS_URL=https://botgate-admin.viewus.co
GUARDUS_STATS_KEY=<같은_키>
```
