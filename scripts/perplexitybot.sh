#!/usr/bin/env bash
# PerplexityBot 트래픽 시뮬레이션
source "$(dirname "$0")/_lib.sh"

UA="PerplexityBot/1.0 (+https://perplexity.ai/perplexitybot)"
LABEL="PerplexityBot"
COLOR="\033[0;36m"   # cyan

print_header "$LABEL" "$COLOR" "$UA"

EXTRA=""
[[ -n "$TOKEN" ]] && EXTRA="-H \"X-Bot-Token: $TOKEN\""

for ((i=1; i<=COUNT; i++)); do
  shoot "$LABEL" "$UA" "" "$EXTRA" &
done
wait

print_summary "$LABEL" "$COLOR"
