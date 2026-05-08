/**
 * API client — all calls go to /api/... which Next.js rewrites to admin-api.
 * Bearer token is read from localStorage key "portalToken".
 */

const BASE = '/api'

function token(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('portalToken') || ''
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const tk = token()
  return { ...(tk ? { Authorization: `Bearer ${tk}` } : {}), ...extra }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status })
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw Object.assign(new Error((err.error as string) || res.statusText), { status: res.status })
  }
  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string
  id: string
  email: string
  name: string
}

export function login(email: string, password: string) {
  return post<LoginResponse>('/auth/login', { email, password })
}

export function register(email: string, password: string, name: string) {
  return post<{ id: string; email: string; name: string }>('/auth/register', { email, password, name })
}

export async function logout() {
  const tk = token()
  if (tk) {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {})
  }
  localStorage.removeItem('portalToken')
}

export function me() {
  return get<{ id: string; email: string; name: string }>('/auth/me')
}

// ── Portal ────────────────────────────────────────────────────────────────

export interface Channel {
  id: string
  name: string
  domain: string
  upstream: string
  active: number
  created_at?: string
}

export interface ChannelStat {
  domain: string
  total: number
  verified: number
  blocked: number
  bot_types: number
}

export interface PurposeStat {
  bot_purpose: string
  total: number
}

export interface DashboardResponse {
  channels: Channel[]
  stats: ChannelStat[]
  purposes: PurposeStat[]
}

export function dashboard() {
  return get<DashboardResponse>('/me/dashboard')
}

export function myChannels() {
  return get<Channel[]>('/me/channels')
}

export function createChannel(name: string, domain: string, upstream: string) {
  return post<Channel>('/me/channels', { name, domain, upstream })
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw Object.assign(new Error((err.error as string) || res.statusText), { status: res.status })
  }
  return res.json() as Promise<T>
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw Object.assign(new Error((err.error as string) || res.statusText), { status: res.status })
  }
  return res.json() as Promise<T>
}

export function updateChannel(id: string, body: { active?: boolean; name?: string; upstream?: string }) {
  return patch<{ ok: boolean }>(`/me/channels/${id}`, body)
}

export function deleteChannel(id: string) {
  return del<{ ok: boolean }>(`/me/channels/${id}`)
}

export interface DnsCheckResult {
  id?:           string
  domain:        string
  status:        string  // ok / wrong_target / no_record / etc
  message?:      string
  resolved?:     string
  expected?:     string
}

export function checkDns(channelId: string) {
  return get<DnsCheckResult>(`/me/channels/${channelId}/dns-check`)
}

export interface Token {
  id: string
  token: string
  owner: string
  plan: string
  active: number
  created_at: string
  expires_at: string | null
}

export function myTokens() {
  return get<Token[]>('/me/tokens')
}

export function issueToken(owner: string, plan: string = 'default') {
  return post<Token>('/me/tokens', { owner, plan })
}

export function revokeToken(id: string) {
  return del<{ ok: boolean }>(`/me/tokens/${id}`)
}

export interface BotCatalogEntry {
  name:         string
  vendor:       string
  purpose:      string
  patterns:     string
  is_malicious: number
  enabled:      number
}

export function botCatalog() {
  return get<BotCatalogEntry[]>('/me/bot-catalog')
}

// ── Stats ─────────────────────────────────────────────────────────────────

export interface CategoryStats {
  malicious: number
  bot:       number
  other_bot: number
  user:      number
}

export interface DailyRow {
  date:     string
  category: string
  count:    number
}

export interface BotRow {
  bot_ua: string
  count:  number
}

export interface PurposeRow {
  bot_purpose: string
  count:       number
  unique_bots: number
}

export interface MaliciousRow {
  bot_name:   string
  bot_vendor: string
  count:      number
  last_seen:  string
}

export interface BillingStats {
  total:            number
  billed:           number
  unit_price:       number
  estimated_amount: number
}

export interface LogRow {
  id:           number
  bot_ua:       string
  domain:       string
  ip:           string
  path:         string
  verified:     number
  billed:       number
  blocked?:     number
  category:     string
  bot_purpose:  string
  bot_name:     string
  bot_vendor?:  string
  ts:           string
}

function q(domain?: string, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  if (domain) p.set('domain', domain)
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const myStats = {
  category:  (domain?: string)                                       => get<CategoryStats>(`/me/stats/category${q(domain)}`),
  daily:     (days = 30, domain?: string)                            => get<DailyRow[]>(`/me/stats/daily${q(domain, { days })}`),
  bots:      (category = 'bot', limit = 10, domain?: string)         => get<BotRow[]>(`/me/stats/bots${q(domain, { category, limit })}`),
  purpose:   (domain?: string)                                       => get<PurposeRow[]>(`/me/stats/purpose${q(domain)}`),
  malicious: (domain?: string)                                       => get<MaliciousRow[]>(`/me/stats/malicious${q(domain)}`),
  billing:   (domain?: string)                                       => get<BillingStats>(`/me/stats/billing${q(domain)}`),
  logs:      (category = 'bot', limit = 100, domain?: string)        => get<LogRow[]>(`/me/logs${q(domain, { category, limit })}`),
  exportLogs:(period: 'day'|'week'|'month', category = 'all', domain?: string) => get<LogRow[]>(`/me/logs/export${q(domain, { period, category })}`),
}

// ── Path Rules ────────────────────────────────────────────────────────────

export interface PathRule {
  id:         string
  pattern:    string
  action:     string  // allow / block / meter / verify / token_only / gone
  note:       string
  active:     number
  created_at: string
}

export const pathRules = {
  list:   ()                                                        => get<PathRule[]>('/me/path-rules'),
  create: (pattern: string, action: string, note: string = '')      => post<PathRule>('/me/path-rules', { pattern, action, note }),
  update: (id: string, body: { action?: string; note?: string; active?: boolean }) => patch<{ ok: boolean }>(`/me/path-rules/${id}`, body),
  remove: (id: string)                                              => del<{ ok: boolean }>(`/me/path-rules/${id}`),
}

// ── Purpose Policies ──────────────────────────────────────────────────────

export const purposePolicies = {
  list:   ()                                  => get<Record<string, string>>('/me/purpose-policies'),
  update: (purpose: string, action: string)   => patch<{ ok: boolean }>(`/me/purpose-policies/${purpose}`, { action }),
}

// ── Format helpers ────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
