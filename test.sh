#!/usr/bin/env bash
# ============================================================
#  botgate — 통합 테스트 스크립트
#  사용법:  ./test.sh [token-api URL] [openresty URL]
#  기본값:  token-api=http://localhost:3000  openresty=http://localhost:8081
# ============================================================

API="${1:-http://localhost:3000}"
GW="${2:-http://localhost:8081}"

# ── 색상 ─────────────────────────────────────────────────────
GRN="\033[0;32m"; RED="\033[0;31m"; YLW="\033[0;33m"
CYN="\033[0;36m"; BLD="\033[1m"; RST="\033[0m"

PASS=0; FAIL=0; SKIP=0

# ── 헬퍼 ─────────────────────────────────────────────────────
section() { echo -e "\n${BLD}${CYN}▶ $1${RST}"; }

ok()   { echo -e "  ${GRN}✓${RST}  $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${RST}  $1"; ((FAIL++)); }
skip() { echo -e "  ${YLW}·${RST}  $1 ${YLW}(skip)${RST}"; ((SKIP++)); }
info() { echo -e "      ${YLW}↳${RST}  $1"; }

# HTTP 요청 후 상태코드 반환, 바디는 stdout
req() {
  # req METHOD URL [body] [extra curl args...]
  local method=$1 url=$2 body=$3
  shift 3
  if [[ -n "$body" ]]; then
    curl -s -o /tmp/bg_resp -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$body" "$@"
  else
    curl -s -o /tmp/bg_resp -w "%{http_code}" \
      -X "$method" "$url" "$@"
  fi
}

body() { cat /tmp/bg_resp; }
jq_val() { body | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

# ============================================================
#  0. 사전 확인
# ============================================================
section "사전 확인"

status=$(req GET "$API/health" "")
if [[ "$status" == "200" ]]; then
  ok "token-api 헬스체크 ($API)"
else
  fail "token-api 헬스체크 — HTTP $status (서버가 실행 중인지 확인하세요)"
  echo -e "\n${RED}token-api 에 연결할 수 없어요. docker compose up -d 후 재시도하세요.${RST}"
  exit 1
fi

status=$(req GET "$GW/" "")
if [[ "$status" =~ ^[23] ]]; then
  ok "OpenResty 게이트웨이 응답 ($GW)"
else
  skip "OpenResty 응답 없음 — 게이트웨이 테스트를 건너뜁니다 (HTTP $status)"
  GW_SKIP=1
fi

# ============================================================
#  1. Admin — 토큰 CRUD
# ============================================================
section "Admin / 토큰 CRUD"

# 발급
status=$(req POST "$API/admin/tokens" '{"owner":"TestBot-OpenAI","plan":"paid"}')
if [[ "$status" == "200" || "$status" == "201" ]]; then
  TOKEN_ID=$(jq_val "['id']")
  TOKEN_VAL=$(jq_val "['token']")
  ok "POST /admin/tokens  → id=$TOKEN_ID"
  info "token: $TOKEN_VAL"
else
  fail "POST /admin/tokens  → HTTP $status | $(body)"
  TOKEN_ID=""; TOKEN_VAL=""
fi

# 목록 조회
status=$(req GET "$API/admin/tokens" "")
if [[ "$status" == "200" ]]; then
  COUNT=$(body | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  ok "GET  /admin/tokens   → ${COUNT}개"
else
  fail "GET  /admin/tokens  → HTTP $status"
fi

# 비활성화
if [[ -n "$TOKEN_ID" ]]; then
  status=$(req PATCH "$API/admin/tokens/$TOKEN_ID" '{"active":false}')
  if [[ "$status" == "200" ]]; then
    ok "PATCH /admin/tokens/:id  active=false"
  else
    fail "PATCH /admin/tokens/:id  → HTTP $status | $(body)"
  fi
fi

# 재활성화
if [[ -n "$TOKEN_ID" ]]; then
  status=$(req PATCH "$API/admin/tokens/$TOKEN_ID" '{"active":true}')
  if [[ "$status" == "200" ]]; then
    ok "PATCH /admin/tokens/:id  active=true  (복구)"
  else
    fail "PATCH /admin/tokens/:id  → HTTP $status"
  fi
fi

# ============================================================
#  2. Internal — 토큰 검증
# ============================================================
section "Internal / 토큰 검증"

if [[ -n "$TOKEN_VAL" ]]; then
  BODY=$(printf '{"token":"%s","bot_ua":"GPTBot/1.2","domain":"test.example.com","ip":"1.2.3.4"}' "$TOKEN_VAL")
  status=$(req POST "$API/internal/tokens/validate" "$BODY")
  VALID=$(jq_val "['valid']")
  if [[ "$status" == "200" && "$VALID" == "True" ]]; then
    ok "POST /internal/tokens/validate  → valid=true (유효 토큰)"
    info "plan: $(jq_val "['plan']")"
  else
    fail "POST /internal/tokens/validate  → HTTP $status | valid=$VALID"
  fi
else
  skip "토큰 발급 실패로 검증 테스트 건너뜀"
fi

# 무효 토큰
status=$(req POST "$API/internal/tokens/validate" \
  '{"token":"bg_INVALID_TOKEN","bot_ua":"ClaudeBot/1.0","domain":"test.example.com","ip":"1.2.3.4"}')
if [[ "$status" == "401" ]]; then
  ok "POST /internal/tokens/validate  → 401 (무효 토큰)"
else
  fail "POST /internal/tokens/validate  → HTTP $status (401 기대)"
fi

# ============================================================
#  3. Internal — 접근 로그
# ============================================================
section "Internal / 접근 로그"

status=$(req POST "$API/internal/access" \
  '{"bot_ua":"Googlebot/2.1","domain":"test.example.com","ip":"66.249.66.1","verified":true}')
if [[ "$status" == "204" ]]; then
  ok "POST /internal/access  → 204 (검증됨)"
else
  fail "POST /internal/access  → HTTP $status (204 기대)"
fi

status=$(req POST "$API/internal/access" \
  '{"bot_ua":"FakeBot/1.0","domain":"test.example.com","ip":"192.168.1.100","verified":false}')
if [[ "$status" == "204" ]]; then
  ok "POST /internal/access  → 204 (미검증 봇)"
else
  fail "POST /internal/access  → HTTP $status"
fi

# 필수 필드 누락 → 400
status=$(req POST "$API/internal/access" \
  '{"bot_ua":"BadRequest"}')
if [[ "$status" == "400" ]]; then
  ok "POST /internal/access  → 400 (필수 필드 누락)"
else
  fail "POST /internal/access  → HTTP $status (400 기대)"
fi

# ============================================================
#  4. Client — 토큰 발급 / 사용량
# ============================================================
section "Client / 토큰 발급 & 사용량"

status=$(req POST "$API/tokens" '{"owner":"ExternalBot","plan":"free"}')
if [[ "$status" == "200" || "$status" == "201" ]]; then
  CLIENT_TOKEN=$(jq_val "['token']")
  ok "POST /tokens  → 클라이언트 토큰 발급"
  info "token: $CLIENT_TOKEN"
else
  fail "POST /tokens  → HTTP $status"
  CLIENT_TOKEN=""
fi

if [[ -n "$CLIENT_TOKEN" ]]; then
  status=$(req GET "$API/tokens/$CLIENT_TOKEN/usage" "")
  if [[ "$status" == "200" ]]; then
    ok "GET  /tokens/:token/usage  → 사용량 조회"
    info "$(body)"
  else
    fail "GET  /tokens/:token/usage  → HTTP $status"
  fi

  # 존재하지 않는 토큰
  status=$(req GET "$API/tokens/bg_NOTEXIST/usage" "")
  if [[ "$status" == "404" ]]; then
    ok "GET  /tokens/:token/usage  → 404 (없는 토큰)"
  else
    fail "GET  /tokens/:token/usage  → HTTP $status (404 기대)"
  fi
fi

# ============================================================
#  5. Admin — 통계 & 로그
# ============================================================
section "Admin / 통계 & 로그"

for path in "/admin/stats/bots" "/admin/stats/domains" "/admin/stats/daily"; do
  status=$(req GET "$API$path" "")
  if [[ "$status" == "200" ]]; then
    COUNT=$(body | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
    ok "GET  $path  → ${COUNT}건"
  else
    fail "GET  $path  → HTTP $status"
  fi
done

status=$(req GET "$API/admin/logs?limit=10" "")
if [[ "$status" == "200" ]]; then
  COUNT=$(body | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  ok "GET  /admin/logs?limit=10  → ${COUNT}건"
else
  fail "GET  /admin/logs  → HTTP $status"
fi

# ============================================================
#  6. Admin — 토큰 삭제 (cleanup)
# ============================================================
section "Admin / 토큰 삭제 (cleanup)"

for id in "$TOKEN_ID"; do
  if [[ -n "$id" ]]; then
    status=$(req DELETE "$API/admin/tokens/$id" "")
    if [[ "$status" == "200" || "$status" == "204" ]]; then
      ok "DELETE /admin/tokens/$id"
    else
      fail "DELETE /admin/tokens/$id  → HTTP $status"
    fi
  fi
done

# ============================================================
#  7. OpenResty 게이트웨이 (컨테이너 필요)
# ============================================================
section "OpenResty / 봇 필터"

if [[ -n "$GW_SKIP" ]]; then
  skip "OpenResty 연결 없음 — 게이트웨이 테스트 전체 건너뜀"
else
  # 일반 브라우저 → 통과
  status=$(req GET "$GW/" "" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
  if [[ "$status" == "200" ]]; then
    ok "일반 브라우저 UA  → 200 통과"
  else
    fail "일반 브라우저 UA  → HTTP $status"
  fi

  # GPTBot (AI 봇, rDNS 미통과 → 403 예상)
  status=$(req GET "$GW/" "" \
    -H "User-Agent: GPTBot/1.2 (+https://openai.com/gptbot)")
  if [[ "$status" == "403" ]]; then
    ok "GPTBot UA (rDNS 실패)  → 403 차단"
  elif [[ "$status" == "200" ]]; then
    ok "GPTBot UA  → 200 통과 (rDNS 성공 또는 캐시)"
  else
    fail "GPTBot UA  → HTTP $status"
  fi

  # 악성 UA → 403
  status=$(req GET "$GW/" "" \
    -H "User-Agent: masscan/1.3 (https://github.com/robertdavidgraham/masscan)")
  if [[ "$status" == "403" ]]; then
    ok "악성 UA (masscan)  → 403 차단"
  else
    fail "악성 UA (masscan)  → HTTP $status (403 기대)"
  fi

  # sqlmap
  status=$(req GET "$GW/" "" \
    -H "User-Agent: sqlmap/1.7")
  if [[ "$status" == "403" ]]; then
    ok "악성 UA (sqlmap)  → 403 차단"
  else
    fail "악성 UA (sqlmap)  → HTTP $status (403 기대)"
  fi
fi

# ============================================================
#  8. OpenResty rDNS 테스트 엔드포인트
# ============================================================
section "OpenResty / rDNS 직접 테스트 (/test/rdns)"

if [[ -n "$GW_SKIP" ]]; then
  skip "OpenResty 연결 없음"
else
  # Googlebot IP (66.249.66.1) 로 rDNS 검증
  status=$(req GET "$GW/test/rdns" "" \
    -H "User-Agent: Googlebot/2.1 (+http://www.google.com/bot.html)" \
    -H "X-Test-IP: 66.249.66.1")
  if [[ "$status" == "200" ]]; then
    VERIFIED=$(jq_val "['verified']")
    DETAIL=$(jq_val "['detail']")
    ok "Googlebot IP (66.249.66.1)  → verified=$VERIFIED"
    info "$DETAIL"
  else
    fail "GET /test/rdns  → HTTP $status"
  fi

  # 가짜 IP (GPTBot UA + 일반 IP)
  status=$(req GET "$GW/test/rdns" "" \
    -H "User-Agent: GPTBot/1.2 (+https://openai.com/gptbot)" \
    -H "X-Test-IP: 1.2.3.4")
  if [[ "$status" == "200" ]]; then
    VERIFIED=$(jq_val "['verified']")
    ok "GPTBot + 가짜 IP (1.2.3.4)  → verified=$VERIFIED"
    info "$(jq_val "['detail']")"
  else
    fail "GET /test/rdns (fake IP)  → HTTP $status"
  fi
fi

# ============================================================
#  결과 요약
# ============================================================
TOTAL=$((PASS + FAIL + SKIP))
echo -e "\n${BLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
echo -e "  결과  ${GRN}통과 $PASS${RST}  /  ${RED}실패 $FAIL${RST}  /  ${YLW}건너뜀 $SKIP${RST}  (총 $TOTAL)"
echo -e "${BLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}\n"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
