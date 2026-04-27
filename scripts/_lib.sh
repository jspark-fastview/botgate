#!/usr/bin/env bash
# 공통 라이브러리 — 각 봇 스크립트에서 source 해서 사용

GW="${GW:-http://localhost:8081}"
COUNT="${COUNT:-10}"

# 색상
GRN="\033[0;32m"; RED="\033[0;31m"; YLW="\033[0;33m"
CYN="\033[0;36m"; MAG="\033[0;35m"; BLD="\033[1m"; DIM="\033[2m"; RST="\033[0m"

# 공통 경로 목록
PATHS=(
  "/articles/2026/04/27/economy-ai"
  "/articles/2026/04/26/tech-llm"
  "/articles/2026/04/25/policy-data"
  "/columns/donga-view-128"
  "/columns/editorial-520"
  "/reports/premium/2026-q1"
  "/reports/premium/2026-q1-finance"
  "/robots.txt"
  "/sitemap.xml"
  "/articles/2026/04/24/sports-ai"
  "/admin/dashboard"
)

# 랜덤 경로 선택
rand_path() {
  echo "${PATHS[$((RANDOM % ${#PATHS[@]}))]}"
}

# 단일 요청 → 결과 출력
# shoot BOT_LABEL UA [IP_OVERRIDE] [EXTRA_CURL_ARGS]
shoot() {
  local label="$1" ua="$2" ip_override="$3" extra_args="$4"
  local path; path=$(rand_path)
  local ip_h=""
  [[ -n "$ip_override" ]] && ip_h="-H \"X-Test-IP: $ip_override\""

  local t0=$(($(date +%s%N)/1000000))
  local status
  status=$(eval curl -s -o /dev/null -w "%{http_code}" \
    -H "\"User-Agent: $ua\"" \
    $ip_h \
    $extra_args \
    "\"$GW$path\"" 2>/dev/null)
  local t1=$(($(date +%s%N)/1000000))
  local ms=$((t1 - t0))

  local result color
  if   [[ "$status" == "200" ]]; then result="PASS ✓";  color="$GRN"
  elif [[ "$status" == "402" ]]; then result="402 PAY";  color="$YLW"
  elif [[ "$status" == "401" ]]; then result="401 UNAUTH"; color="$YLW"
  elif [[ "$status" == "403" ]]; then result="BLOCK ✗";  color="$RED"
  elif [[ "$status" == "429" ]]; then result="429 RATE"; color="$YLW"
  else                                result="$status";  color="$DIM"
  fi

  printf "  ${color}%-8s${RST}  ${DIM}%-42s${RST}  ${color}%s${RST}  ${DIM}%dms${RST}\n" \
    "$status" "$path" "$result" "$ms"

  echo "$status" >> /tmp/bg_counts_$$
}

# 헤더 출력
print_header() {
  local label="$1" color="$2" ua="$3"
  echo -e "\n${BLD}${color}▶  $label${RST}"
  echo -e "   ${DIM}UA: $ua${RST}"
  echo -e "   ${DIM}대상: $GW  /  요청 수: $COUNT${RST}"
  printf "  %-8s  %-42s  %-8s  %s\n" "STATUS" "PATH" "RESULT" "TIME"
  printf "  %s\n" "$(printf '─%.0s' {1..72})"
}

# 요약 출력
print_summary() {
  local label="$1" color="$2"
  local pass=0 block=0 other=0 total=0
  if [[ -f /tmp/bg_counts_$$ ]]; then
    pass=$(grep -c  "^200$" /tmp/bg_counts_$$ 2>/dev/null); pass=${pass:-0}
    block=$(grep -c "^403$" /tmp/bg_counts_$$ 2>/dev/null); block=${block:-0}
    local total_lines; total_lines=$(wc -l < /tmp/bg_counts_$$ | tr -d ' ')
    other=$(( total_lines - pass - block ))
    [[ $other -lt 0 ]] && other=0
    rm -f /tmp/bg_counts_$$
  fi
  total=$((pass + block + other))
  printf "  %s\n" "$(printf '─%.0s' {1..72})"
  echo -e "  ${BLD}${color}$label${RST}  통과 ${GRN}$pass${RST}  차단 ${RED}$block${RST}  기타 ${YLW}$other${RST}  (총 $total)\n"
}
