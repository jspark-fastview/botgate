# syntax=docker/dockerfile:1
FROM openresty/openresty:1.25.3.2-alpine
RUN apk add --no-cache curl \
 && mkdir -p /usr/local/openresty/lualib/resty \
 # lua-resty-http (admin-api/internal-api 호출용)
 && for f in http.lua http_headers.lua http_connect.lua; do \
      curl -sL "https://raw.githubusercontent.com/ledgetech/lua-resty-http/v0.17.2/lib/resty/$f" \
           -o "/usr/local/openresty/lualib/resty/$f"; \
    done \
 # nginx-lua-prometheus (메트릭 노출, tag 0.20240525)
 && curl -fsSL "https://raw.githubusercontent.com/knyar/nginx-lua-prometheus/0.20240525/prometheus.lua" \
        -o "/usr/local/openresty/lualib/prometheus.lua" \
 && curl -fsSL "https://raw.githubusercontent.com/knyar/nginx-lua-prometheus/0.20240525/prometheus_keys.lua" \
        -o "/usr/local/openresty/lualib/prometheus_keys.lua" \
 && apk del curl
