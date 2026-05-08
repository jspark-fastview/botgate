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
  category:     string
  bot_purpose:  string
  bot_name:     string
  ts:           string
}

export const myStats = {
  category:  ()                              => get<CategoryStats>('/me/stats/category'),
  daily:     (days = 30)                     => get<DailyRow[]>(`/me/stats/daily?days=${days}`),
  bots:      (category = 'bot', limit = 10)  => get<BotRow[]>(`/me/stats/bots?category=${category}&limit=${limit}`),
  purpose:   ()                              => get<PurposeRow[]>('/me/stats/purpose'),
  malicious: ()                              => get<MaliciousRow[]>('/me/stats/malicious'),
  billing:   ()                              => get<BillingStats>('/me/stats/billing'),
  logs:      (category = 'bot', limit = 100) => get<LogRow[]>(`/me/logs?category=${category}&limit=${limit}`),
}

// ── Format helpers ────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
