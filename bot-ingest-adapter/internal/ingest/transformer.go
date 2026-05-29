// Package ingest 는 CDN raw payload 수신 + plugin 변환 + 다운스트림 전달을 담당한다.
package ingest

import (
	"fmt"
	"sync"

	"github.com/guardus/bot-ingest-adapter/internal/canonical"
)

// Transformer 는 CDN별 plugin 인터페이스.
// 각 CDN 의 raw payload 를 canonical event 슬라이스로 변환한다.
// (CDN plugin 은 1차 CDN 확정 후 plugins/ 에 구현)
type Transformer interface {
	// Name 은 source label 값 (예: "cdn:cloudflare").
	Name() string
	// Transform 은 한 번의 push payload 를 0개 이상의 canonical event 로 변환한다.
	// CDN 의 batch(여러 줄 NDJSON 등)도 처리.
	Transform(raw []byte) ([]canonical.Event, error)
}

// Registry 는 CDN 이름 → Transformer 매핑 (thread-safe).
type Registry struct {
	mu sync.RWMutex
	m  map[string]Transformer
}

func NewRegistry() *Registry {
	return &Registry{m: make(map[string]Transformer)}
}

// Register 는 CDN plugin 을 등록한다 (main 에서 1회).
func (r *Registry) Register(t Transformer) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.m[t.Name()] = t
}

// Get 은 CDN 이름(path param)으로 Transformer 를 찾는다.
func (r *Registry) Get(name string) (Transformer, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.m[name]
	return t, ok
}

// Names 는 등록된 CDN 목록 (헬스/디버그용).
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.m))
	for k := range r.m {
		names = append(names, k)
	}
	return names
}

func (r *Registry) String() string { return fmt.Sprintf("registry(%v)", r.Names()) }
