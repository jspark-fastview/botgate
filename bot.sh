#!/usr/bin/env bash
# ============================================================
#  botgate — 봇 트래픽 시뮬레이터
#
#  사용법:
#    ./bot.sh <봇> [횟수] [토큰]
#
#  봇 이름:
#    gpt / claude / perplexity / google / fake / all
#
#  예시:
#    ./bot.sh claude           # 토큰 자동 발급 → 통과 케이스 포함
#    ./bot.sh gpt 30           # 30개
#    ./bot.sh all 20           # 전체 동시 발사
#    ./bot.sh gpt 20 none      # 토큰 없이 (402 케이스만)
#    ./bot.sh claude 15 bg_xx  # 직접 토큰 지정
#    GW=http://prod ./bot.sh all 100
# ============================================================

set -euo pipefail

BOT="${1:-}"
COUNT="${2:-10}"
TOKEN_ARG="${3:-}"   # 'none' 이면 토큰 없이, 빈값이면 자동 발급

export GW="${GW:-http://localhost:8081}"
export API_URL="${API_URL:-http://localhost:3000}"
export COUNT

GRN="\033[0;32m"; RED="\033[0;31m"; YLW="\033[0;33m"
CYN="\033[0;36m"; BLD="\033[1m"; DIM="\033[2m"; RST="\033[0m"

SCRIPTS_DIR="$(dirname "$0")/scripts"
_TEMP_TOKEN=""   # 이 스크립트가 발급한 임시 토큰

# ── 토큰 자동 관리 ────────────────────────────────────────
auto_token() {
  # 'none' 이면 토큰 없이 실행
  if [[ "${TOKEN_ARG}" == "none" ]]; then
    export TOKEN=""
    echo -e "  ${YLW}토큰 없음${RST} — 402/403 케이스 확인 모드"
    return
  fi

  # 직접 지정된 토큰
  if [[ -n "${TOKEN_ARG}" && "${TOKEN_ARG}" != "none" ]]; then
    export TOKEN="${TOKEN_ARG}"
    echo -e "  ${CYN}토큰 지정됨${RST} — ${TOKEN:0:20}..."
    return
  fi

  # 자동: 기존 활성 토큰 재사용
  local existing
  existing=$(curl -s "${API_URL}/admin/tokens" 2>/dev/null \
    | python3 -c "
import sys,json
toks=[t for t in json.load(sys.stdin) if t['active'] and t['owner'].startswith('bot-test')]
print(toks[0]['token'] if toks else '')
" 2>/dev/null || echo "")

  if [[ -n "$existing" ]]; then
    export TOKEN="$existing"
    echo -e "  ${GRN}기존 토큰 재사용${RST} — ${TOKEN:0:20}..."
    return
  fi

  # 자동: 임시 토큰 신규 발급
  local resp
  resp=$(curl -s -X POST "${API_URL}/admin/tokens" \
    -H "Content-Type: application/json" \
    -d '{"owner":"bot-test-auto","plan":"paid"}' 2>/dev/null)
  local tok
  tok=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
  local tid
  tid=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

  if [[ -n "$tok" ]]; then
    export TOKEN="$tok"
    _TEMP_TOKEN="$tid"
    echo -e "  ${GRN}임시 토큰 발급${RST} — ${TOKEN:0:20}... ${DIM}(종료 후 자동 삭제)${RST}"
  else
    export TOKEN=""
    echo -e "  ${YLW}토큰 발급 실패${RST} — 토큰 없이 실행"
  fi
}

# 임시 토큰 정리
cleanup() {
  if [[ -n "$_TEMP_TOKEN" ]]; then
    curl -s -X DELETE "${API_URL}/admin/tokens/${_TEMP_TOKEN}" > /dev/null 2>&1 || true
    echo -e "\n  ${DIM}임시 토큰 삭제 완료${RST}"
  fi
}
trap cleanup EXIT

# ── 도움말 ────────────────────────────────────────────────
usage() {
  echo -e "${BLD}사용법:${RST}  ./bot.sh <봇> [횟수] [토큰]"
  echo ""
  echo -e "${BLD}봇 이름:${RST}"
  echo -e "  ${CYN}gpt${RST}         GPTBot · OpenAI"
  echo -e "  ${CYN}claude${RST}      ClaudeBot · Anthropic"
  echo -e "  ${CYN}perplexity${RST}  PerplexityBot"
  echo -e "  ${CYN}google${RST}      Googlebot (실제 IP 혼합)"
  echo -e "  ${CYN}fake${RST}        가짜 봇 + 악성 UA"
  echo -e "  ${CYN}all${RST}         전체 동시 발사"
  echo ""
  echo -e "${BLD}토큰 옵션:${RST}"
  echo -e "  ${DIM}(생략)${RST}      토큰 자동 발급 → 통과 케이스 포함"
  echo -e "  ${DIM}none${RST}        토큰 없이 실행 → 402/403 케이스만"
  echo -e "  ${DIM}bg_xxx${RST}      직접 토큰 지정"
  echo ""
  echo -e "${BLD}예시:${RST}"
  echo -e "  ./bot.sh claude"
  echo -e "  ./bot.sh gpt 30"
  echo -e "  ./bot.sh all 20"
  echo -e "  ./bot.sh gpt 20 none"
  echo -e "  ./bot.sh claude 15 bg_xxxxx"
  echo -e "  GW=http://prod.example.com ./bot.sh all 100"
  exit 0
}

run() {
  local script="$SCRIPTS_DIR/$1"
  [[ ! -f "$script" ]] && { echo -e "${RED}스크립트 없음: $script${RST}"; exit 1; }
  bash "$script"
}

# ── 실행 ──────────────────────────────────────────────────
case "${BOT,,}" in
  gpt|gptbot|claude|claudebot|perplexity|perplexitybot|google|googlebot|fake|fakebot|bad|all|fire)
    echo -e "\n${BLD}${CYN}botgate / bot.sh${RST}  — ${BOT} × ${COUNT}  →  ${GW}"
    # fake/all 은 토큰 처리
    if [[ "${BOT,,}" != "fake" && "${BOT,,}" != "fakebot" && "${BOT,,}" != "bad" ]]; then
      auto_token
    else
      export TOKEN=""
    fi
    echo ""
    case "${BOT,,}" in
      gpt|gptbot)               run gptbot.sh ;;
      claude|claudebot)         run claudebot.sh ;;
      perplexity|perplexitybot) run perplexitybot.sh ;;
      google|googlebot)         run googlebot.sh ;;
      fake|fakebot|bad)         run fakebot.sh ;;
      all|fire)                 run fire-all.sh ;;
    esac
    ;;
  help|-h|--help|"") usage ;;
  *)
    echo -e "${RED}알 수 없는 봇: '${BOT}'${RST}"
    echo -e "사용 가능: gpt  claude  perplexity  google  fake  all"
    exit 1 ;;
esac
