'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { myStats, fmt, type LogRow } from '@/lib/api'
import ChannelSelector from '@/components/ChannelSelector'

const CATEGORIES = [
  { key: 'all',       label: '전체 트래픽' },
  { key: 'bot',       label: 'AI 봇만' },
  { key: 'other_bot', label: '기타 봇만' },
  { key: 'malicious', label: '차단된 악성만' },
  { key: 'user',      label: '사용자만' },
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

function rowsToCsv(rows: LogRow[]): string {
  const head = ['ts','category','verified','billed','blocked','domain','bot_name','bot_purpose','bot_ua','path','ip']
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const lines = [head.join(',')]
  rows.forEach(r => {
    lines.push([
      r.ts, r.category,
      r.verified ? 'Y' : 'N',
      r.billed   ? 'Y' : 'N',
      r.blocked  ? 'Y' : 'N',
      r.domain, r.bot_name, r.bot_purpose, r.bot_ua, r.path, r.ip,
    ].map(esc).join(','))
  })
  return lines.join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function TrafficPage() {
  const [category, setCategory] = useState('bot')
  const [channel,  setChannel]  = useState('')
  const [logs, setLogs]         = useState<LogRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [autoRefresh, setAuto]  = useState(false)
  const [csvOpen, setCsvOpen]   = useState(false)
  const [csvBusy, setCsvBusy]   = useState<string | null>(null)
  const [status, setStatus]     = useState<{ msg: string; color: string } | null>(null)
  const csvBoxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    myStats.logs(category, 200, channel || undefined)
      .then(rs => setLogs(rs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [category, channel])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  // 외부 클릭으로 dropdown 닫기
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (csvBoxRef.current && !csvBoxRef.current.contains(e.target as Node)) setCsvOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  function exportLive() {
    setCsvOpen(false)
    if (logs.length === 0) { alert('내려받을 로그가 없습니다.'); return }
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(rowsToCsv(logs), `traffic_live_${today}.csv`)
    flashStatus(`✓ ${fmt(logs.length)}건 다운로드`, 'var(--ok)')
  }

  async function exportPeriod(period: 'day' | 'week' | 'month') {
    setCsvOpen(false)
    setCsvBusy(period)
    const label = period === 'day' ? '오늘' : period === 'week' ? '7일' : '30일'
    flashStatus(`⏳ ${label} 로딩중…`, 'var(--brand)')
    try {
      const rows = await myStats.exportLogs(period, category, channel || undefined)
      const today = new Date().toISOString().slice(0, 10)
      downloadCsv(rowsToCsv(rows), `traffic_${period}_${today}.csv`)
      flashStatus(`✓ ${fmt(rows.length)}건 다운로드`, 'var(--ok)')
    } catch (e: unknown) {
      flashStatus('다운로드 실패', 'var(--bad)')
      alert((e as Error).message || '실패')
    } finally {
      setCsvBusy(null)
    }
  }

  function flashStatus(msg: string, color: string) {
    setStatus({ msg, color })
    setTimeout(() => setStatus(null), 3000)
  }

  return (
    <>
      <style>{`
        .filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 18px; flex-wrap: wrap; }
        .filter-bar .pill {
          padding: 6px 14px; border: 1px solid var(--line); background: #fff;
          border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500; color: var(--ink-2);
        }
        .filter-bar .pill.active { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 600; }
        .filter-bar .auto { display:flex; align-items:center; gap:6px; margin-left:auto; font-size:12.5px; color:var(--ink-dim); }
        .csv-dropdown { position: relative; display: inline-block; }
        .csv-menu {
          position: absolute; right: 0; top: calc(100% + 4px);
          background: #fff; border: 1px solid var(--line); border-radius: 8px;
          overflow: hidden; z-index: 200; min-width: 160px;
          box-shadow: 0 8px 24px rgba(0,0,0,.12);
        }
        .csv-menu button {
          display: block; width: 100%; text-align: left;
          padding: 9px 14px; font-size: 12.5px; font-weight: 600;
          background: none; border: none; cursor: pointer; color: var(--ink);
          font-family: var(--sans);
        }
        .csv-menu button:hover { background: var(--bg-soft); }
        .csv-menu .sep { height: 1px; background: var(--line); margin: 0 10px; }
      `}</style>

      <div className="page-head">
        <div>
          <h1>실시간 트래픽</h1>
          <div className="greeting">최근 200건의 봇 트래픽 — 5초마다 자동 갱신 가능.</div>
        </div>
        <div className="right">
          <ChannelSelector value={channel} onChange={setChannel} />
          {status && <span style={{fontSize:'13px', color: status.color, fontWeight:600}}>{status.msg}</span>}
        </div>
      </div>

      <div className="filter-bar">
        {CATEGORIES.map(c => (
          <button key={c.key} className={`pill${category === c.key ? ' active' : ''}`} onClick={() => setCategory(c.key)}>
            {c.label}
          </button>
        ))}
        <button className="pill" onClick={load}>↻ 새로고침</button>
        <label className="auto">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAuto(e.target.checked)} />
          5초 자동 새로고침
        </label>
        <div className="csv-dropdown" ref={csvBoxRef}>
          <button className="csv-btn" onClick={(e) => { e.stopPropagation(); setCsvOpen(!csvOpen) }}>
            ↓ CSV <span style={{fontSize:'9px', opacity:.7}}>▾</span>
          </button>
          {csvOpen && (
            <div className="csv-menu">
              <button onClick={exportLive}>실시간 (현재 화면)</button>
              <div className="sep"/>
              <button onClick={() => exportPeriod('day')}   disabled={csvBusy === 'day'}>오늘</button>
              <button onClick={() => exportPeriod('week')}  disabled={csvBusy === 'week'}>최근 7일</button>
              <button onClick={() => exportPeriod('month')} disabled={csvBusy === 'month'}>최근 30일</button>
            </div>
          )}
        </div>
      </div>

      <div className="panel flush">
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
                    <td className="mono" style={{maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={l.bot_ua}>
                      {l.bot_name ? <strong style={{color:'var(--ink)'}}>{l.bot_name}</strong> : (l.bot_ua || '(없음)')}
                    </td>
                    <td className="mono" style={{maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={l.path}>{l.path}</td>
                    <td className="mono" style={{color:'var(--ink-dim)'}}>{l.ip}</td>
                    <td>
                      {l.verified === 1 && <span style={{color:'var(--ok)', fontSize:'12px'}}>✓ 검증</span>}
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
