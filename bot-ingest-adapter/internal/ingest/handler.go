package ingest

import (
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/guardus/bot-ingest-adapter/internal/canonical"
)

// Pusher 는 loki.Client 가 구현 (event 다운스트림 전달).
type Pusher interface {
	Push(canonical.Event)
}

// TokenResolver 는 ingest Bearer 토큰 → owner_id 매핑 (channels.Cache 래핑).
// ok=false 면 미등록 토큰 → 401. 토큰이 채널을 식별하므로 owner_id 는 그 채널 소유자.
type TokenResolver func(token string) (ownerID string, ok bool)

const maxBody = 32 << 20 // 32MB — CDN batch push 대비

// Handler 는 POST /ingest/{cdn} 를 처리한다.
// Bearer 토큰으로 채널 인증 → plugin 변환 → owner 주입 → push.
func Handler(reg *Registry, pusher Pusher, resolveToken TokenResolver) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cdn := r.PathValue("cdn")
		t, ok := reg.Get("cdn:" + cdn)
		if !ok {
			http.Error(w, "unknown cdn: "+cdn, http.StatusNotFound)
			return
		}

		// Bearer 토큰 → 채널 인증 (Logpush custom header: Authorization: Bearer <ingest_token>)
		token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		ownerID, authed := resolveToken(token)
		if !authed {
			http.Error(w, "unauthorized: unknown ingest token", http.StatusUnauthorized)
			return
		}

		raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
		if err != nil {
			http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
			return
		}

		events, err := t.Transform(raw)
		if err != nil {
			slog.Warn("transform failed", "cdn", cdn, "err", err)
			http.Error(w, "transform: "+err.Error(), http.StatusUnprocessableEntity)
			return
		}

		accepted, dropped := 0, 0
		for i := range events {
			e := &events[i]
			e.Source = t.Name()
			e.OwnerID = ownerID // 토큰이 식별한 채널의 소유자
			e.Normalize()
			if err := e.Validate(); err != nil {
				dropped++
				continue
			}
			pusher.Push(*e)
			accepted++
		}

		slog.Info("ingest", "cdn", cdn, "accepted", accepted, "dropped", dropped)
		w.WriteHeader(http.StatusAccepted)
		_, _ = io.WriteString(w, `{"accepted":`+itoa(accepted)+`,"dropped":`+itoa(dropped)+`}`)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
