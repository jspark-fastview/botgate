// Package canonical 은 GuardUs 의 표준 bot event 모델을 정의한다.
// 모든 CDN 의 제각각 형태(Cloudflare Logpush / Fastly log / CDNetworks …)는
// adapter(gateway)에서 이 단일 형태로 변환된다 → 뒷단(Loki/UI/과금)은 CDN 을 모른다.
//
// 필드는 admin-api 의 access_logs 테이블 + Loki JSON access log 와 동일하게 맞춤
// (기존 stats/과금 파이프라인 재사용). source / owner_id / cdn_* 만 ingest 확장.
package canonical

import "time"

// Category — 4-way 봇 분류.
const (
	CategoryUser      = "user"
	CategoryBot       = "bot"
	CategoryOtherBot  = "other_bot"
	CategoryMalicious = "malicious"
)

// Purpose — 7 purpose.
const (
	PurposeAITraining   = "ai_training"
	PurposeAISearch     = "ai_search"
	PurposeAIAssistant  = "ai_assistant"
	PurposeSearchEngine = "search_engine"
	PurposeSEO          = "seo"
	PurposeSocial       = "social"
	PurposeGeneric      = "generic"
)

// Event 는 GuardUs canonical bot event.
// JSON 태그는 OpenResty access log / access_logs 컬럼과 일치 → Loki query 호환.
type Event struct {
	// ── ingest 확장 ──
	Source         string `json:"source"`                     // inline | cdn:cloudflare | cdn:fastly …
	OwnerID        string `json:"owner_id,omitempty"`         // channels.owner_id (domain 매핑)
	CDNRequestID   string `json:"cdn_request_id,omitempty"`   // 중복 제거 key
	CDNRawCategory string `json:"cdn_raw_category,omitempty"` // 원본 분류 보존 (재매핑/디버깅)

	// ── canonical (access_logs 와 동일) ──
	Domain          string `json:"domain"`
	DomainCanonical string `json:"domain_canonical,omitempty"`
	IP              string `json:"ip"`
	Path            string `json:"path,omitempty"`
	BotUA           string `json:"bot_ua"`
	BotName         string `json:"bot_name,omitempty"`
	BotVendor       string `json:"bot_vendor,omitempty"`
	Category        string `json:"category"`    // 4-way
	BotPurpose      string `json:"bot_purpose"` // 7 purpose
	Verified        bool   `json:"verified"`
	Billed          bool   `json:"billed"`
	Blocked         bool   `json:"blocked"`
	Token           string `json:"token,omitempty"`

	Timestamp time.Time `json:"ts"`
}

var validCategory = map[string]bool{
	CategoryUser: true, CategoryBot: true, CategoryOtherBot: true, CategoryMalicious: true,
}

// Normalize 는 빠진 필드에 안전한 기본값을 채우고 카테고리를 검증한다.
// 변환기(plugin)가 매핑을 누락해도 파이프라인이 깨지지 않게 한다.
func (e *Event) Normalize() {
	if !validCategory[e.Category] {
		e.Category = CategoryBot // fallback
	}
	if e.BotPurpose == "" {
		e.BotPurpose = PurposeGeneric
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
}

// Validate 는 필수 필드를 확인한다 (변환 후 ingest 전).
func (e *Event) Validate() error {
	if e.Domain == "" {
		return errMissing("domain")
	}
	if e.Source == "" {
		return errMissing("source")
	}
	return nil
}

type errMissing string

func (e errMissing) Error() string { return "canonical: missing required field: " + string(e) }
