// bot-ingest-adapter — CDN-agnostic bot 데이터 변환 gateway.
//
// 모드 A (log ingest): POST /ingest/{cdn} → 채널 토큰 인증 → plugin 변환 → canonical → Loki batch push.
// 모드 B (verify)    : POST /verify       → 정책 판정 → {action} (CDN 이 enforce).
//
// 설계: docs/design/cdn-bot-ingest.md
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/guardus/bot-ingest-adapter/internal/channels"
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

	// 채널 ingest_token 캐시 — admin-api /internal/cdn-channels 주기 sync (5분).
	chCache := channels.New(cfg.AdminAPIURL)
	go chCache.Start(ctx, 5*time.Minute)
	// Bearer ingest 토큰 → 채널 소유자. 미등록 토큰이면 ok=false → handler 가 401.
	resolveToken := func(token string) (string, bool) {
		ch, ok := chCache.Resolve(token)
		if !ok {
			return "", false
		}
		return ch.OwnerID, true
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})
	mux.HandleFunc("POST /ingest/{cdn}", ingest.Handler(reg, lc, resolveToken))
	mux.HandleFunc("POST /verify", verify.Handler(verify.DefaultPolicy(), lc))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("bot-ingest-adapter listening", "port", cfg.Port, "loki", cfg.LokiURL, "admin", cfg.AdminAPIURL, "plugins", reg.Names())
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
