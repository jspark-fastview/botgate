// Package loki 는 canonical event 를 Loki 로 batch push 하는 클라이언트.
// 직접 push 방식 (stdout→alloy 아님) — 대량 트래픽 시 adapter KEDA scale 로
// pod 마다 병렬 push. channel buffer + goroutine flush + 재시도/백프레셔.
package loki

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/guardus/bot-ingest-adapter/internal/canonical"
)

// Client 는 Loki push API (/loki/api/v1/push) 로 event 를 batch 전송한다.
type Client struct {
	url        string // LOKI_URL (예: http://loki-gateway.monitoring.svc:80)
	namespace  string // stream label namespace (pod namespace — 환경 격리)
	httpc      *http.Client
	ch         chan canonical.Event
	batchSize  int
	flushEvery time.Duration

	mu      sync.Mutex
	dropped int64 // 버퍼 가득 시 drop 카운트 (백프레셔 가시성)
}

// New 는 push 클라이언트를 만든다. url 은 Loki base (push path 는 내부에서 붙임).
// namespace 는 stream label 값 — pod 실제 namespace 로 dev/prod 격리.
func New(url, namespace string) *Client {
	return &Client{
		url:        url + "/loki/api/v1/push",
		namespace:  namespace,
		httpc:      &http.Client{Timeout: 10 * time.Second},
		ch:         make(chan canonical.Event, 10000), // 버퍼 — burst 흡수
		batchSize:  500,
		flushEvery: 2 * time.Second,
	}
}

// Push 는 event 를 큐에 넣는다 (non-blocking). 버퍼 가득이면 drop + 카운트.
func (c *Client) Push(ev canonical.Event) {
	select {
	case c.ch <- ev:
	default:
		c.mu.Lock()
		c.dropped++
		c.mu.Unlock()
	}
}

// Start 는 flush 루프를 돌린다. ctx 취소 시 남은 배치 flush 후 종료.
func (c *Client) Start(ctx context.Context) {
	batch := make([]canonical.Event, 0, c.batchSize)
	ticker := time.NewTicker(c.flushEvery)
	defer ticker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := c.send(batch); err != nil {
			slog.Error("loki push failed", "err", err, "batch", len(batch))
		}
		batch = batch[:0]
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return
		case ev := <-c.ch:
			batch = append(batch, ev)
			if len(batch) >= c.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// lokiPush 는 Loki push API payload 구조.
type lokiPush struct {
	Streams []lokiStream `json:"streams"`
}
type lokiStream struct {
	Stream map[string]string `json:"stream"` // stream labels
	Values [][2]string       `json:"values"` // [ [ns_ts, line], ... ]
}

// send 는 batch 를 stream label 별로 묶어 Loki 로 POST 한다.
// label = {app, namespace, source, host, category} — admin-api stats selector 호환.
func (c *Client) send(batch []canonical.Event) error {
	byStream := map[string][]canonical.Event{}
	keyOf := func(e canonical.Event) string {
		return e.Source + "\x00" + e.Domain + "\x00" + e.Category
	}
	for _, e := range batch {
		byStream[keyOf(e)] = append(byStream[keyOf(e)], e)
	}

	push := lokiPush{}
	for _, evs := range byStream {
		first := evs[0]
		stream := map[string]string{
			"app":       "bot-ingest",
			"namespace": c.namespace,
			"source":    first.Source,
			"host":      first.Domain,
			"category":  first.Category,
		}
		values := make([][2]string, 0, len(evs))
		for _, e := range evs {
			line, err := json.Marshal(e)
			if err != nil {
				continue
			}
			ts := strconv.FormatInt(e.Timestamp.UnixNano(), 10)
			values = append(values, [2]string{ts, string(line)})
		}
		push.Streams = append(push.Streams, lokiStream{Stream: stream, Values: values})
	}

	body, err := json.Marshal(push)
	if err != nil {
		return err
	}

	// 간단 재시도 (3회, backoff). 영구 실패 시 drop (다음 배치 진행 — 백프레셔).
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := c.httpc.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(attempt+1) * 200 * time.Millisecond)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode/100 == 2 {
			return nil
		}
		lastErr = &httpError{resp.StatusCode}
		time.Sleep(time.Duration(attempt+1) * 200 * time.Millisecond)
	}
	return lastErr
}

// Dropped 는 버퍼 오버플로로 버려진 event 수 (메트릭/헬스용).
func (c *Client) Dropped() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.dropped
}

type httpError struct{ code int }

func (e *httpError) Error() string { return "loki push status " + strconv.Itoa(e.code) }
