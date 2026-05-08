'use client'

import { useEffect, useState } from 'react'
import { botCatalog, type BotCatalogEntry } from '@/lib/api'

const PURPOSE_LABEL: Record<string, string> = {
  ai_training: 'AI 학습', ai_search: 'AI 검색', ai_assistant: 'AI 어시스턴트',
  search_engine: '검색엔진', seo: 'SEO 툴', social: '소셜', generic: '기타',
  malicious: '악성',
}

const PURPOSE_COLOR: Record<string, string> = {
  ai_training: '#2b6df6', ai_search: '#9d6bff', ai_assistant: '#1aa377',
  search_engine: '#f59e0b', seo: '#ff7a5c', social: '#ec4899', generic: '#94a3b8',
  malicious: '#ef4444',
}

export default function CatalogPage() {
  const [bots, setBots]       = useState<BotCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<string>('all')

  useEffect(() => {
    botCatalog().then(setBots).catch(() => setBots([])).finally(() => setLoading(false))
  }, [])

  const purposes = Array.from(new Set(bots.map(b => b.is_malicious ? 'malicious' : b.purpose))).sort()
  const filtered = filter === 'all'
    ? bots
    : filter === 'malicious'
    ? bots.filter(b => b.is_malicious === 1)
    : bots.filter(b => !b.is_malicious && b.purpose === filter)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>봇 카탈로그</h1>
          <div className="greeting">GuardUs가 분류하는 모든 봇 ({bots.length}개) — 가이드용 read-only 보기.</div>
        </div>
      </div>

      <div style={{display:'flex', gap:'8px', marginBottom:'18px', flexWrap:'wrap'}}>
        <button className={`purpose-pill${filter === 'all' ? ' active' : ''}`}
          style={filter === 'all' ? {background:'var(--ink)'} : {}}
          onClick={() => setFilter('all')}>
          전체 ({bots.length})
        </button>
        {purposes.map(p => {
          const count = p === 'malicious'
            ? bots.filter(b => b.is_malicious === 1).length
            : bots.filter(b => !b.is_malicious && b.purpose === p).length
          const color = PURPOSE_COLOR[p] ?? '#94a3b8'
          return (
            <button key={p}
              className={`purpose-pill${filter === p ? ' active' : ''}`}
              style={filter === p ? {background:color} : {}}
              onClick={() => setFilter(p)}>
              {PURPOSE_LABEL[p] ?? p} ({count})
            </button>
          )
        })}
      </div>

      <div className="panel flush">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>봇 이름</th>
                <th>제공사</th>
                <th>분류</th>
                <th>UA 패턴</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{textAlign:'center', color:'var(--ink-mute)', padding:'40px'}}>봇 없음</td></tr>
              ) : filtered.map((b, i) => {
                const key = b.is_malicious ? 'malicious' : b.purpose
                const color = PURPOSE_COLOR[key] ?? '#94a3b8'
                const label = PURPOSE_LABEL[key] ?? key
                return (
                  <tr key={i}>
                    <td style={{fontWeight:700}}>{b.name}</td>
                    <td style={{color:'var(--ink-dim)'}}>{b.vendor || '—'}</td>
                    <td>
                      <span className="badge" style={{background:color+'20', color}}>{label}</span>
                    </td>
                    <td className="mono" style={{fontSize:'11px', color:'var(--ink-dim)', maxWidth:'320px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={b.patterns}>{b.patterns}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
