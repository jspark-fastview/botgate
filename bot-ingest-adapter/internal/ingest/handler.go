package ingest

import (
	"io"
	"log/slog"
	"net/http"

	"github.com/guardus/bot-ingest-adapter/internal/canonical"
)

// Pusher 는 loki.Client 가 구현 (event 다운스트림 전달).
type Pusher interface {
	Push(canonical.Event)
}

// OwnerResolver 는 domain → owner_id 매핑 (channels 테이블).
// 1차 scaffold 는 stub(빈 문자열). 후속에 admin-api/DB 조회.
type OwnerResolver func(domain string) (ownerID string, registered bool)

const maxBody = 32 << 20 // 32MB — CDN batch push 대비

// Handler 는 POST /ingest/{cdn} 를 처리한다.
// {cdn} path param 으로 plugin 선택 → raw 변환 → normalize/validate → owner 매핑 → push.
func Handler(reg *Registry, pusher Pusher, resolveOwner OwnerResolver) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cdn := r.PathValue("cdn")
		t, ok := reg.Get("cdn:" + cdn)
		if !ok {
			http.Error(w, "unknown cdn: "+cdn, http.StatusNotFound)
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
			e.Normalize()

			if resolveOwner != nil {
				if owner, registered := resolveOwner(e.Domain); registered {
					e.OwnerID = owner
				} else {
					// 미등록 도메인 — §9 미결정. 현재는 drop + 로그.
					dropped++
					continue
				}
			}
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
