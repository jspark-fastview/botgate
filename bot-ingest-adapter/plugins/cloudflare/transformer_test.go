package cloudflare

import (
	"bytes"
	"compress/gzip"
	"testing"
)

func TestTransform_GPTBot(t *testing.T) {
	raw := []byte(`{"ClientRequestHost":"viewus.co","ClientIP":"1.2.3.4","ClientRequestPath":"/article","ClientRequestUserAgent":"Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)","VerifiedBotCategory":"AI Crawler","EdgeStartTimestamp":"2026-05-29T09:00:00Z","RayID":"abc123"}`)
	evs, err := New().Transform(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("want 1 event, got %d", len(evs))
	}
	e := evs[0]
	checks := map[string][2]string{
		"domain":   {e.Domain, "viewus.co"},
		"ip":       {e.IP, "1.2.3.4"},
		"path":     {e.Path, "/article"},
		"bot_name": {e.BotName, "GPTBot"},
		"vendor":   {e.BotVendor, "OpenAI"},
		"purpose":  {e.BotPurpose, "ai_training"},
		"category": {e.Category, "bot"},
		"rayid":    {e.CDNRequestID, "abc123"},
		"raw_cat":  {e.CDNRawCategory, "AI Crawler"},
	}
	for field, v := range checks {
		if v[0] != v[1] {
			t.Errorf("%s = %q, want %q", field, v[0], v[1])
		}
	}
	if !e.Verified {
		t.Error("verified should be true (VerifiedBotCategory set)")
	}
	if e.Timestamp.IsZero() {
		t.Error("timestamp should be parsed from EdgeStartTimestamp")
	}
}

func TestTransform_Googlebot_OtherBot(t *testing.T) {
	// search_engine purpose → category=other_bot (openresty 규칙)
	raw := []byte(`{"ClientRequestHost":"a.com","ClientRequestUserAgent":"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)","VerifiedBotCategory":"Search Engine Crawler"}`)
	evs, _ := New().Transform(raw)
	if len(evs) != 1 {
		t.Fatalf("want 1, got %d", len(evs))
	}
	e := evs[0]
	if e.BotName != "Googlebot" || e.BotPurpose != "search_engine" || e.Category != "other_bot" {
		t.Errorf("got name=%q purpose=%q category=%q", e.BotName, e.BotPurpose, e.Category)
	}
}

func TestTransform_CategoryFallback(t *testing.T) {
	// classifier 미등록 UA + Cloudflare 가 AI Crawler 로 분류 → 카테고리로 purpose 보강
	raw := []byte(`{"ClientRequestHost":"a.com","ClientRequestUserAgent":"Acme/1.0","VerifiedBotCategory":"AI Crawler"}`)
	evs, _ := New().Transform(raw)
	e := evs[0]
	if e.BotPurpose != "ai_training" || e.Category != "bot" {
		t.Errorf("fallback failed: purpose=%q category=%q", e.BotPurpose, e.Category)
	}
	if e.BotName != "" {
		t.Errorf("bot_name should stay empty (CF gives no name, classifier unknown), got %q", e.BotName)
	}
}

func TestTransform_Gzip(t *testing.T) {
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, _ = zw.Write([]byte(`{"ClientRequestHost":"a.com","ClientRequestUserAgent":"ClaudeBot/1.0"}` + "\n"))
	_ = zw.Close()
	evs, err := New().Transform(buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].BotName != "ClaudeBot" {
		t.Fatalf("gzip parse failed: %+v", evs)
	}
}

func TestTransform_UnixNanoTimestamp(t *testing.T) {
	raw := []byte(`{"ClientRequestHost":"a.com","ClientRequestUserAgent":"GPTBot","EdgeStartTimestamp":1764406800000000000}`)
	evs, _ := New().Transform(raw)
	if evs[0].Timestamp.IsZero() {
		t.Error("unix nano timestamp not parsed")
	}
	if y := evs[0].Timestamp.Year(); y != 2025 {
		t.Errorf("unix nano parsed to wrong year: %d", y)
	}
}

func TestTransform_BatchSkipsBrokenLine(t *testing.T) {
	raw := []byte("{\"ClientRequestHost\":\"a.com\",\"ClientRequestUserAgent\":\"GPTBot\"}\n{bad json\n{\"ClientRequestHost\":\"b.com\",\"ClientRequestUserAgent\":\"ClaudeBot\"}")
	evs, err := New().Transform(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 2 {
		t.Fatalf("broken line should be skipped, want 2 events got %d", len(evs))
	}
}

func TestTransform_ValidationPayload(t *testing.T) {
	// Cloudflare destination 검증 시 보내는 {"content":"tests"} — domain 없음 → handler 가 drop
	raw := []byte(`{"content":"tests"}`)
	evs, err := New().Transform(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].Domain != "" {
		t.Errorf("validation payload should yield empty-domain event (dropped downstream), got %+v", evs)
	}
}
