# syntax=docker/dockerfile:1
FROM openresty/openresty:1.25.3.2-alpine
RUN apk add --no-cache curl \
 && mkdir -p /usr/local/openresty/lualib/resty \
 && curl -sL https://raw.githubusercontent.com/ledgetech/lua-resty-http/v0.17.2/lib/resty/http.lua \
         -o /usr/local/openresty/lualib/resty/http.lua \
 && curl -sL https://raw.githubusercontent.com/ledgetech/lua-resty-http/v0.17.2/lib/resty/http_headers.lua \
         -o /usr/local/openresty/lualib/resty/http_headers.lua \
 && apk del curl
