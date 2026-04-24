# botgate

OpenResty 기반 AI 봇 rDNS 검증 및 필터링 게이트웨이.

AI 크롤러(GPTBot, ClaudeBot 등)가 User-Agent를 사칭하는 가짜 봇을 PTR + forward DNS 이중 검증으로 차단합니다.

## 구조

```
botgate/
├── docker-compose.yml           # dev (포트 8081)
├── docker-compose.prod.yml      # prod (포트 80, Cloudflare realip)
└── openresty/
    ├── nginx.conf
    ├── lua/
    │   ├── rdns.lua             # PTR + forward A 이중 검증 / 1시간 캐시
    │   └── bot_filter.lua       # 악성 UA 차단 → AI봇 rDNS 게이트
    └── conf.d/
        ├── dev/bot.conf         # X-Test-IP 헤더로 rDNS 직접 테스트 가능
        └── prod/bot.conf        # set_real_ip_from (CF IP 대역) + CF-Connecting-IP
```

## 동작 흐름

```
요청 수신
  │
  ├─ 악성 UA (sqlmap, masscan 등) ──────────→ 403
  │
  ├─ AI봇 UA (GPTBot, ClaudeBot 등)
  │     │
  │     ├─ PTR lookup → hostname 패턴 불일치 → 403
  │     ├─ forward A → 원본 IP 불일치 ──────→ 403
  │     └─ 검증 통과 → X-Bot-Verified: 1 → 통과
  │
  └─ 일반 UA ───────────────────────────────→ 통과
```

## 지원 AI 봇

| 봇 | PTR 패턴 |
|---|---|
| GPTBot, ChatGPT-User | `*.openai.com` |
| ClaudeBot, Claude-Web | `*.anthropic.com` |
| Googlebot, Google-Extended | `*.googlebot.com` |
| Applebot | `*.apple.com` |
| PerplexityBot | `*.perplexity.ai` |
| Amazonbot | `*.amazon.com` |
| CCBot | `*.commoncrawl.org` |
| Bytespider | `*.bytedance.com` |

## 실행

### Dev
```bash
docker compose up -d

# rDNS 직접 테스트
curl -H "User-Agent: Googlebot/2.1" \
     -H "X-Test-IP: 66.249.64.1" \
     http://localhost:8081/test/rdns
```

### Prod (Cloudflare 앞단)
```bash
docker compose -f docker-compose.prod.yml up -d
```

prod는 `set_real_ip_from`으로 Cloudflare IP 대역을 신뢰하고, `CF-Connecting-IP` 헤더를 `$remote_addr`로 자동 교체합니다. Lua 코드 변경 없이 rDNS가 봇 실IP 기준으로 동작합니다.

## Roadmap

- [ ] 토큰 기반 AI봇 유료 접근 (402 Payment Required)
- [ ] Elasticsearch 접근 카운팅
- [ ] Kibana 대시보드
