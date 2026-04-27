# botgate

OpenResty 기반 AI 봇 트래픽 수익화 게이트웨이.

AI 크롤러(GPTBot, ClaudeBot 등)의 rDNS 이중 검증 + 토큰 인증으로 유료 접근을 관리하고,  
등록된 채널(사이트)을 리버스 프록시로 연결해 봇 트래픽 통계를 수집합니다.

## 아키텍처

```
AI봇 요청
    ↓
OpenResty (port 80)
  ├─ bot_filter.lua   악성 UA → 403
  ├─ rdns.lua         PTR + forward A 이중 검증
  ├─ filter.lua       토큰 검증 → access_log 기록
  └─ channels.lua     Host 헤더 → 채널 upstream 조회 (60s 캐시)
       ↓ (리버스 프록시)
  실제 오리진 서버
       ↓ (fire-and-forget)
token-api (Fastify / port 3000)
  ├─ /internal        OpenResty 전용 (검증·로깅·캐시 무효화)
  ├─ /admin           어드민 API (ADMIN_KEY 인증)
  ├─ /auth            회원 인증 (register·login·logout·me)
  ├─ /me              채널 오너 포털 API
  └─ SQLite           botgate.db
```

## 디렉터리 구조

```
botgate/
├── docker-compose.yml           # dev  (port 80)
├── docker-compose.prod.yml      # prod (port 80, restart:always)
├── .env.example                 # ADMIN_KEY 설정 예시
├── openresty/
│   ├── nginx.conf
│   ├── lua/
│   │   ├── rdns.lua             # PTR + A 이중 검증 / 1시간 캐시
│   │   ├── bot_filter.lua       # 악성 UA 차단
│   │   ├── filter.lua           # 토큰 검증 + 접근 기록
│   │   ├── channels.lua         # Host → upstream 조회 (shared_dict 캐시)
│   │   └── path_rules.lua       # 경로별 allow/block/meter 규칙
│   └── conf.d/dev/bot.conf      # 채널 리버스 프록시 + 내부 캐시 무효화 엔드포인트
├── token-api/
│   └── src/
│       ├── app.js               # Fastify 앱, ADMIN_KEY 미들웨어
│       ├── db/schema.js         # SQLite 스키마 + 마이그레이션
│       └── routes/
│           ├── internal.js      # 토큰 검증 + 접근 기록
│           ├── client.js        # 클라이언트 토큰 API
│           ├── admin.js         # 어드민 CRUD + 통계
│           ├── auth.js          # 회원 인증 (scrypt)
│           └── user.js          # 채널 오너 /me/* 라우트
└── web/                         # 정적 파일 (/ui/ prefix로 서빙)
    ├── admin.html               # 퍼블리셔 랜딩 페이지
    ├── index.html               # 어드민 대시보드 SPA
    ├── portal.html              # 채널 오너 포털 SPA
    ├── user.html                # AI회사용 랜딩 페이지
    └── botgate-marketing.css
```

## 페이지 흐름

```
/ui/admin.html  (퍼블리셔 랜딩)
    └─ 무료로 시작하기 →  /ui/index.html  (어드민 대시보드, ADMIN_KEY 필요)

/ui/portal.html  (채널 오너 포털, 로그인 후 /me/* API 사용)
```

## 채널 리버스 프록시

Host 헤더와 채널 테이블을 매핑해 봇 요청을 실 서버로 프록시합니다.

```
등록 예시:
  도메인: news.example.com
  업스트림: http://origin.example.com

동작:
  AI봇 → botgate (news.example.com) → rDNS 검증 → origin.example.com
                                         ↓ 로깅
                                      access_logs (domain=news.example.com)
```

채널 설정 변경 시 `/_internal/cache/invalidate`가 자동 호출되어 Lua 캐시를 즉시 갱신합니다.

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

## API 엔드포인트

### Internal (OpenResty → token-api)
| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| POST | `/internal/tokens/validate` | 토큰 유효성 확인 |
| POST | `/internal/access` | 봇 접근 기록 |
| GET | `/_internal/cache/invalidate` | Lua 캐시 무효화 (Docker 네트워크 전용) |

### Admin (ADMIN_KEY Bearer 인증)
| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| GET/POST | `/admin/tokens` | 토큰 목록/발급 |
| PATCH/DELETE | `/admin/tokens/:id` | 활성화/삭제 |
| GET | `/admin/channels` | 채널 목록 |
| POST | `/admin/channels` | 채널 등록 |
| PATCH/DELETE | `/admin/channels/:id` | 채널 수정/삭제 |
| GET | `/admin/path-rules` | 경로 규칙 목록 |
| POST | `/admin/path-rules` | 규칙 추가 |
| PATCH/DELETE | `/admin/path-rules/:id` | 규칙 수정/삭제 |
| GET | `/admin/stats/bots` | 봇별 통계 (`?domain=`) |
| GET | `/admin/stats/daily` | 일별 통계 (`?domain=`) |
| GET | `/admin/stats/hourly` | 시간별 통계 (`?date=&domain=`) |
| GET | `/admin/stats/domains` | 도메인별 통계 |
| GET | `/admin/stats/channels` | 채널별 요약 통계 |
| GET | `/admin/logs` | 최근 접근 로그 (`?domain=&limit=`) |
| GET/PATCH/DELETE | `/admin/users/:id` | 사용자 관리 |

### Auth
| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| POST | `/auth/register` | 회원가입 |
| POST | `/auth/login` | 로그인 → 세션 토큰 |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/auth/me` | 내 정보 |

### User (세션 토큰 인증)
| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| GET | `/me/dashboard` | 내 채널 요약 |
| GET/POST | `/me/channels` | 내 채널 목록/추가 |
| GET | `/me/tokens` | 내 토큰 목록 |
| GET | `/me/profile` | 프로필 조회 |

## 실행

### Dev
```bash
cp .env.example .env          # ADMIN_KEY 설정
docker compose up -d

# 어드민 대시보드
open http://localhost/ui/admin.html

# 봇 테스트
TOKEN=bg_xxx bash scripts/perplexitybot.sh
TOKEN=bg_xxx bash scripts/googlebot.sh
```

### Prod (EC2)
```bash
cp .env.example .env          # ADMIN_KEY 강력한 값으로 교체
docker compose -f docker-compose.prod.yml up -d
```

token-api는 외부에 포트를 열지 않고 (`expose: 3000`), SSH 포트포워딩 또는 동일 네트워크에서만 접근합니다.

```bash
# EC2에서 어드민 접근 (SSH 터널)
ssh -L 3000:localhost:3000 ec2-user@<EC2_IP>
open http://localhost:3000/ui/admin.html
```

## SQLite 스키마

```sql
tokens        -- API 토큰 (id, token, owner, plan, active, user_id)
access_logs   -- 봇 접근 기록 (token, bot_ua, domain, ip, path, verified, billed)
channels      -- 등록 채널 (id, name, domain, upstream, active, owner_id)
path_rules    -- 경로 규칙 (pattern, action: allow|block|meter)
users         -- 채널 오너 계정 (email, password_hash, name, active)
sessions      -- 로그인 세션 (token, user_id, expires_at)
```
