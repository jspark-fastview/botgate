// Lua bot_classifier.lua 의 미러본 (admin UI 카탈로그 표시용)
// 두 쪽이 동기화되도록 같이 수정해야 함.
//
// purpose: ai_training | ai_search | ai_assistant | search_engine | seo | social | generic

export const BOTS = [
  // AI Crawler
  { name: 'GPTBot',                vendor: 'OpenAI',       purpose: 'ai_training' },
  { name: 'ClaudeBot',             vendor: 'Anthropic',    purpose: 'ai_training' },
  { name: 'Claude-Web',            vendor: 'Anthropic',    purpose: 'ai_training' },
  { name: 'Anthropic-AI',          vendor: 'Anthropic',    purpose: 'ai_training' },
  { name: 'Meta-ExternalAgent',    vendor: 'Meta',         purpose: 'ai_training' },
  { name: 'Meta-ExternalFetcher',  vendor: 'Meta',         purpose: 'ai_training' },
  { name: 'FacebookBot',           vendor: 'Meta',         purpose: 'ai_training' },
  { name: 'Bytespider',            vendor: 'ByteDance',    purpose: 'ai_training' },
  { name: 'TikTokSpider',          vendor: 'ByteDance',    purpose: 'ai_training' },
  { name: 'Amazonbot',             vendor: 'Amazon',       purpose: 'ai_training' },
  { name: 'CCBot',                 vendor: 'CommonCrawl',  purpose: 'ai_training' },
  { name: 'Google-Extended',       vendor: 'Google',       purpose: 'ai_training' },
  { name: 'Applebot-Extended',     vendor: 'Apple',        purpose: 'ai_training' },
  { name: 'Cohere-AI',             vendor: 'Cohere',       purpose: 'ai_training' },
  { name: 'Diffbot',               vendor: 'Diffbot',      purpose: 'ai_training' },
  { name: 'ImagesiftBot',          vendor: 'Imagesift',    purpose: 'ai_training' },
  { name: 'Omgili',                vendor: 'Webz.io',      purpose: 'ai_training' },
  { name: 'PetalBot',              vendor: 'Huawei',       purpose: 'ai_training' },

  // AI Search
  { name: 'PerplexityBot',         vendor: 'Perplexity',   purpose: 'ai_search' },
  { name: 'OAI-SearchBot',         vendor: 'OpenAI',       purpose: 'ai_search' },
  { name: 'YouBot',                vendor: 'You.com',      purpose: 'ai_search' },

  // AI Assistant
  { name: 'ChatGPT-User',          vendor: 'OpenAI',       purpose: 'ai_assistant' },
  { name: 'Perplexity-User',       vendor: 'Perplexity',   purpose: 'ai_assistant' },
  { name: 'Manus Bot',             vendor: 'Manus',        purpose: 'ai_assistant' },
  { name: 'DuckAssistBot',         vendor: 'DuckDuckGo',   purpose: 'ai_assistant' },

  // Search Engine Crawler
  { name: 'Googlebot',             vendor: 'Google',       purpose: 'search_engine' },
  { name: 'BingBot',               vendor: 'Microsoft',    purpose: 'search_engine' },
  { name: 'Applebot',              vendor: 'Apple',        purpose: 'search_engine' },
  { name: 'Baiduspider',           vendor: 'Baidu',        purpose: 'search_engine' },
  { name: 'YandexBot',             vendor: 'Yandex',       purpose: 'search_engine' },
  { name: 'DuckDuckBot',           vendor: 'DuckDuckGo',   purpose: 'search_engine' },
  { name: 'Yeti',                  vendor: 'Naver',        purpose: 'search_engine' },

  // SEO Crawler
  { name: 'SemrushBot',            vendor: 'Semrush',      purpose: 'seo' },
  { name: 'AhrefsBot',             vendor: 'Ahrefs',       purpose: 'seo' },
  { name: 'MJ12bot',               vendor: 'Majestic',     purpose: 'seo' },
  { name: 'DotBot',                vendor: 'Moz',          purpose: 'seo' },
  { name: 'BLEXBot',               vendor: 'WebMeUp',      purpose: 'seo' },
  { name: 'DataForSEOBot',         vendor: 'DataForSEO',   purpose: 'seo' },
  { name: 'serpstatbot',           vendor: 'Serpstat',     purpose: 'seo' },

  // Social Preview
  { name: 'Slackbot',              vendor: 'Slack',        purpose: 'social' },
  { name: 'Twitterbot',            vendor: 'Twitter/X',    purpose: 'social' },
  { name: 'FacebookExternalHit',   vendor: 'Meta',         purpose: 'social' },
  { name: 'LinkedInBot',           vendor: 'LinkedIn',     purpose: 'social' },
  { name: 'WhatsApp',              vendor: 'Meta',         purpose: 'social' },
  { name: 'TelegramBot',           vendor: 'Telegram',     purpose: 'social' },
  { name: 'Discordbot',            vendor: 'Discord',      purpose: 'social' },
  { name: 'KakaoTalk-scrap',       vendor: 'Kakao',        purpose: 'social' },

  // 광고 / 인프라
  { name: 'AdsTxtCrawler',         vendor: '(다양)',       purpose: 'generic' },
]

export const PURPOSE_META = {
  ai_training:    { label: 'AI Crawler',           desc: '학습 데이터' },
  ai_search:      { label: 'AI Search',            desc: 'RAG 인덱싱' },
  ai_assistant:   { label: 'AI Assistant',         desc: '사용자 트리거 fetch' },
  search_engine:  { label: 'Search Engine Crawler', desc: '전통 검색엔진' },
  seo:            { label: 'SEO Crawler',          desc: '분석 도구' },
  social:         { label: 'Social Preview',       desc: '링크 미리보기' },
  generic:        { label: 'Generic Bot',          desc: '기타' },
}
