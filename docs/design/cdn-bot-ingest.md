# CDN Bot 데이터 통합 + 정책 제공 — 설계 문서

> 상태: **설계 (구현 전)** · 작성 2026-05-29 · 참조 모델: TollBit

## 1. 배경 / 목표

기존 GuardUs 는 **inline reverse proxy** (OpenResty) 로 채널 트래픽을 직접 받아 봇을 분류·과금·표시한다.
신규 요구: GuardUs 가 직접 받지 않고, **CDN 업체가 이미 분류한 bot 데이터만** 받아 같은 UI 에 정제 표시하고,
나아가 GuardUs 의 봇 화이트리스트/정책을 CDN 엣지에 제공한다 (TollBit 방식).

핵심 제약/방향 (사용자 확정):
- **CDN-agnostic**: Cloudflare / Fastly / CDNetworks / Akamai 등 어떤 업체든 plugin 으로 추가 가능해야.
- **전달 방식**: CDN push (webhook / log forward) 우선.
- **데이터 통합**: 기존 inline 봇 데이터와 **같은 Loki/UI 에 통합하되 `source` 로 구분**.
- **화이트리스트 제공**: TollBit 방식 참조 (봇 paywall — 토큰 검증 / 402 / 화이트리스트 통과).

## 2. 참조 모델 — TollBit

AI 봇 → 사이트 방문 → CDN 이 봇 감지/분류 → (block 대신) **TollBit subdomain 으로 302 redirect** →
TollBit 이 토큰 검증: valid 면 과금 + 접근 허용 / 없으면 **402 Payment Required** → analytics 대시보드.
CDN (Cloudflare/Fastly/Akamai/Imperva) 은 봇 분류 + forwarding 만, 정책/과금은 TollBit(중앙)이 enforce.

→ **GuardUs 가 이미 같은 모델**: 6 action(pass/meter/verify/token_only/block/gone) + 토큰 발급/검증 + 과금(billed) + 봇 분류.
차이는 inline proxy(GuardUs) vs CDN redirect→subdomain(TollBit) 뿐. GuardUs 가 "봇 paywall endpoint" 역할을 맡으면 동일.

출처:
- https://tollbit.com/bot-paywall/
- https://www.fastly.com/documentation/guides/integrations/non-fastly-services/tollbit/
- https://www.akamai.com/blog/security/from-scraping-paying-monetizing-ai-bots-edge

## 3. 기존 데이터 흐름 (inline) — 재사용 대상

```
채널 트래픽 → OpenResty (봇 분류)
  ├─ stdout JSON access log → alloy(app=openresty 긁음) → Loki ──→ admin-api LokiStatsService → /me/stats, /admin/stats → UI
  └─ POST internal-api /internal/access → access_logs (Postgres) → 토큰 FK / 과금(billed) 집계
```

- **UI 표시 = Loki 기반** (`{namespace="guardus", app="openresty"} | json | category=...`, stream label: host, category)
- **과금/토큰 = access_logs DB**
- **canonical bot event schema** (둘이 동일):
  ```
  { token?, bot_ua, domain, domain_canonical, ip, path,
    verified(bool), billed(bool), blocked(bool),
    category(user|bot|other_bot|malicious),
    bot_purpose(ai_training|ai_search|ai_assistant|search_engine|seo|social|generic),
    bot_name, bot_vendor, ts }
  ```

## 4. 신규 아키텍처 — Adapter (CDN-agnostic)

```
                       ┌──────────────────── GuardUs ────────────────────┐
[CDN bot log]──push──▶ │  Adapter (core + CDN plugin)                     │
[CDN bot redirect]───▶ │    inbound  : CDN raw → canonical event          │
                       │    outbound : canonical policy → CDN-specific rule│
                       └───┬───────────────────────┬──────────────────────┘
                           │ canonical event       │ policy enforce 결과도 event
                           ▼                        ▼
            Loki (source=cdn:X label)      access_logs (source 컬럼)
                           │                        │
                           ▼                        ▼
                  admin-api stats ──────────────▶ 기존 UI (inline + cdn 통합/분리)
```

### Adapter plugin 구조
```
adapter/
  core/         공통 — HTTP receiver, CDN별 auth(secret/HMAC), schema validate,
                normalize pipeline, source labeling, dedup,
                Loki batch push(buffer+재시도+백프레셔) + access_logs write,
                verify endpoint(저지연, 정책 Redis 캐싱) [모드 B]
  plugins/
    cloudflare/  ingest: Logpush/GraphQL → canonical | verify-edge: CF Worker snippet | policy: CF Ruleset API
    fastly/      ingest: real-time log → canonical    | verify-edge: VCL snippet        | policy: VCL/Edge
    cdnetworks/  ingest: ...                           | verify-edge: ...                | policy: ...
```
- 새 CDN = plugin 1개 추가. core 무변경.
- **핵심 로직 = 매핑 테이블** (§6).
- 배포 위치: 독립 microservice `bot-ingest-adapter` (**Go**) — 기존 admin/internal-api(Java) 와 분리.
  - 이유: CDN별 webhook 인증·rate·확장이 독립적. internal-api 결합 시 과금 로직과 얽힘.
  - **Go 선택 근거**: ① KEDA burst scale 시 cold start ~ms (Java JVM warmup 24s 대비 결정적),
    ② verify 저지연(goroutine+캐시), ③ Loki batch push(channel/goroutine, promtail 패턴),
    ④ arm64(t4g) 네이티브 distroless ~15MB. 팀 주스택 Java 와 다르지만 canonical schema 만 공유 → 분리 부담 작음.
  - 구조:
    ```
    bot-ingest-adapter/  (Go module)
      cmd/adapter/main.go
      internal/canonical/  event + policy schema (struct)
      internal/ingest/     HTTP receiver + plugin interface (Transformer)
      internal/loki/       batch push client (channel/goroutine, LOKI_URL)
      internal/verify/     verify handler + 정책 cache (Redis)
      plugins/             CDN별 (1차 CDN 확정 후)
      Dockerfile           multi-stage, CGO_ENABLED=0 GOARCH=arm64, distroless
    ```

### 두 통합 모드 (canonical schema 공유, 보완적)
- **모드 A — Log Ingest (analytics)** ← 1차 목표
  CDN 이 봇 로그를 adapter 로 push → canonical 변환 → Loki(`source=cdn:X`) → UI 표시.
  enforce 없음. verify 안 거치는 봇까지 **전체 가시성**.
- **모드 B — Verify (TollBit식 화이트리스트 제공)** ← 후속. **방식 (b) CDN verify 확정**.
  CDN edge(CF Worker / Fastly VCL 등)가 봇 요청마다 GuardUs **verify endpoint** 동기 호출 →
  GuardUs 가 화이트리스트/토큰/정책으로 판정 → `{action: allow|meter|verify|block, reason}` 반환 →
  **CDN 이 결과대로 origin 통과/차단. 콘텐츠는 CDN 이 제공** (GuardUs 는 origin 콘텐츠 무관, 부하 0).
  - `POST /verify { domain, bot_ua, bot_name, token? }` → `{ action, reason, billed? }`
  - **저지연 필수** (봇 요청 path) → 정책 캐싱 (기존 admin-api Redis 재사용).
  - **verify 호출 자체 = canonical event 기록** → 실시간 enforce + analytics 동시 (별도 log push 불필요).
  - 정책 source = GuardUs DB (bot_catalog, purpose_policies, 화이트리스트).
  - CDN별 edge 연동 코드(CF Worker / Fastly VCL snippet) 도 plugin 이 제공.

## 5. Canonical Schema

### Event (ingest target) — 기존 access_logs/Loki 와 동일 + 확장
기존 필드 + 추가:
- `source` : `inline` | `cdn:cloudflare` | `cdn:fastly` | `cdn:cdnetworks` …
- `owner_id` : 채널 매핑 (domain → channels.owner_id, §7)
- (선택) `cdn_request_id`, `cdn_raw_category` (원본 보존 — 디버깅/재매핑용)

### Policy (outbound, 모드 B) — GuardUs 정책의 CDN-중립 표현
```
{ domain, bot_match(bot_name|vendor|ua_pattern|category),
  action(allow|meter|verify|token_only|block),
  rate?(과금 단가), priority }
```
→ 각 plugin 이 CF Ruleset / Fastly VCL / CDNetworks rule 로 변환.

## 6. CDN → GuardUs 매핑 테이블 (plugin 핵심)

각 CDN 의 봇 분류를 GuardUs canonical 로 매핑. 예시 (Cloudflare):
| CDN raw | → category | → bot_purpose | → vendor |
|---|---|---|---|
| verified_bot: GPTBot | bot | ai_training | OpenAI |
| verified_bot: ChatGPT-User | bot | ai_assistant | OpenAI |
| verified_bot: Googlebot | other_bot | search_engine | Google |
| likely_automated / threat | malicious | generic | — |
| (그 외) | bot | generic | — |

- bot_name → vendor/purpose 는 기존 `bot_catalog` 테이블 재사용 (GuardUs 가 이미 보유).
- 매핑 안 되는 신규 봇 = `generic` fallback + 로그 경고 → catalog 보강.

## 7. 채널(owner) 매핑 + 통합/분리

- CDN 데이터의 `domain` → `channels.domain` 매칭 → `owner_id` 주입.
  - 매칭 안 되는 도메인 = 미등록 채널 → drop 또는 "미등록" 버킷 (정책 결정 필요).
- Loki stream label `source` 로 inline/cdn 구분.
- admin-api stats selector 확장: `{namespace="guardus", app=~"openresty|bot-ingest"}` + 필요 시 `source` 필터.
  - UI: 전체 합산(기본) + source 별 토글 (inline only / cdn only / 합산).

## 8. 단계별 Roadmap

1. **Phase 0 (현재)** — 본 설계 문서 합의.
2. **Phase 1 — 모드 A (log ingest + 표시)**
   - adapter core + plugin 1개 (사용자 우선 CDN)
   - canonical 변환 + Loki push (source=cdn:X)
   - admin-api selector 확장 + UI source 구분
   - 채널(domain→owner_id) 매핑
3. **Phase 2 — access_logs 통합** (과금/집계에 cdn 데이터 포함, source 컬럼)
4. **Phase 3 — 모드 B (bot paywall / 화이트리스트 제공)**
   - GuardUs paywall endpoint (토큰 검증, 402, 화이트리스트 통과)
   - policy outbound (canonical → CDN rule push)
5. **Phase 4 — 멀티 CDN plugin 확장** (Fastly, CDNetworks …)

## 9. 결정 / 미결정

### 확정 (2026-05-29)
- [x] **adapter 배포 형태 = 독립 microservice** (`bot-ingest-adapter`). internal-api 와 분리.
      핵심 역할 = **데이터형 변환기(gateway)**: 각 CDN 의 제각각 형태(Cloudflare Logpush JSON ≠
      Fastly log ≠ CDNetworks) → 단일 canonical 로 통일. 뒷단(Loki/UI/과금)은 CDN 을 모름.
- [x] **Loki ingest = adapter 직접 push** (loki-gateway `/loki/api/v1/push`, `LOKI_URL` env).
      ~~stdout→alloy~~ 에서 변경 — 근거: 대량 트래픽 시 alloy(노드별 DaemonSet)가 병목.
      adapter 가 KEDA scale 하면 pod 마다 각자 batch push → 수평 확장. stdout 직렬화 오버헤드도 회피.
      → adapter 책임: 변환 + **batch buffer + 재시도/백프레셔 + stream label 직접 제어**
         (`{app=bot-ingest, namespace=guardus, source=cdn:X, host, category}`).
      → endpoint 변경 영향은 `LOKI_URL` env 로 흡수 (admin-api 선례).
      → **alloy 무변경** (openresty 만 계속 alloy 담당).
- [x] **burst 대응 = adapter KEDA scale** (openresty ScaledObject 패턴 — RPS/queue depth 기반).

### 미결정 (Phase 1 구현 중 결정)
- [ ] 1차 대상 CDN 우선순위 (Cloudflare? Fastly? CDNetworks?). ← 보류
- [ ] 미등록 도메인 CDN 데이터 처리: drop vs 미등록 버킷.
- [ ] 중복 제거 (CDN at-least-once delivery 시 event dedup key).
- [ ] 과금 정책: CDN ingest 데이터도 billed 대상인가 (모드 A 는 analytics-only 이므로 보통 X).
- [ ] CDN webhook 인증 방식 (CDN별 HMAC/secret/IP allowlist). → §10.2 채널별 토큰으로 확정.

## 10. CDN 온보딩 (Cloudflare) — 설계 확정 2026-06-01

기존 `integration_mode` 축(reverse_proxy=인라인, external=퍼블리셔 직접 verify)에 CDN 을 얹는다.

### 10.1 데이터 모델
- `channels.integration_mode` 에 `cdn_cloudflare` 추가 (확장: `cdn_fastly` …).
  - = **"주 수집 경로가 CDN"** 이라는 뜻. **OpenResty 라우팅을 강제 차단하지 않는다.**
  - 정상 토폴로지(DNS=CDN, origin=퍼블리셔)면 OpenResty 우회라 inline 0. 하지만
    ① origin 직접 접근 봇, ② inline↔CDN 전환기, ③ 이중 프록시(CF→OpenResty) 시엔
    OpenResty 가 봇 트래픽을 **받을 수 있다** → 그땐 `source=inline` 으로 그대로 기록.
  - 따라서 inline/cdn 둘 다 수집하고 **`source` 로 구분**(전제: "안 받는다"가 아니라 "받을 수 있다").
  - **중복 주의**: 같은 요청이 양쪽으로 오는 경우(이중 프록시)만 진짜 double-count →
    `RayID` 기반 dedup(후속, §9) 또는 온보딩 가이드에 "이중 프록시(CF origin=OpenResty) 피하라" 명시.
- `channels.ingest_token` **신규 컬럼**(Flyway) — 채널별 ingest 인증 토큰. 채널 등록(CDN 모드) 시 발급(`openssl rand -hex 24`).
  - `verify_token`(external 모드용)과 분리 — 용도/수명 다름.

### 10.2 외부 노출 + 인증 (결정: 별도 host + 채널별 토큰)
- **ingress**: `cdn-ingest.viewus.co`(prod) / `cdn-ingest-dev.viewus.co`(dev) → `bot-ingest-adapter:8090`.
  기존 ALB(`group.name=guardus-shared-v2`). DNS = `guardus-endpoint.viewus.co` CNAME 패턴.
- **인증**: 채널별 토큰. Cloudflare Logpush `header_Authorization: Bearer <ingest_token>`.
- **adapter 토큰 검증/채널 매핑**: admin-api `GET /internal/channels/ingest`(domain, ingest_token, owner_id, integration_mode)
  를 adapter 가 주기 동기화 → 메모리 캐시(token→channel). 현재 `resolveOwner` stub 을 이 캐시로 대체.
  - openresty 의 channels 동기화 패턴과 동일 사상. 토큰 폐기(revoke) = 캐시 갱신으로 반영.
- (선택) Cloudflare IP allowlist annotation.

### 10.3 온보딩 플로우 (admin UI 패널)
```
채널 등록 → 연동방식 "CDN·Cloudflare" 선택
  → GuardUs 발급: ingest URL + 채널 토큰 (패널에 복붙용 표시)
  → 가이드(§10.4) 단계대로 Cloudflare 설정
  → "수신 확인" 버튼 → adapter 로 데이터 들어오면 ✓ (verified_at 기록)
```

### 10.4 가이드 내용 (Cloudflare Logpush)
- Logpush job: dataset = **HTTP requests**, destination = **HTTP**
- URL: `https://cdn-ingest.viewus.co/ingest/cloudflare`
- header: `Authorization: Bearer <채널 ingest_token>`
- 필드: `ClientRequestHost, ClientIP, ClientRequestPath, ClientRequestUserAgent, EdgeStartTimestamp, VerifiedBotCategory, RayID`
- **필터: `VerifiedBotCategory` 있는 요청만** (봇만 전송 → 트래픽·비용 절감). Bot Management(Enterprise) 없으면 전체 전송 후 adapter 가 분류.

### 10.5 UI 정리 (전역 토글 → 통합)
- `src-toggle`(전체/인라인/CDN) **제거**, `_dashSource`/`sourceParam` 제거 → 대시보드 **통합(전체) 고정**.
- 채널 목록/선택: `integration_mode` **뱃지** (인라인 / CDN·Cloudflare / 외부).
- 로그·봇 drill-down: `source` 컬럼(개별 레코드에서만 출처 표시).

### 10.6 구현 Phase (dev 먼저 → prod promote)
1. **DB + admin-api**: `ingest_token` migration + 채널 등록 시 integration_mode/token 발급 + `GET /internal/channels/ingest` + 온보딩 API(endpoint/token 반환, 수신확인).
2. **adapter**: 채널 캐시(admin-api 동기화) + 채널별 토큰 인증 + domain→owner 매핑(stub 대체).
3. **ingress + DNS**: `cdn-ingest(-dev).viewus.co` host.
4. **frontend**: 전역 토글 제거 + 채널 뱃지 + 온보딩 가이드 패널 + drill-down source 컬럼.
