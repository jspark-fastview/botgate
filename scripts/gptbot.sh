#!/usr/bin/env bash
# GPTBot (OpenAI) 트래픽 시뮬레이션
# 사용법: COUNT=20 TOKEN=bg_xxx ./gptbot.sh
source "$(dirname "$0")/_lib.sh"

UA="GPTBot/1.2 (+https://openai.com/gptbot)"
LABEL="GPTBot · OpenAI"
COLOR="\033[0;34m"   # blue

print_header "$LABEL" "$COLOR" "$UA"

# TOKEN 환경변수 있으면 헤더 추가
EXTRA=""
[[ -n "$TOKEN" ]] && EXTRA="-H \"X-Bot-Token: $TOKEN\""

for ((i=1; i<=COUNT; i++)); do
  shoot "$LABEL" "$UA" "" "$EXTRA" &
done
wait

print_summary "$LABEL" "$COLOR"
