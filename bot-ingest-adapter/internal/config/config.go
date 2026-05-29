// Package config 는 환경변수 기반 설정 로드.
package config

import "os"

type Config struct {
	Port    string // HTTP listen port
	LokiURL string // Loki base (push path 는 client 가 붙임). endpoint 변경은 env 로 흡수.
	// IngestToken — POST /ingest/* 의 Bearer 토큰. CDN(Logpush header_Authorization) 이 보냄.
	// 빈 값이면 인증 skip (dev 편의) — prod 는 반드시 설정.
	IngestToken string
}

func Load() Config {
	return Config{
		Port:        env("PORT", "8090"),
		LokiURL:     env("LOKI_URL", "http://loki-gateway.monitoring.svc:80"),
		IngestToken: env("INGEST_TOKEN", ""),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
