# syntax=docker/dockerfile:1
FROM openresty/openresty:1.25.3.2-alpine
RUN apk add --no-cache curl \
 && mkdir -p /usr/local/openresty/lualib/resty \
 && for f in http.lua http_headers.lua http_connect.lua; do \
      curl -sL "https://raw.githubusercontent.com/ledgetech/lua-resty-http/v0.17.2/lib/resty/$f" \
           -o "/usr/local/openresty/lualib/resty/$f"; \
    done \
 && apk del curl
