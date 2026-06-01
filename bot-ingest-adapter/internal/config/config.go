// Package config 는 환경변수 기반 설정 로드.
package config

import "os"

type Config struct {
	Port    string // HTTP listen port
	LokiURL string // Loki base (push path 는 client 가 붙임). endpoint 변경은 env 로 흡수.
	// Namespace — Loki stream label namespace 값. pod 의 실제 namespace(POD_NAMESPACE
	// downward API)로 주입 → dev=guardus-dev / prod=guardus 환경 격리 (inline openresty 와 동일).
	Namespace string
	// AdminAPIURL — admin-api internal (channel/ingest_token sync). 같은 namespace svc 단축명.
	AdminAPIURL string
}

func Load() Config {
	return Config{
		Port:        env("PORT", "8090"),
		LokiURL:     env("LOKI_URL", "http://loki-gateway.monitoring.svc:80"),
		Namespace:   env("POD_NAMESPACE", "guardus"),
		AdminAPIURL: env("ADMIN_API_URL", "http://admin-api:3002"),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
