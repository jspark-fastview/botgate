// Package config 는 환경변수 기반 설정 로드.
package config

import "os"

type Config struct {
	Port    string // HTTP listen port
	LokiURL string // Loki base (push path 는 client 가 붙임). endpoint 변경은 env 로 흡수.
}

func Load() Config {
	return Config{
		Port:    env("PORT", "8090"),
		LokiURL: env("LOKI_URL", "http://loki-gateway.monitoring.svc:80"),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
