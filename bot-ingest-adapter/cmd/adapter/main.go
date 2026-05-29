// bot-ingest-adapter — CDN-agnostic bot 데이터 변환 gateway.
//
// 모드 A (log ingest): POST /ingest/{cdn} → plugin 변환 → canonical → Loki batch push.
// 모드 B (verify)    : POST /verify       → 정책 판정 → {action} (CDN 이 enforce).
//
// 설계: docs/design/cdn-bot-ingest.md
package main

import (
	"context"
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/guardus/bot-ingest-adapter/internal/config"
	"github.com/guardus/bot-ingest-adapter/internal/ingest"
	"github.com/guardus/bot-ingest-adapter/internal/loki"
	"github.com/guardus/bot-ingest-adapter/internal/verify"
	"github.com/guardus/bot-ingest-adapter/plugins/cloudflare"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Loki batch push client.
	lc := loki.New(cfg.LokiURL, cfg.Namespace)
	go lc.Start(ctx)

	// CDN plugin registry.
	reg := ingest.NewRegistry()
	reg.Register(cloudflare.New()) // 1차 CDN — cdn:cloudflare

	// owner 매핑 — 1차 scaffold stub: 모든 도메인 등록으로 간주(owner 빈값).
	// 후속: admin-api/DB 의 channels 조회 + 캐시.
	resolveOwner := func(domain string) (string, bool) { return "", true }

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})
	mux.HandleFunc("POST /ingest/{cdn}", authIngest(cfg.IngestToken, ingest.Handler(reg, lc, resolveOwner)))
	mux.HandleFunc("POST /verify", verify.Handler(verify.DefaultPolicy(), lc))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("bot-ingest-adapter listening", "port", cfg.Port, "loki", cfg.LokiURL, "plugins", reg.Names())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

// authIngest — POST /ingest/* 의 Bearer 토큰 검증 미들웨어.
// token 이 빈 값이면 인증 비활성 (dev 편의) — prod 는 INGEST_TOKEN 필수.
func authIngest(token string, next http.HandlerFunc) http.HandlerFunc {
	if token == "" {
		slog.Warn("INGEST_TOKEN 미설정 — /ingest 인증 비활성 (dev only)")
		return next
	}
	want := []byte("Bearer " + token)
	return func(w http.ResponseWriter, r *http.Request) {
		got := []byte(r.Header.Get("Authorization"))
		if subtle.ConstantTimeCompare(got, want) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}
