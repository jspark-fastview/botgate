# bot-ingest-adapter — multi-stage, arm64(t4g) distroless static.
# 빌드 캐시: go.mod 먼저 (의존성 없어 빠름), 그 다음 소스.

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
# go.sum 은 외부 의존성 생기면 추가 (현재 stdlib only)
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 GOARCH=arm64 GOOS=linux go build -trimpath -ldflags="-s -w" -o /adapter ./cmd/adapter

# distroless static — shell 없음, 최소 공격면, ~15MB.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /adapter /adapter
EXPOSE 8090
USER nonroot:nonroot
ENTRYPOINT ["/adapter"]
