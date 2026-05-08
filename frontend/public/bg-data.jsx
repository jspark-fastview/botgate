// Shared data for botgate v2 — AI bot toll gate
// Positioning: publishers charge AI companies for crawl access via JWT.
// Two personas: PUBLISHER (owner of content, earns $$) and BUYER (AI company, pays).

const BOTS = [
  { id: 'gptbot',       ua: 'GPTBot',          vendor: 'OpenAI',       ptr: '*.openai.com',       color: 'oklch(0.78 0.14 160)' },
  { id: 'chatgpt',      ua: 'ChatGPT-User',    vendor: 'OpenAI',       ptr: '*.openai.com',       color: 'oklch(0.78 0.14 160)' },
  { id: 'claudebot',    ua: 'ClaudeBot',       vendor: 'Anthropic',    ptr: '*.anthropic.com',    color: 'oklch(0.78 0.14 40)'  },
  { id: 'claudeweb',    ua: 'Claude-Web',      vendor: 'Anthropic',    ptr: '*.anthropic.com',    color: 'oklch(0.78 0.14 40)'  },
  { id: 'googlebot',    ua: 'Googlebot',       vendor: 'Google',       ptr: '*.googlebot.com',    color: 'oklch(0.80 0.16 250)' },
  { id: 'googleext',    ua: 'Google-Extended', vendor: 'Google',       ptr: '*.googlebot.com',    color: 'oklch(0.80 0.16 250)' },
  { id: 'applebot',     ua: 'Applebot',        vendor: 'Apple',        ptr: '*.apple.com',        color: 'oklch(0.74 0.02 240)' },
  { id: 'perplexity',   ua: 'PerplexityBot',   vendor: 'Perplexity',   ptr: '*.perplexity.ai',    color: 'oklch(0.78 0.14 200)' },
  { id: 'amazonbot',    ua: 'Amazonbot',       vendor: 'Amazon',       ptr: '*.amazon.com',       color: 'oklch(0.80 0.15 85)'  },
  { id: 'ccbot',        ua: 'CCBot',           vendor: 'CommonCrawl',  ptr: '*.commoncrawl.org',  color: 'oklch(0.72 0.10 300)' },
  { id: 'bytespider',   ua: 'Bytespider',      vendor: 'ByteDance',    ptr: '*.bytedance.com',    color: 'oklch(0.72 0.15 350)' },
];

// ========= PUBLISHER VIEW: revenue per AI buyer =========
const SUBSCRIBERS = [
  { id: 'sub_openai',     vendor: 'OpenAI',       bots: ['gptbot','chatgpt'],    tier: 'enterprise', plan: '$0.0020/req', requests_30d: 4892013, revenue_30d: 9784.03, status: 'active',   since: '2025-11-14' },
  { id: 'sub_anthropic',  vendor: 'Anthropic',    bots: ['claudebot','claudeweb'],tier: 'enterprise', plan: '$0.0020/req', requests_30d: 3104211, revenue_30d: 6208.42, status: 'active',   since: '2025-12-02' },
  { id: 'sub_google',     vendor: 'Google',       bots: ['googleext'],            tier: 'enterprise', plan: '$0.0015/req', requests_30d: 2201800, revenue_30d: 3302.70, status: 'active',   since: '2026-01-09' },
  { id: 'sub_perplexity', vendor: 'Perplexity',   bots: ['perplexity'],           tier: 'growth',     plan: '$0.0030/req', requests_30d: 1482090, revenue_30d: 4446.27, status: 'active',   since: '2026-02-20' },
  { id: 'sub_bytedance',  vendor: 'ByteDance',    bots: ['bytespider'],           tier: 'growth',     plan: '$0.0030/req', requests_30d: 402331,  revenue_30d: 1206.99, status: 'overage',  since: '2026-03-11' },
  { id: 'sub_amazon',     vendor: 'Amazon',       bots: ['amazonbot'],            tier: 'growth',     plan: '$0.0025/req', requests_30d: 212450,  revenue_30d: 531.13,  status: 'active',   since: '2026-03-28' },
  { id: 'sub_cohere',     vendor: 'Cohere',       bots: [],                       tier: 'startup',    plan: '$0.0040/req', requests_30d: 48022,   revenue_30d: 192.09,  status: 'trial',    since: '2026-04-18' },
];

// 30-day daily revenue (for the publisher chart)
const DAILY_REV = Array.from({ length: 30 }, (_, i) => {
  const t = i / 30;
  const base = 780 + Math.sin(t * Math.PI * 2.2) * 180 + (i % 7 < 5 ? 90 : -140);
  return {
    day: i,
    revenue: Math.max(0, base + (Math.random() - 0.5) * 80 + (i > 20 ? i * 12 : 0)),
    requests: Math.max(0, Math.round(base * 400 + (Math.random() - 0.5) * 15000)),
  };
});

// Pricing plans (publisher config)
const PLANS = [
  { id: 'free',       name: 'Free crawl',       price: '$0',           req_rate: '1 req/s',   quota: '1k/day',   scopes: ['/robots.txt','/sitemap.xml'],                  color: 'var(--text-mute)' },
  { id: 'startup',    name: 'Startup',          price: '$0.0040 / req',req_rate: '5 req/s',   quota: '100k/mo',  scopes: ['/articles/*','/blog/*'],                       color: 'var(--warn)' },
  { id: 'growth',     name: 'Growth',           price: '$0.0025 / req',req_rate: '15 req/s',  quota: '2M/mo',    scopes: ['/articles/*','/blog/*','/api/public/*'],       color: 'var(--info)' },
  { id: 'enterprise', name: 'Enterprise',       price: '$0.0015 / req',req_rate: '50 req/s',  quota: 'unlimited',scopes: ['*'],                                           color: 'var(--ok)' },
];

// Protected paths / site scopes
const SITE_SCOPES = [
  { path: '/articles/*',    access: 'paid',  price_per_req: 0.0020, hits_30d: 4201992, color: 'var(--accent)' },
  { path: '/blog/*',        access: 'paid',  price_per_req: 0.0020, hits_30d: 2819332, color: 'var(--accent)' },
  { path: '/api/public/*',  access: 'paid',  price_per_req: 0.0030, hits_30d: 902043,  color: 'var(--accent)' },
  { path: '/docs/*',        access: 'paid',  price_per_req: 0.0015, hits_30d: 482011,  color: 'var(--accent)' },
  { path: '/about',         access: 'free',  price_per_req: 0,      hits_30d: 12003,   color: 'var(--text-mute)' },
  { path: '/robots.txt',    access: 'free',  price_per_req: 0,      hits_30d: 82031,   color: 'var(--text-mute)' },
  { path: '/admin/*',       access: 'block', price_per_req: 0,      hits_30d: 201,     color: 'var(--bad)' },
];

// ========= BUYER VIEW: AI company's own contract + sub-tokens =========
const MY_CONTRACT = {
  vendor: 'OpenAI',
  account_id: 'acct_01HXZY9K4M',
  tier: 'enterprise',
  master_token: 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJncHRib3QiLCJ2ZW5kb3IiOiJvcGVuYWkiLCJ0aWVyIjoiZW50ZXJwcmlzZSIsInNjb3BlcyI6WyIvYXJ0aWNsZXMvKiIsIi9ibG9nLyoiXSwicXVvdGEiOjUwMDAwMDAwLCJpYXQiOjE3NjI0ODgwMDAsImV4cCI6MTc2NTA4MDAwMH0.SGIG8f_aKnUWx2...',
  rate: 50, // req/s
  quota: 50000000,
  quota_used: 23941022,
  period: '2026-04 monthly',
  spend_month: 47882.04,
  renews: '2026-05-01',
};

// Sub-tokens the AI company has minted for its own fleet
const SUB_TOKENS = [
  { id: 'tok_gpt_prod_us',   label: 'GPTBot · prod · us-east',   region: 'us-east-1', rate: 20, used: 9820300,  quota: 20000000, active: true,  last_use: '24s ago',  color: 'oklch(0.78 0.14 160)' },
  { id: 'tok_gpt_prod_eu',   label: 'GPTBot · prod · eu-west',   region: 'eu-west-1', rate: 15, used: 7201442,  quota: 15000000, active: true,  last_use: '3s ago',   color: 'oklch(0.78 0.14 160)' },
  { id: 'tok_gpt_prod_ap',   label: 'GPTBot · prod · ap-south',  region: 'ap-south-1',rate: 10, used: 5209144,  quota: 10000000, active: true,  last_use: '41s ago',  color: 'oklch(0.78 0.14 160)' },
  { id: 'tok_chatgpt_user',  label: 'ChatGPT-User · browse',     region: 'global',    rate: 5,  used: 1710136,  quota: 5000000,  active: true,  last_use: '1m ago',   color: 'oklch(0.80 0.13 200)' },
  { id: 'tok_gpt_research',  label: 'Research eval · staging',   region: 'us-west-2', rate: 2,  used: 40812,    quota: 500000,   active: false, last_use: '14d ago',  color: 'var(--text-mute)' },
];

// Recent request events (live log) — now: pay / 401 / 403 / overage / rate-limit
const SAMPLE_EVENTS = [
  // paid — JWT verified, metered
  { cat:'paid',       ua:'GPTBot/1.2',       ip:'52.230.152.19', sub:'OpenAI',     tok:'tok_gpt_prod_us', uri:'/articles/2026/04/gemini-3', status:200, cents:0.20, detail:'verified · metered' },
  { cat:'paid',       ua:'ClaudeBot/1.0',    ip:'54.36.148.12',  sub:'Anthropic',  tok:'tok_anth_prod',    uri:'/blog/post-training-rlhf', status:200, cents:0.20, detail:'verified · metered' },
  { cat:'paid',       ua:'PerplexityBot/1.0',ip:'52.70.240.171', sub:'Perplexity', tok:'tok_px_fetch',     uri:'/api/public/search?q=ai',  status:200, cents:0.30, detail:'verified · metered' },
  // 401 — no token
  { cat:'unauth',     ua:'GPTBot/1.2',       ip:'52.230.100.5',  sub:null,         tok:null,               uri:'/articles/hot-take',       status:401, cents:0,    detail:'missing bearer token' },
  // 402 — expired token
  { cat:'expired',    ua:'ClaudeBot/1.0',    ip:'54.36.148.88',  sub:'Anthropic',  tok:'tok_anth_old',     uri:'/articles/2026/01/x',      status:401, cents:0,    detail:'token expired 3d ago' },
  // scope miss
  { cat:'scope_miss', ua:'GPTBot/1.2',       ip:'52.230.100.22', sub:'OpenAI',     tok:'tok_gpt_prod_us',  uri:'/admin/users',             status:403, cents:0,    detail:'path not in token scopes' },
  // rate limit
  { cat:'rate',       ua:'Bytespider/1.0',   ip:'110.249.201.4', sub:'ByteDance',  tok:'tok_bytedance',    uri:'/articles/trending',       status:429, cents:0,    detail:'rate limit exceeded (31/30 req/s)' },
  // quota exceeded
  { cat:'overage',    ua:'Bytespider/1.0',   ip:'110.249.201.8', sub:'ByteDance',  tok:'tok_bytedance',    uri:'/articles/finance',        status:402, cents:0,    detail:'quota exhausted · overage billing' },
  // fake UA — rDNS fails
  { cat:'fake',       ua:'GPTBot/1.2',       ip:'185.220.101.12',sub:null,         tok:null,               uri:'/articles/scrape-me',      status:403, cents:0,    detail:'ptr mismatch · spoof' },
  // malicious
  { cat:'malicious',  ua:'sqlmap/1.7',       ip:'5.188.206.14',  sub:null,         tok:null,               uri:'/wp-login.php',            status:403, cents:0,    detail:'blocked UA pattern' },
  // free path
  { cat:'free',       ua:'Applebot/0.1',     ip:'17.58.98.22',   sub:null,         tok:null,               uri:'/robots.txt',              status:200, cents:0,    detail:'free path · rdns verified' },
];

function makeEvent(i) {
  const base = SAMPLE_EVENTS[Math.floor(Math.random() * SAMPLE_EVENTS.length)];
  return {
    ...base,
    id: 'evt-' + Date.now() + '-' + i,
    time: Date.now() - i * (800 + Math.random() * 1800),
  };
}
const INITIAL_EVENTS = Array.from({ length: 60 }, (_, i) => makeEvent(i));

// Publisher summary
const PUB_SUMMARY = {
  revenue_30d:       25671.63,
  revenue_mom:       +0.38,
  requests_30d:      12342917,
  paid_requests_30d: 12342917 - 482000,
  active_subs:       6,
  trial_subs:        1,
  avg_per_req_cents: 0.208,
  arpu_monthly:      4278.60,
  block_rate:        0.034,
};

// Buyer summary (MY_CONTRACT flattened)
const BUY_SUMMARY = {
  spend_month:    47882.04,
  spend_last:     41209.18,
  quota_used_pct: 0.479,
  req_today:      892303,
  rate_now:       42, // req/s current
  rate_limit:     50,
  active_tokens:  4,
  errors_24h:     128,
};

Object.assign(window, {
  BOTS, SUBSCRIBERS, DAILY_REV, PLANS, SITE_SCOPES,
  MY_CONTRACT, SUB_TOKENS, SAMPLE_EVENTS, INITIAL_EVENTS, makeEvent,
  PUB_SUMMARY, BUY_SUMMARY,
});
