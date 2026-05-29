// Package verify 는 모드 B (CDN verify) endpoint.
// CDN edge(CF Worker/VCL)가 봇 요청마다 호출 → 화이트리스트/토큰/정책 판정 →
// {action} 반환. CDN 이 결과대로 origin 통과/차단 (콘텐츠는 CDN 제공).
// verify 호출 자체도 canonical event 로 기록 (실시간 enforce + analytics 동시).
//
// 1차 scaffold: 골격만 (정책 stub = allow). 정책 캐시(Redis)/실제 판정은 후속 Phase.
package verify

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/guardus/bot-ingest-adapter/internal/canonical"
)

// Action — verify 판정 결과 (GuardUs 6 action 매핑).
const (
	ActionAllow     = "allow"      // 통과 (화이트리스트 / valid token)
	ActionMeter     = "meter"      // 통과 + 과금
	ActionVerify    = "verify"     // 추가 검증 필요 (rDNS 등)
	ActionTokenOnly = "token_only" // 토큰 있어야 통과
	ActionBlock     = "block"      // 차단
)

// Request — CDN edge → verify.
type Request struct {
	Domain  string `json:"domain"`
	BotUA   string `json:"bot_ua"`
	BotName string `json:"bot_name"`
	IP      string `json:"ip"`
	Path    string `json:"path"`
	Token   string `json:"token"`
}

// Response — verify → CDN edge.
type Response struct {
	Action string `json:"action"`
	Reason string `json:"reason"`
	Billed bool   `json:"billed,omitempty"`
}

// Pusher 는 verify 호출을 canonical event 로 기록 (ingest 와 통합).
type Pusher interface {
	Push(canonical.Event)
}

// Policy 는 판정 로직 (후속: GuardUs DB 정책 + Redis 캐시).
type Policy interface {
	Decide(Request) Response
}

// allowAll 은 scaffold 용 stub 정책 (모두 allow).
type allowAll struct{}

func (allowAll) Decide(Request) Response {
	return Response{Action: ActionAllow, Reason: "scaffold-stub"}
}

// DefaultPolicy 는 정책 미주입 시 fallback.
func DefaultPolicy() Policy { return allowAll{} }

// Handler 는 POST /verify 를 처리한다.
func Handler(pol Policy, pusher Pusher) http.HandlerFunc {
	if pol == nil {
		pol = DefaultPolicy()
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req Request
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
			http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
			return
		}
		if req.Domain == "" {
			http.Error(w, "domain required", http.StatusBadRequest)
			return
		}

		resp := pol.Decide(req)

		// verify 호출 = canonical event 기록 (enforce + analytics 동시).
		if pusher != nil {
			pusher.Push(canonical.Event{
				Source:    "cdn:verify",
				Domain:    req.Domain,
				IP:        req.IP,
				Path:      req.Path,
				BotUA:     req.BotUA,
				BotName:   req.BotName,
				Category:  canonical.CategoryBot,
				Token:     req.Token,
				Blocked:   resp.Action == ActionBlock,
				Billed:    resp.Billed,
				Timestamp: time.Now().UTC(),
			})
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}
