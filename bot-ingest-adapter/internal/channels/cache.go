// Package channels 는 admin-api 의 /internal/cdn-channels 를 주기 sync 하여
// ingest_token → channel(domain, owner_id) 매핑을 메모리 캐시한다.
// Logpush 요청의 Bearer 토큰을 이 캐시로 인증·매핑한다 (매 요청 admin-api 호출 회피 = 저지연).
package channels

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// Channel — admin-api /internal/cdn-channels 응답 항목.
type Channel struct {
	Domain          string `json:"domain"`
	DomainCanonical string `json:"domain_canonical"`
	IngestToken     string `json:"ingest_token"`
	OwnerID         string `json:"owner_id"`
}

// Cache — ingest_token → Channel 매핑 (thread-safe, 주기 갱신).
type Cache struct {
	adminURL string
	httpc    *http.Client
	mu       sync.RWMutex
	byToken  map[string]Channel
}

func New(adminURL string) *Cache {
	return &Cache{
		adminURL: adminURL,
		httpc:    &http.Client{Timeout: 5 * time.Second},
		byToken:  map[string]Channel{},
	}
}

// Resolve — ingest token → channel. ok=false 면 미등록(인증 실패).
func (c *Cache) Resolve(token string) (Channel, bool) {
	if token == "" {
		return Channel{}, false
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	ch, ok := c.byToken[token]
	return ch, ok
}

// Count — 캐시된 채널 수 (헬스/로그용).
func (c *Cache) Count() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.byToken)
}

func (c *Cache) sync(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.adminURL+"/internal/cdn-channels", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("admin-api status %d", resp.StatusCode)
	}
	var list []Channel
	if err := json.NewDecoder(resp.Body).Decode(&list); err != nil {
		return err
	}
	m := make(map[string]Channel, len(list))
	for _, ch := range list {
		if ch.IngestToken != "" {
			m[ch.IngestToken] = ch
		}
	}
	c.mu.Lock()
	c.byToken = m
	c.mu.Unlock()
	return nil
}

// Start — 시작 시 1회 + interval 마다 sync. ctx 취소 시 종료.
// 초기 sync 실패해도 죽지 않음 (admin-api 기동 전일 수 있음) — 다음 tick 에 재시도.
func (c *Cache) Start(ctx context.Context, interval time.Duration) {
	if err := c.sync(ctx); err != nil {
		slog.Warn("channel sync 초기 실패 — 재시도 예정", "err", err)
	} else {
		slog.Info("channel sync 초기 완료", "channels", c.Count())
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := c.sync(ctx); err != nil {
				slog.Warn("channel sync 실패", "err", err)
			}
		}
	}
}
