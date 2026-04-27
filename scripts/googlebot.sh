#!/usr/bin/env bash
# Googlebot 트래픽 시뮬레이션
# X-Test-IP로 실제 Googlebot IP를 주입 → rDNS 검증 통과 가능
source "$(dirname "$0")/_lib.sh"

UA="Googlebot/2.1 (+http://www.google.com/bot.html)"
LABEL="Googlebot · Google"
COLOR="\033[0;32m"   # green

# 실제 Googlebot IP (rDNS 통과)
REAL_IPS=(
  "66.249.66.1"
  "66.249.64.1"
  "66.249.68.1"
)
# 가짜 IP (rDNS 실패)
FAKE_IPS=(
  "1.2.3.4"
  "10.0.0.1"
  "192.168.1.100"
)

print_header "$LABEL" "$COLOR" "$UA"

EXTRA=""
[[ -n "$TOKEN" ]] && EXTRA="-H \"X-Bot-Token: $TOKEN\""

# 절반은 실제 IP, 절반은 가짜 IP로 전송
HALF=$((COUNT / 2))

for ((i=1; i<=HALF; i++)); do
  ip="${REAL_IPS[$((RANDOM % ${#REAL_IPS[@]}))]}"
  shoot "$LABEL (real $ip)" "$UA" "$ip" "$EXTRA" &
done

for ((i=1; i<=HALF; i++)); do
  ip="${FAKE_IPS[$((RANDOM % ${#FAKE_IPS[@]}))]}"
  shoot "$LABEL (fake $ip)" "$UA" "$ip" "$EXTRA" &
done

wait

print_summary "$LABEL" "$COLOR"
