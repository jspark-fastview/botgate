// Package cloudflare 는 Cloudflare Logpush(HTTP destination) → canonical 변환 plugin.
//
// 입력: Cloudflare Logpush HTTP — 항상 gzip 된 NDJSON (한 줄 = http_requests 1건).
//
//	필드 스펙: https://developers.cloudflare.com/logs/reference/log-fields/zone/http_requests/
//	봇 필드(BotScore/VerifiedBotCategory/BotTags)는 Bot Management(Enterprise) 전용 —
//	무료/Pro 채널은 안 옴 → UA classifier 로만 분류 (품질↓).
//
// Cloudflare 는 봇 "카테고리"(VerifiedBotCategory)는 줘도 개별 봇 "이름"(GPTBot)은 안 줌.
//
//	→ bot_name/vendor 는 classifier(openresty 미러)의 UA 매칭으로 채움.
//	→ UA 매칭 실패 시에만 VerifiedBotCategory 로 purpose 보강.
package cloudflare

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/guardus/bot-ingest-adapter/internal/canonical"
	"github.com/guardus/bot-ingest-adapter/internal/classifier"
)

// Transformer 는 ingest.Transformer 구현.
type Transformer struct{}

func New() *Transformer { return &Transformer{} }

func (t *Transformer) Name() string { return "cdn:cloudflare" }

// cfLog — Cloudflare Logpush http_requests 의 부분 스키마 (필요 필드만).
type cfLog struct {
	ClientIP               string          `json:"ClientIP"`
	ClientRequestHost      string          `json:"ClientRequestHost"`
	ClientRequestPath      string          `json:"ClientRequestPath"`
	ClientRequestUserAgent string          `json:"ClientRequestUserAgent"`
	EdgeStartTimestamp     json.RawMessage `json:"EdgeStartTimestamp"` // RFC3339 string OR unix nano int
	VerifiedBotCategory    string          `json:"VerifiedBotCategory"`
	RayID                  string          `json:"RayID"` // dedup key 후보
}

// VerifiedBotCategory → GuardUs purpose (UA 매칭 실패 시 fallback).
// 출처: https://developers.cloudflare.com/bots/concepts/bot/verified-bots/ (16 카테고리)
var catToPurpose = map[string]string{
	"AI Crawler":                 canonical.PurposeAITraining,
	"AI Assistant":               canonical.PurposeAIAssistant,
	"AI Search":                  canonical.PurposeAISearch,
	"Search Engine Crawler":      canonical.PurposeSearchEngine,
	"Search Engine Optimization": canonical.PurposeSEO,
	"Social Media Marketing":     canonical.PurposeSocial,
	"Page Preview":               canonical.PurposeSocial,
}

// Transform 은 gzip(또는 평문) NDJSON batch 를 canonical event 슬라이스로 변환한다.
// batch 내 한 줄이 깨져도 나머지는 살린다 (CDN at-least-once batch 견고성).
func (t *Transformer) Transform(raw []byte) ([]canonical.Event, error) {
	data, err := maybeGunzip(raw)
	if err != nil {
		return nil, err
	}

	var events []canonical.Event
	sc := bufio.NewScanner(bytes.NewReader(data))
	sc.Buffer(make([]byte, 0, 64*1024), 8<<20) // 긴 라인(8MB) 허용
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		var l cfLog
		if err := json.Unmarshal(line, &l); err != nil {
			continue // 깨진 라인 skip
		}
		events = append(events, mapEvent(l))
	}
	if err := sc.Err(); err != nil {
		return events, err
	}
	return events, nil
}

// mapEvent — cfLog → canonical.Event.
func mapEvent(l cfLog) canonical.Event {
	cls := classifier.Classify(l.ClientRequestUserAgent)

	// UA 로 봇 식별 실패(user/Unknown) 시 Cloudflare 카테고리로 purpose/category 보강.
	if cls.Name == "" || cls.Name == "Unknown Bot" {
		if p, ok := catToPurpose[l.VerifiedBotCategory]; ok {
			cls.Purpose = p
			if p == canonical.PurposeAITraining || p == canonical.PurposeAISearch || p == canonical.PurposeAIAssistant {
				cls.Category = canonical.CategoryBot
			} else {
				cls.Category = canonical.CategoryOtherBot
			}
		}
	}

	return canonical.Event{
		Domain:         l.ClientRequestHost,
		IP:             l.ClientIP,
		Path:           l.ClientRequestPath,
		BotUA:          l.ClientRequestUserAgent,
		BotName:        cls.Name,
		BotVendor:      cls.Vendor,
		Category:       cls.Category,
		BotPurpose:     cls.Purpose,
		Verified:       l.VerifiedBotCategory != "", // Cloudflare 가 verified bot 으로 식별
		CDNRequestID:   l.RayID,
		CDNRawCategory: l.VerifiedBotCategory,
		Timestamp:      parseTS(l.EdgeStartTimestamp),
	}
}

// parseTS — EdgeStartTimestamp 는 Logpush 설정에 따라 RFC3339 문자열 또는 unix nano 정수.
func parseTS(raw json.RawMessage) time.Time {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return time.Time{} // Normalize() 가 now 로 채움
	}
	if s[0] == '"' { // RFC3339 문자열
		var str string
		if json.Unmarshal(raw, &str) == nil {
			if ts, err := time.Parse(time.RFC3339Nano, str); err == nil {
				return ts.UTC()
			}
		}
		return time.Time{}
	}
	// 정수 — unix nano (19자리) 또는 sec
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		if n > 1e15 {
			return time.Unix(0, n).UTC()
		}
		return time.Unix(n, 0).UTC()
	}
	return time.Time{}
}

// maybeGunzip — Cloudflare Logpush 는 항상 gzip. magic byte(0x1f 0x8b)로 감지.
// 평문(테스트/Worker push)도 통과.
func maybeGunzip(raw []byte) ([]byte, error) {
	if len(raw) >= 2 && raw[0] == 0x1f && raw[1] == 0x8b {
		zr, err := gzip.NewReader(bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		defer zr.Close()
		return io.ReadAll(zr)
	}
	return raw, nil
}
