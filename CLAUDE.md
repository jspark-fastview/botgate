# Working Rules (LLM Behavior)

> Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that **YOUR** changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. 인프라 명령은 사용자가 직접 실행
**Terraform 등 비용/state 영향 있는 명령은 절대 직접 실행 X.**

- `terraform init / plan / apply / destroy` → 사용자가 실행. 명령어만 제공.
- `.tf` 파일 편집, plan 미리보기, output 해석은 OK.
- IaC 폴더: `/Users/fastview/botcontroller/terraform/` (EKS + VPC + ECR + IRSA + Secrets stub)
- 같은 원칙 적용 대상: `kubectl apply`, `helm install`, `eksctl create`, `aws ... create-*`
  → 일회성 mutation 명령은 사용자가 직접. 조회 (`get`, `describe`, `sts get-caller-identity` 등) 는 자동 OK.

## 5. 🚨 제약사항으로 목표 미달 시 반드시 명시 🚨
**사용자가 의도한 결과를 못 달성하면 작업 끝나고 "잘 됐어요" 보고 X. 명시적으로 알림.**

가장 중요한 원칙. 위반 = 사용자 신뢰 잃음.

원래 의도 (예: "X 를 Y 로 이전해서 Z 문제 해결") 가 기술적 제약 (AWS API limit, K8s 제약, force-replacement 등) 으로 인해 부분만 가능하면:

- 부분 진행 후 **"전체 의도 달성 여부"** 를 명시적으로 보고:
  - ✅ 한 것: (예) RDS 만 2a 로 이전
  - ❌ 못 한 것: (예) EKS cluster control plane subnet — AWS 제약상 변경 불가
  - ⚠️ 그 결과 사용자가 원했던 효과 (예: 2c IP 부족 해결) **는 미달성** — 다른 워크로드 정리 또는 cluster 재생성 필요

- 작업 중간에 제약 발견 시 즉시 알리고 "그래도 진행할지" 사용자 결정 받기. silent 하게 작은 옵션으로 변경 후 진행 X.

- 사용자가 "X 해줘" 했는데 X 의 효과가 진짜 안 나면 (예: 다음에 같은 사고 재발 가능) 명확히 경고. trade-off 가 "그래도 되겠지" 가 아니라 "이게 미달성된다는 점 의식하고 결정해라".

위반 사례 (2026-05-18): 사용자 "2c subnet IP 부족 해결" 의도 → 나는 RDS 만 이전하고 EKS cluster 가 여전히 2c 의존성 갖고 있는 점 명확히 안 알림 → 사고 재발 → 사용자 격노.

## 6. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

> These rules are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come **before** implementation rather than after mistakes.

---

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
- **신규 채널 DNS 는 `guardus-endpoint.viewus.co` CNAME** — ALB hostname 직접 가리키지 말 것 (ALB 변경 시 사고 방지)
- **`alb.ingress.kubernetes.io/group.name` 변경 X** — ALB hostname 새로 생성됨 (2026-05-15 사고 사례)
- `alb-eks.viewus.co` 는 deprecated alias (기존 채널 호환). 새로운 건 `guardus-endpoint.viewus.co` 만 사용

### EKS / Terraform 제약 (2026-05-15 학습)

- **EKS cluster 의 subnet AZ 집합은 생성 후 변경 불가** — `aws_eks_cluster.vpc_config.subnet_ids` 에 새 AZ 추가 시 `InvalidParameterException`. 변경하려면 cluster 재생성. control plane ENI IP 부족 시 다른 워크로드 정리 또는 cluster 재생성 외 방법 없음.
- **EKS managed node group `subnet_ids` 변경 = force replacement** — 기존 노드 다 destroy. 4 AZ 확장은 Karpenter 로 (EC2NodeClass.subnetSelectorTerms 의 태그로 자동 발견).
- **RDS cross-AZ 이전은 read replica → promote** — 무다운타임 패턴. snapshot/restore 보다 빠르고 안전. `aws rds create-db-instance-read-replica --availability-zone ap-northeast-2a` 후 lag 0 도달 시 `promote-read-replica` + Secrets Manager endpoint 갱신 + admin-api rolling restart.
- **Spring `@Cacheable` 은 반드시 `unless` 로 0/empty 응답 cache 막기** — prewarm/cold-start 시 LokiClient timeout 등으로 silent 빈 응답 받으면 70m TTL 로 캐시 → portal/me-stats 가 70분 동안 0. `unless = "T(io.guardus.admin.util.CacheUtil).isEmpty(#result)"`.
- **CI GitOps bump 는 paths-filter aware 해야** — 변경 안 된 component 의 SHA 갱신 시 ECR 에 그 SHA 이미지 없음 → `ImagePullBackOff`. `detect` job 의 `outputs.<component>` 로 분기.
- **CI GitOps bump push 는 pull --rebase retry** — race condition (다른 commit 동시 push) 시 reject. 5회 retry 권장.

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
| `pikle.io` / `www.pikle.io` | Route 53 CNAME → `guardus-endpoint.viewus.co` |
| `pure-beef.kr` / `www.pure-beef.kr` | Cloudflare DNS-only → `guardus-endpoint.viewus.co` |
| `mobilitytv.co.kr` / `www.mobilitytv.co.kr` | Cloudflare DNS-only → `guardus-endpoint.viewus.co` |

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
GUARDUS_URL=https://guardus-admin.viewus.co
GUARDUS_STATS_KEY=<같은_키>
```
