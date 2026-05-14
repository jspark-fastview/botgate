# syntax=docker/dockerfile:1
FROM openresty/openresty:1.25.3.2-alpine
# ca-certificates: HTTPS fetch (lua-resty-http → bot_ip_verifier 가 외부 JSON 가져옴)
RUN apk add --no-cache curl ca-certificates \
 && update-ca-certificates 2>/dev/null || true \
 && mkdir -p /usr/local/openresty/lualib/resty \
 # lua-resty-http (admin-api/internal-api 호출용)
 && for f in http.lua http_headers.lua http_connect.lua; do \
      curl -sL "https://raw.githubusercontent.com/ledgetech/lua-resty-http/v0.17.2/lib/resty/$f" \
           -o "/usr/local/openresty/lualib/resty/$f"; \
    done \
 # nginx-lua-prometheus (메트릭 노출, tag 0.20240525)
 && for f in prometheus.lua prometheus_keys.lua prometheus_resty_counter.lua; do \
      curl -fsSL "https://raw.githubusercontent.com/knyar/nginx-lua-prometheus/0.20240525/$f" \
           -o "/usr/local/openresty/lualib/$f"; \
    done \
 && apk del curl
# ca-certificates 는 런타임에 필요하므로 유지

# Config 파일들을 이미지에 baked.
# EC2 는 docker-compose 가 volume 으로 같은 경로 mount → image 의 파일 override.
# K8s 는 volume mount 없음 → image 의 파일 사용.
COPY nginx.conf       /usr/local/openresty/nginx/conf/nginx.conf
COPY conf.d/dev/      /etc/nginx/conf.d/
COPY lua/             /etc/nginx/lua/
