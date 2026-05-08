# GuardUs · 운영 런북 (Launch / 비상)

> 메인 채널 launch 이상 발생 시 즉시 참고. 모든 명령은 EC2 SSH 접속 후 실행.

```bash
ssh -i ~/content-ec2.pem ubuntu@13.125.250.55
cd ~/botgate
```

---

## 🚨 시나리오 1 — 채널 자체 문제 (특정 채널만 영향)

### 채널 즉시 비활성화

**옵션 A. SQLite 직접 (가장 빠름, ~1초)**
```bash
sudo sqlite3 /var/lib/docker/volumes/botgate_token-data/_data/botgate.db \
  "UPDATE channels SET active=0 WHERE domain='문제도메인.com';"

# OpenResty 캐시 즉시 무효화
docker exec botgate-openresty-1 wget -qO- http://127.0.0.1/_internal/cache/invalidate
```

**옵션 B. admin-api PATCH**
```bash
ADMIN_KEY=$(grep '^ADMIN_KEY' .env | cut -d= -f2)
CH_ID=ch_xxxxxxxx
curl -X PATCH http://localhost:3002/admin/channels/$CH_ID \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"active":false}'
```

→ 결과: 해당 채널 트래픽이 OpenResty 까지 와도 `no_channel` 응답. backend 보호.

---

## 🚨 시나리오 2 — 봇 필터 자체가 문제 (전 트래픽 영향)

### 긴급 바이패스 — 모든 봇 필터링 OFF, 그대로 통과

```bash
ADMIN_KEY=$(grep '^ADMIN_KEY' .env | cut -d= -f2)
curl -X PATCH http://localhost:3002/admin/settings/bypass_mode \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"value":"1"}'
```

→ 결과: 10초 이내 OpenResty 가 `X-Botgate-Mode: bypass` 헤더 붙이고 즉시 통과. 봇 분류·검증·과금 전부 스킵.

**복구 (필터링 재개)**:
```bash
curl -X PATCH http://localhost:3002/admin/settings/bypass_mode \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"value":"0"}'
```

---

## 🚨 시나리오 3 — admin-api 통신 끊김 (no_channel 폭주)

증상: `{"status":"no_channel"...}` 응답이 다수 발생.

### 1. admin-api 헬스 확인
```bash
curl -sf http://localhost:3002/actuator/health
# → {"status":"UP"} 이면 OK
```

### 2. UP 인데 no_channel 발생 → OpenResty 캐시 강제 갱신
```bash
docker exec botgate-openresty-1 wget -qO- http://127.0.0.1/_internal/cache/invalidate
# → {"ok":true}
```

### 3. admin-api DOWN → 재시작
```bash
docker restart guardus-new-admin-api-1
sleep 15
curl -sf http://localhost:3002/actuator/health
```

### 4. 그래도 안 되면 OpenResty 도 재시작 (last-known-good 캐시 활용)
```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps openresty
```

---

## 🚨 시나리오 4 — 전 서비스 다운 (504 / 502 폭주)

### 컨테이너 상태 확인
```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

### 핵심 컨테이너 한방 재시작
```bash
# 신규 스택 (admin-api 먼저!)
docker compose -p guardus-new -f docker-compose.new-stack.yml --env-file .env up -d
sleep 15

# admin-api 헬스 확인 후 OpenResty
curl -sf http://localhost:3002/actuator/health
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps openresty
```

### EC2 자체가 응답 없으면
AWS 콘솔에서 EC2 인스턴스 reboot. 또는:
```bash
aws ec2 reboot-instances --instance-ids i-04911fa2febe4614a --region ap-northeast-2
```

---

## 🚨 시나리오 5 — 트래픽 폭증 (CPU 90%+)

### 봇 정책 일시적 상향 (모든 verify → block)
모든 미검증 봇 즉시 차단해서 부하 줄이기:
```bash
ADMIN_KEY=$(grep '^ADMIN_KEY' .env | cut -d= -f2)

# 모든 purpose 정책을 block 으로
for p in ai_training ai_search ai_assistant search_engine seo social generic; do
  curl -X PATCH http://localhost:3002/admin/purpose-policies/$p \
    -H "Authorization: Bearer $ADMIN_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"action":"block"}'
done

docker exec botgate-openresty-1 wget -qO- http://127.0.0.1/_internal/cache/invalidate
```

→ 정상 봇도 차단됨. 트래픽 안정화 후 원복.

### 원복 (기본값)
```bash
declare -A defaults=(
  [ai_training]=verify [ai_search]=meter [ai_assistant]=pass
  [search_engine]=pass [seo]=block [social]=pass [generic]=pass
)
for p in "${!defaults[@]}"; do
  curl -X PATCH http://localhost:3002/admin/purpose-policies/$p \
    -H "Authorization: Bearer $ADMIN_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"action\":\"${defaults[$p]}\"}"
done
docker exec botgate-openresty-1 wget -qO- http://127.0.0.1/_internal/cache/invalidate
```

---

## 📊 모니터링

| 도구 | URL | 인증 |
|---|---|---|
| Grafana 대시보드 | https://grafana-guardus.viewus.co | admin / `GRAFANA_ADMIN_PASSWORD` |
| 채널 오너 포털 | https://guardus-fv.viewus.co | 본인 계정 |
| (legacy) 운영자 어드민 | https://botgate-admin.viewus.co | ADMIN_KEY |

### 핵심 대시보드
- `과부하 감시` (5초 갱신) — 황금 시그널 + 자원 + 포화
- `OpenResty (게이트웨이)` — 도메인별 RPS, 봇 검증, UA TOP
- `Bot Traffic` — 카테고리별 분포, 5xx 로그

### 로그 즉시 확인
```bash
# OpenResty 실시간
docker logs -f botgate-openresty-1 --tail 50 | grep -v ELB

# admin-api 에러만
docker logs guardus-new-admin-api-1 --since 10m 2>&1 | grep -iE 'ERROR|WARN'
```

---

## 🔍 진단 체크리스트

장애 발생 시 순서대로 확인:

- [ ] `docker ps` — 모든 컨테이너 UP?
- [ ] `curl http://localhost:3002/actuator/health` — admin-api UP?
- [ ] `curl -H 'Host:pikle.io' http://localhost/ -o/dev/null -w '%{http_code}\n'` — 200/402?
- [ ] Grafana 대시보드 — 5xx, p95, CPU, 메모리 어디가 빨강?
- [ ] `free -h` — 메모리 여유?
- [ ] `df -h /` — 디스크 여유?
- [ ] `docker logs --since 5m` — 어떤 에러?

---

## 📞 연락

- 박지성 (개발) — pjs@fastviewkorea.com
- AWS 계정: 124052247302 (ap-northeast-2)
- EC2 인스턴스 ID: `i-04911fa2febe4614a`
