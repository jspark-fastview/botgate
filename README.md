# GuardUs

AI 봇 트래픽 수익화 게이트웨이. OpenResty 가 요청을 봇 종류별로 분류·과금·차단하고, 등록된 채널(사이트)을 리버스 프록시로 연결.

- **운영**: EKS `guardus-eks-v2` (ap-northeast-2 b/d), prod + dev namespace
- **로컬 개발**: Docker Compose
- **GitOps**: ArgoCD app-of-apps-v2 (이 repo 가 source of truth)

## 아키텍처

```
                    ┌─ Cloudflare DNS (DNS-only) ─┐
                    │   *.viewus.co               │
                    │   채널 도메인 → guardus-endpoint.viewus.co
                    └────────────┬────────────────┘
                                 │
                          ALB (group guardus-shared-v2)
                                 │
                          OpenResty (Lua)
                                 │
                  ┌──────────────┼──────────────┐
                  │              │              │
            (bot 검증)      (admin SPA)    (채널 origin)
                  │              │
            internal-api    admin-api
            (Spring/Java)   (Spring/Java)
                  └──────┬───────┘
                         ▼
            ┌──── RDS Postgres ────┐
            │  guardus-prod-pg-v2   │
            │  guardus-prod-pg-dev  │
            └────┬──────────────────┘
                 │
            ElastiCache Redis (캐시)
                 │
            Loki + Alloy (로그 → S3)
            Prometheus + Grafana (메트릭)
```

## 컴포넌트

| 디렉토리 | 역할 | 스택 |
|---|---|---|
| `openresty/` | 봇 분류, 정책(pass/meter/verify/token_only/block/gone), 리버스 프록시 | OpenResty + Lua |
| `internal-api/` | OpenResty 전용 내부 API (토큰 검증, access 로깅, bot catalog) | Spring Boot 3 (Java) |
| `admin-api/` | 어드민/포털 API: `/admin/*`, `/me/*`, `/auth/*`, `/admin/stats/*` | Spring Boot 3 (Java) |
| `frontend/` | 정적 SPA (`portal-app.html`) — 어드민 대시보드 + 채널 오너 포털 | HTML + Vanilla JS |
| `k8s/` | Kustomize overlay (base / overlays/dev / overlays/prod-v2) | Kustomize + Helm |
| `terraform-v2/` | EKS / RDS / Redis / S3(Loki) / IAM Pod Identity | Terraform |
| `token-api/` | **deprecated** — Node.js Fastify 옛 코드, deploy 안 됨 | — |

## 환경 분리

| | dev | prod |
|---|---|---|
| Namespace | `guardus-dev` | `guardus` |
| RDS | `guardus-prod-pg-dev` (t4g.micro) | `guardus-prod-pg-v2` |
| Redis | `guardus-prod-redis-dev` (t4g.micro) | `guardus-prod-redis-v2` |
| Host | `guardus-admin-dev.viewus.co` (admin UI 만) | `guardus-admin.viewus.co` + 채널 도메인 |
| 이미지 tag bump | CI 자동 (paths-filter) | dev SHA 검증 후 수동 promote |

**신규 기능 / 변경 / 실험은 반드시 dev 먼저.** prod 직접 배포는 hotfix 또는 promote 만.

## 로컬 개발

```bash
cp .env.example .env       # ADMIN_KEY, STATS_KEY 등 설정
docker compose up -d       # localhost:8081
```

코드 변경 → `git push origin main` → CI → ECR 빌드 + dev overlay SHA 자동 bump → ArgoCD 가 dev 에 sync.

## Prod promote

dev 검증 후 `k8s/overlays/prod-v2/kustomization.yaml` 의 변경된 컴포넌트 `newTag` 를 dev 의 새 SHA 로 수동 변경 → commit → push → ArgoCD prod sync.

## 핵심 불변 규칙

- `X-Botgate-Bypass` 헤더명 / `GUARDUS_BYPASS_KEY` 환경변수명 변경 금지 (Cloudflare WAF 의존)
- `alb.ingress.kubernetes.io/group.name: guardus-shared-v2` 변경 금지 (ALB hostname 재생성됨)
- 신규 채널 DNS 는 `guardus-endpoint.viewus.co` CNAME 만 (ALB hostname 직접 가리키지 말 것)
- prod 직접 push 지양, dev → 검증 → promote
- `terraform apply / destroy` 는 사용자 직접 (Claude 는 plan / 조회만)

## 봇 정책 / 키

- 4-way 분류: `malicious` / `bot` / `other_bot` / `user`
- 7 purpose: ai_training / ai_search / ai_assistant / search_engine / seo / social / generic
- 6 액션: pass / meter / verify / token_only / block / gone
- 외부 모니터링 (innerops 등) 은 STATS_KEY (read-only, GET /admin/stats/* + /admin/logs 만)
- 통합 KPI 엔드포인트: `GET /admin/stats/summary?domain=<선택>`

## 등록 채널

| 도메인 | 방식 |
|---|---|
| `viewus.co` | Cloudflare Worker `/en` |
| `pure-beef.kr` / `www.pure-beef.kr` | Cloudflare DNS-only → `guardus-endpoint.viewus.co` |
| `mobilitytv.co.kr` / `www.mobilitytv.co.kr` | Cloudflare DNS-only → `guardus-endpoint.viewus.co` |

## 더 보기

- K8s 매니페스트 / 배포: [`k8s/README.md`](k8s/README.md)
- IaC (EKS / RDS / IAM): [`terraform-v2/README.md`](terraform-v2/README.md)
- LLM 작업 규칙 / 학습 사고: [`CLAUDE.md`](CLAUDE.md)
