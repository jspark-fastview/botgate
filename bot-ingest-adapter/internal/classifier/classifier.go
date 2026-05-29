// Package classifier 는 UA → {category, purpose, name, vendor} 분류를 한다.
//
// openresty/lua/bot_classifier.lua 의 정적 카탈로그를 Go 로 미러링한 것.
// CDN(Cloudflare 등)은 봇 카테고리는 줘도 개별 봇 이름(GPTBot)은 안 주므로,
// inline(openresty)과 동일한 정규화 이름/vendor/purpose 를 얻으려면 같은 규칙이 필요.
//
// ⚠️ 동기화: openresty bot_classifier.lua 의 BOTS/MALICIOUS 가 바뀌면 여기도 갱신.
// (후속: internal-api classify API 공유로 단일 소스화 — 설계 §7)
package classifier

import "strings"

// Result — 분류 결과 (canonical.Event 의 category/purpose/name/vendor 로 매핑).
type Result struct {
	Category string // malicious | bot | other_bot | user
	Purpose  string // malicious | ai_training | ai_search | ai_assistant | search_engine | seo | social | generic | user
	Name     string
	Vendor   string
}

type botDef struct {
	name, vendor, purpose string
	patterns              []string
}

// 악성 봇 / 공격 도구 — 소문자 substring 매칭 (openresty MALICIOUS).
var malicious = []botDef{
	{name: "Nikto", vendor: "Attack", patterns: []string{"nikto"}},
	{name: "SQLMap", vendor: "Attack", patterns: []string{"sqlmap"}},
	{name: "Acunetix", vendor: "Attack", patterns: []string{"acunetix"}},
	{name: "Nessus", vendor: "Attack", patterns: []string{"nessus"}},
	{name: "Nuclei", vendor: "Attack", patterns: []string{"nuclei"}},
	{name: "OpenVAS", vendor: "Attack", patterns: []string{"openvas"}},
	{name: "w3af", vendor: "Attack", patterns: []string{"w3af"}},
	{name: "WPScan", vendor: "Attack", patterns: []string{"wpscan"}},
	{name: "Masscan", vendor: "Attack", patterns: []string{"masscan"}},
	{name: "Zgrab", vendor: "Attack", patterns: []string{"zgrab"}},
	{name: "Nmap", vendor: "Attack", patterns: []string{"nmap scripting", "nmap-scan"}},
	{name: "Scrapy", vendor: "Scraper", patterns: []string{"scrapy"}},
	{name: "HTTrack", vendor: "Scraper", patterns: []string{"httrack"}},
	{name: "Wget", vendor: "Scraper", patterns: []string{"wget/"}},
	{name: "LibWWW-Perl", vendor: "Scraper", patterns: []string{"libwww-perl"}},
	{name: "Python-Requests", vendor: "Library", patterns: []string{"python-requests"}},
	{name: "Python-urllib", vendor: "Library", patterns: []string{"python-urllib"}},
	{name: "Go-Http-Client", vendor: "Library", patterns: []string{"go-http-client"}},
	{name: "Java-Http", vendor: "Library", patterns: []string{"java/1.", "java/2."}},
	{name: "Apache-HttpClient", vendor: "Library", patterns: []string{"apache-httpclient"}},
}

// 봇 정의 — case-sensitive substring 매칭, 위에서부터 우선 (openresty BOTS).
var bots = []botDef{
	// AI Crawler (학습용 / 인덱싱)
	{name: "GPTBot", vendor: "OpenAI", purpose: "ai_training", patterns: []string{"GPTBot"}},
	{name: "ClaudeBot", vendor: "Anthropic", purpose: "ai_training", patterns: []string{"ClaudeBot"}},
	{name: "Claude-Web", vendor: "Anthropic", purpose: "ai_training", patterns: []string{"Claude-Web"}},
	{name: "Anthropic-AI", vendor: "Anthropic", purpose: "ai_training", patterns: []string{"anthropic-ai"}},
	{name: "Meta-ExternalAgent", vendor: "Meta", purpose: "ai_training", patterns: []string{"Meta-ExternalAgent"}},
	{name: "Meta-ExternalFetcher", vendor: "Meta", purpose: "ai_training", patterns: []string{"Meta-ExternalFetcher"}},
	{name: "FacebookBot", vendor: "Meta", purpose: "ai_training", patterns: []string{"FacebookBot"}},
	{name: "Bytespider", vendor: "ByteDance", purpose: "ai_training", patterns: []string{"Bytespider"}},
	{name: "TikTokSpider", vendor: "ByteDance", purpose: "ai_training", patterns: []string{"TikTokSpider"}},
	{name: "Amazonbot", vendor: "Amazon", purpose: "ai_training", patterns: []string{"Amazonbot"}},
	{name: "CCBot", vendor: "CommonCrawl", purpose: "ai_training", patterns: []string{"CCBot"}},
	{name: "Google-Extended", vendor: "Google", purpose: "ai_training", patterns: []string{"Google-Extended"}},
	{name: "Applebot-Extended", vendor: "Apple", purpose: "ai_training", patterns: []string{"Applebot-Extended"}},
	{name: "Cohere-AI", vendor: "Cohere", purpose: "ai_training", patterns: []string{"cohere-ai"}},
	{name: "Diffbot", vendor: "Diffbot", purpose: "ai_training", patterns: []string{"Diffbot"}},
	{name: "ImagesiftBot", vendor: "Imagesift", purpose: "ai_training", patterns: []string{"ImagesiftBot"}},
	{name: "Omgili", vendor: "Webz.io", purpose: "ai_training", patterns: []string{"Omgili", "Omgilibot"}},
	{name: "PetalBot", vendor: "Huawei", purpose: "ai_training", patterns: []string{"PetalBot"}},
	{name: "DeepSeekBot", vendor: "DeepSeek", purpose: "ai_training", patterns: []string{"DeepSeekBot"}},
	{name: "Qwenbot", vendor: "Alibaba", purpose: "ai_training", patterns: []string{"Qwenbot", "Qwen-Bot"}},
	{name: "MistralBot", vendor: "Mistral", purpose: "ai_training", patterns: []string{"MistralBot"}},
	// AI Search (RAG, 인덱싱 후 검색 결과 활용)
	{name: "PerplexityBot", vendor: "Perplexity", purpose: "ai_search", patterns: []string{"PerplexityBot"}},
	{name: "OAI-SearchBot", vendor: "OpenAI", purpose: "ai_search", patterns: []string{"OAI-SearchBot"}},
	{name: "YouBot", vendor: "You.com", purpose: "ai_search", patterns: []string{"YouBot"}},
	{name: "xAI-SearchBot", vendor: "xAI", purpose: "ai_search", patterns: []string{"xAI-SearchBot"}},
	// AI Assistant (사용자 트리거 실시간 fetch)
	{name: "ChatGPT-User", vendor: "OpenAI", purpose: "ai_assistant", patterns: []string{"ChatGPT-User"}},
	{name: "Perplexity-User", vendor: "Perplexity", purpose: "ai_assistant", patterns: []string{"Perplexity-User"}},
	{name: "Manus Bot", vendor: "Manus", purpose: "ai_assistant", patterns: []string{"ManusBot", "Manus Bot"}},
	{name: "DuckAssistBot", vendor: "DuckDuckGo", purpose: "ai_assistant", patterns: []string{"DuckAssistBot"}},
	// Search Engine Crawler
	{name: "Googlebot", vendor: "Google", purpose: "search_engine", patterns: []string{"Googlebot"}},
	{name: "BingBot", vendor: "Microsoft", purpose: "search_engine", patterns: []string{"bingbot", "BingBot"}},
	{name: "Applebot", vendor: "Apple", purpose: "search_engine", patterns: []string{"Applebot"}},
	{name: "Baiduspider", vendor: "Baidu", purpose: "search_engine", patterns: []string{"Baiduspider"}},
	{name: "YandexBot", vendor: "Yandex", purpose: "search_engine", patterns: []string{"YandexBot"}},
	{name: "DuckDuckBot", vendor: "DuckDuckGo", purpose: "search_engine", patterns: []string{"DuckDuckBot"}},
	{name: "Yeti", vendor: "Naver", purpose: "search_engine", patterns: []string{"Yeti"}},
	{name: "Brave SearchBot", vendor: "Brave", purpose: "search_engine", patterns: []string{"Brave SearchBot"}},
	// SEO Crawler
	{name: "SemrushBot", vendor: "Semrush", purpose: "seo", patterns: []string{"SemrushBot"}},
	{name: "AhrefsBot", vendor: "Ahrefs", purpose: "seo", patterns: []string{"AhrefsBot"}},
	{name: "MJ12bot", vendor: "Majestic", purpose: "seo", patterns: []string{"MJ12bot"}},
	{name: "DotBot", vendor: "Moz", purpose: "seo", patterns: []string{"DotBot"}},
	{name: "BLEXBot", vendor: "WebMeUp", purpose: "seo", patterns: []string{"BLEXBot"}},
	{name: "DataForSEOBot", vendor: "DataForSEO", purpose: "seo", patterns: []string{"DataForSeoBot"}},
	{name: "serpstatbot", vendor: "Serpstat", purpose: "seo", patterns: []string{"serpstatbot"}},
	{name: "Screaming Frog", vendor: "Screaming Frog", purpose: "seo", patterns: []string{"Screaming Frog SEO Spider"}},
	// Social Preview
	{name: "Slackbot", vendor: "Slack", purpose: "social", patterns: []string{"Slackbot"}},
	{name: "Twitterbot", vendor: "Twitter/X", purpose: "social", patterns: []string{"Twitterbot"}},
	{name: "FacebookExternalHit", vendor: "Meta", purpose: "social", patterns: []string{"facebookexternalhit"}},
	{name: "LinkedInBot", vendor: "LinkedIn", purpose: "social", patterns: []string{"LinkedInBot"}},
	{name: "WhatsApp", vendor: "Meta", purpose: "social", patterns: []string{"WhatsApp"}},
	{name: "TelegramBot", vendor: "Telegram", purpose: "social", patterns: []string{"TelegramBot"}},
	{name: "Discordbot", vendor: "Discord", purpose: "social", patterns: []string{"Discordbot"}},
	{name: "KakaoTalk-scrap", vendor: "Kakao", purpose: "social", patterns: []string{"kakaotalk-scrap", "kakaostory-scrap"}},
	{name: "Pinterestbot", vendor: "Pinterest", purpose: "social", patterns: []string{"Pinterest"}},
	// 광고 / 인프라
	{name: "AdsTxtCrawler", vendor: "(다양)", purpose: "generic", patterns: []string{"ads.txt", "sellers.json"}},
}

// 미등록 봇 휴리스틱 (위 매칭 실패 시) — 소문자 substring.
var otherBotPatterns = []string{
	"bot/", "bot ", "crawl", "spider", "slurp", "archive.org", "indexer", "scraper",
}

func isAIPurpose(p string) bool {
	return p == "ai_training" || p == "ai_search" || p == "ai_assistant"
}

// Classify 는 openresty bot_classifier.lua 의 classify() 와 동일 규칙.
//   - malicious/other_bot 패턴: 소문자 매칭
//   - bots 패턴: case-sensitive 매칭 (UA 의 정확한 토큰 보존)
func Classify(ua string) Result {
	if ua == "" {
		return Result{Category: "malicious", Purpose: "malicious", Name: "(empty UA)", Vendor: "Unknown"}
	}
	uaLower := strings.ToLower(ua)

	// 1. 악성 봇 / 공격 도구
	for _, b := range malicious {
		for _, p := range b.patterns {
			if strings.Contains(uaLower, p) {
				return Result{Category: "malicious", Purpose: "malicious", Name: b.name, Vendor: b.vendor}
			}
		}
	}
	// 2. 알려진 봇
	for _, b := range bots {
		for _, p := range b.patterns {
			if strings.Contains(ua, p) {
				cat := "other_bot"
				if isAIPurpose(b.purpose) {
					cat = "bot"
				}
				return Result{Category: cat, Purpose: b.purpose, Name: b.name, Vendor: b.vendor}
			}
		}
	}
	// 3. 미등록 봇 휴리스틱
	for _, p := range otherBotPatterns {
		if strings.Contains(uaLower, p) {
			return Result{Category: "other_bot", Purpose: "generic", Name: "Unknown Bot", Vendor: ""}
		}
	}
	// 4. 사용자
	return Result{Category: "user", Purpose: "user", Name: "", Vendor: ""}
}
