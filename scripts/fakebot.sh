#!/usr/bin/env bash
# 가짜/악성 봇 트래픽 시뮬레이션 — 전부 403이 나와야 정상
source "$(dirname "$0")/_lib.sh"

LABEL="Fake/Malicious Bots"
COLOR="\033[0;31m"   # red

# 가짜 AI 봇 (UA는 AI봇인 척, IP는 일반 IP)
FAKE_AI_UAS=(
  "GPTBot/1.2 (+https://openai.com/gptbot)"
  "ClaudeBot/1.0 (+https://anthropic.com)"
  "PerplexityBot/1.0 (http://perplexity.ai)"
)

# 노골적 악성 UA
MALICIOUS_UAS=(
  "masscan/1.3 (https://github.com/robertdavidgraham/masscan)"
  "sqlmap/1.7#develop"
  "nikto/2.1.6"
  "zgrab/0.x"
  "python-requests/2.31.0 (scrapy)"
  "Go-http-client/1.1 (exploit)"
)

print_header "$LABEL" "$COLOR" "various malicious UAs"

ALL_UAS=("${FAKE_AI_UAS[@]}" "${MALICIOUS_UAS[@]}")
EACH=$((COUNT / ${#ALL_UAS[@]} + 1))

for ua in "${ALL_UAS[@]}"; do
  for ((i=1; i<=EACH; i++)); do
    shoot "fakebot" "$ua" &
  done
done
wait

print_summary "$LABEL" "$COLOR"
