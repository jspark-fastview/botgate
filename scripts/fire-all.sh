#!/usr/bin/env bash
# ============================================================
#  botgate — 전체 봇 트래픽 동시 발사 🚀
#
#  사용법:
#    ./fire-all.sh              # 기본 (각 봇 10건)
#    COUNT=30 ./fire-all.sh     # 각 봇 30건
#    GW=http://localhost:8081 COUNT=50 ./fire-all.sh
# ============================================================

export GW="${GW:-http://localhost:8081}"
export API_URL="${API_URL:-http://localhost:3000}"
export COUNT="${COUNT:-10}"
# TOKEN 이 이미 설정되어 있으면 그대로 사용 (bot.sh 에서 주입)

DIR="$(dirname "$0")"

GRN="\033[0;32m"; RED="\033[0;31m"; YLW="\033[0;33m"
CYN="\033[0;36m"; BLD="\033[1m"; DIM="\033[2m"; RST="\033[0m"

TOTAL_PASS=0; TOTAL_BLOCK=0; TOTAL_OTHER=0

# ── 사전 확인 ─────────────────────────────────────────────
echo -e "${BLD}${CYN}botgate / fire-all${RST}  — 게이트웨이: $GW  / 봇당 요청: $COUNT"
echo -e "${DIM}$(date '+%Y-%m-%d %H:%M:%S')${RST}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GW/" 2>/dev/null)
if [[ ! "$STATUS" =~ ^[23] ]]; then
  echo -e "${RED}✗ OpenResty 연결 실패 (HTTP $STATUS). docker compose up -d 확인하세요.${RST}"
  exit 1
fi
echo -e "${GRN}✓${RST} 게이트웨이 응답 확인"

# 토큰 상태 표시
if [[ -n "${TOKEN:-}" ]]; then
  echo -e "${GRN}✓${RST} 토큰 사용 중 — ${TOKEN:0:20}..."
else
  echo -e "${YLW}!${RST} 토큰 없음 — AI 봇은 402 응답 예상"
fi
echo ""

# ── 봇 목록 ───────────────────────────────────────────────
BOTS=(
  "gptbot.sh"
  "claudebot.sh"
  "perplexitybot.sh"
  "googlebot.sh"
  "fakebot.sh"
)

# ── 병렬 실행 ─────────────────────────────────────────────
PIDS=()
TMPFILES=()

for bot in "${BOTS[@]}"; do
  tmpfile=$(mktemp /tmp/bg_bot_XXXXXX)
  TMPFILES+=("$tmpfile")
  bash "$DIR/$bot" > "$tmpfile" 2>&1 &
  PIDS+=($!)
done

echo -e "${DIM}모든 봇 발사 완료, 응답 대기중...${RST}"

# ── 결과 수집 ─────────────────────────────────────────────
for i in "${!PIDS[@]}"; do
  wait "${PIDS[$i]}"
  cat "${TMPFILES[$i]}"
done

# ── 전체 통계 집계 ─────────────────────────────────────────
echo -e "\n${BLD}$(printf '═%.0s' {1..72})${RST}"
echo -e "${BLD}${CYN}  전체 결과 요약${RST}"
echo -e "${BLD}$(printf '═%.0s' {1..72})${RST}"

for tmpfile in "${TMPFILES[@]}"; do
  # ANSI 코드 제거 후 파싱
  clean=$(sed 's/\x1b\[[0-9;]*m//g' "$tmpfile" 2>/dev/null)

  # 봇 이름: "▶  XXX" 줄에서 추출
  bot_name=$(echo "$clean" | grep '▶' | head -1 | sed 's/.*▶  *//')

  pass=$(echo      "$clean" | grep -c "PASS")  ; pass=${pass:-0}
  block=$(echo     "$clean" | grep -c "BLOCK") ; block=${block:-0}
  total_rows=$(echo "$clean" | grep -cE '^ *[0-9]{3} ' 2>/dev/null); total_rows=${total_rows:-0}
  row_other=$(( total_rows - pass - block ))
  [[ $row_other -lt 0 ]] && row_other=0

  TOTAL_PASS=$(( TOTAL_PASS + pass ))
  TOTAL_BLOCK=$(( TOTAL_BLOCK + block ))
  TOTAL_OTHER=$(( TOTAL_OTHER + row_other ))

  row_total=$(( pass + block + row_other ))
  if [[ -n "$bot_name" ]]; then
    printf "  %-30s  통과 ${GRN}%3d${RST}  차단 ${RED}%3d${RST}  기타 ${YLW}%2d${RST}  (총 %d)\n" \
      "$bot_name" "$pass" "$block" "$row_other" "$row_total"
  fi

  rm -f "$tmpfile"
done

GRAND=$((TOTAL_PASS + TOTAL_BLOCK + TOTAL_OTHER))
echo -e "${BLD}$(printf '─%.0s' {1..72})${RST}"
printf "  %-30s  통과 ${GRN}%3d${RST}  차단 ${RED}%3d${RST}  기타 ${YLW}%2d${RST}  (총 %d)\n" \
  "합계" "$TOTAL_PASS" "$TOTAL_BLOCK" "$TOTAL_OTHER" "$GRAND"

# 차단율 계산
if [[ $GRAND -gt 0 ]]; then
  BLOCK_PCT=$(awk "BEGIN { printf \"%.1f\", $TOTAL_BLOCK / $GRAND * 100 }")
  PASS_PCT=$(awk  "BEGIN { printf \"%.1f\", $TOTAL_PASS  / $GRAND * 100 }")
  echo -e "\n  차단율 ${RED}${BLOCK_PCT}%${RST}   통과율 ${GRN}${PASS_PCT}%${RST}"
fi

echo -e "${BLD}$(printf '═%.0s' {1..72})${RST}\n"
