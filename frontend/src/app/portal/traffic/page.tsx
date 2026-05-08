'use client'

import { useEffect, useState, useCallback } from 'react'
import { myStats, fmt, type LogRow } from '@/lib/api'

const CATEGORIES = [
  { key: 'all',       label: '전체',    color: '#64748b' },
  { key: 'bot',       label: 'AI 봇',   color: '#2b6df6' },
  { key: 'other_bot', label: '기타 봇', color: '#1aa377' },
  { key: 'malicious', label: '악성',    color: '#ef4444' },
  { key: 'user',      label: '사용자',  color: '#94a3b8' },
]

const CAT_LABEL: Record<string, { label: string; color: string }> = {
  bot:       { label: 'AI',     color: '#2b6df6' },
  other_bot: { label: '기타',   color: '#1aa377' },
  malicious: { label: '악성',   color: '#ef4444' },
  user:      { label: '사용자', color: '#94a3b8' },
}

const PURPOSE_LABEL: Record<string, string> = {
  ai_training: 'AI 학습', ai_search: 'AI 검색', ai_assistant: 'AI 어시스턴트',
  search_engine: '검색엔진', seo: 'SEO', social: '소셜', generic: '기타',
}

function exportCsv(rows: LogRow[], category: string) {
  if (rows.length === 0) return
  const head = ['ts','category','domain','bot_name','bot_ua','path','ip','verified','billed','bot_purpose']
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const lines = [head.join(',')]
  rows.forEach(r => {
    lines.push([r.ts, r.category, r.domain, r.bot_name, r.bot_ua, r.path, r.ip, r.verified, r.billed, r.bot_purpose].map(esc).join(','))
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `traffic-${category}-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TrafficPage() {
  const [category, setCategory] = useState('bot')
  const [logs, setLogs]         = useState<LogRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [autoRefresh, setAuto]  = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    myStats.logs(category, 200)
      .then(rs => setLogs(rs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [category])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  return (
    <>
      <style>{`
        .filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 22px; flex-wrap: wrap; }
        .filter-bar button {
          padding: 6px 14px; border: 1px solid var(--line); background: #fff;
          border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500; color: var(--ink-2);
        }
        .filter-bar button.active { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 600; }
        .filter-bar .auto { display:flex; align-items:center; gap:6px; margin-left:auto; font-size:12.5px; color:var(--ink-dim); }
        .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; }
        .tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .tbl th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
                  text-transform: uppercase; color: var(--ink-mute); background: var(--bg-soft); border-bottom: 1px solid var(--line); position: sticky; top: 0; }
        .tbl td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
        .tbl tr:last-child td { border-bottom: none; }
        .tbl tr:hover td { background: var(--bg-soft); }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px;
                 font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .mono { font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
        .truncate { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ok-dot::before { content: '✓ '; color: var(--ok); font-weight: 700; }
        .x-dot::before { content: '— '; color: var(--ink-mute); }
      `}</style>

      <div style={{marginBottom:'18px'}}>
        <h1 style={{fontSize:'26px', fontWeight:800, letterSpacing:'-0.02em', margin:0}}>실시간 트래픽</h1>
        <div style={{fontSize:'13.5px', color:'var(--ink-dim)', marginTop:'4px'}}>최근 200건. 카테고리별 필터 가능.</div>
      </div>

      <div className="filter-bar">
        {CATEGORIES.map(c => (
          <button key={c.key} className={category === c.key ? 'active' : ''} onClick={() => setCategory(c.key)}>
            {c.label}
          </button>
        ))}
        <button onClick={load} style={{marginLeft:'8px'}}>↻ 새로고침</button>
        <button onClick={() => exportCsv(logs, category)} disabled={logs.length === 0}>⬇ CSV</button>
        <label className="auto">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAuto(e.target.checked)} />
          5초 자동 새로고침
        </label>
      </div>

      <div className="panel">
        <div style={{overflowX:'auto', maxHeight:'70vh'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>시각</th>
                <th>분류</th>
                <th>도메인</th>
                <th>봇 / UA</th>
                <th>경로</th>
                <th>IP</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center', color:'var(--ink-mute)', padding:'40px'}}>로그 없음</td></tr>
              ) : logs.map(l => {
                const cat = CAT_LABEL[l.category] ?? { label: l.category, color: '#94a3b8' }
                const purpose = PURPOSE_LABEL[l.bot_purpose] ?? ''
                return (
                  <tr key={l.id}>
                    <td className="mono" style={{whiteSpace:'nowrap'}}>{(l.ts ?? '').slice(5, 19).replace('T',' ')}</td>
                    <td>
                      <span className="badge" style={{background: cat.color + '20', color: cat.color}}>{cat.label}</span>
                      {purpose && <span style={{fontSize:'10px', color:'var(--ink-dim)', marginLeft:'4px'}}>{purpose}</span>}
                    </td>
                    <td className="mono">{l.domain}</td>
                    <td className="mono truncate" title={l.bot_ua}>
                      {l.bot_name ? <strong style={{color:'var(--ink)'}}>{l.bot_name}</strong> : (l.bot_ua || '(없음)')}
                    </td>
                    <td className="mono truncate" title={l.path}>{l.path}</td>
                    <td className="mono" style={{color:'var(--ink-dim)'}}>{l.ip}</td>
                    <td>
                      <span className={l.verified ? 'ok-dot' : 'x-dot'} style={{fontSize:'12px', color:l.verified ? 'var(--ok)' : 'var(--ink-mute)'}}>
                        {l.verified ? '검증' : ''}
                      </span>
                      {l.billed === 1 && <span style={{marginLeft:'6px', fontSize:'11px', color:'var(--brand)', fontWeight:700}}>과금</span>}
                    </td>
                  </tr>
                )
              })}
              <tr><td colSpan={7} style={{textAlign:'right', color:'var(--ink-mute)', fontSize:'11px', padding:'8px 12px'}}>{fmt(logs.length)} 건</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
