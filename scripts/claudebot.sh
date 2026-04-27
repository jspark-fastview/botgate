#!/usr/bin/env bash
# ClaudeBot (Anthropic) 트래픽 시뮬레이션
# 사용법: COUNT=20 ./claudebot.sh
source "$(dirname "$0")/_lib.sh"

UA="ClaudeBot/1.0 (+https://anthropic.com/claude-web)"
LABEL="ClaudeBot · Anthropic"
COLOR="\033[0;35m"   # magenta

print_header "$LABEL" "$COLOR" "$UA"

EXTRA=""
[[ -n "$TOKEN" ]] && EXTRA="-H \"X-Bot-Token: $TOKEN\""

for ((i=1; i<=COUNT; i++)); do
  shoot "$LABEL" "$UA" "" "$EXTRA" &
done
wait

print_summary "$LABEL" "$COLOR"
