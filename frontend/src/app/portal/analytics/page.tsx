'use client'

import { useEffect, useState } from 'react'
import { myStats, fmt, type DailyRow, type BotRow } from '@/lib/api'

export default function AnalyticsPage() {
  const [days, setDays]         = useState(30)
  const [daily, setDaily]       = useState<DailyRow[]>([])
  const [bots,  setBots]        = useState<BotRow[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      myStats.daily(days).catch(() => []),
      myStats.bots('bot', 50).catch(() => []),
    ]).then(([d, b]) => {
      setDaily(d ?? [])
      setBots(b ?? [])
      setLoading(false)
    })
  }, [days])

  // Aggregate by date
  type DayBucket = { bot: number; other_bot: number; user: number; malicious: number; total: number }
  const byDate: Record<string, DayBucket> = {}
  daily.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { bot: 0, other_bot: 0, user: 0, malicious: 0, total: 0 }
    const cnt = Number(r.count)
    const b = byDate[r.date]
    if (r.category === 'bot')        b.bot       = cnt
    else if (r.category === 'other_bot') b.other_bot = cnt
    else if (r.category === 'user')      b.user      = cnt
    else if (r.category === 'malicious') b.malicious = cnt
    b.total += cnt
  })
  const sortedDates = Object.keys(byDate).sort().reverse()
  const totalReqs = sortedDates.reduce((s, d) => s + byDate[d].total, 0)
  const totalBots = bots.reduce((s, b) => s + Number(b.count), 0)
  const maxBot    = Math.max(...bots.map(b => Number(b.count)), 1)

  return (
    <>
      <style>{`
        .filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 22px; }
        .filter-bar button {
          padding: 6px 14px; border: 1px solid var(--line); background: #fff;
          border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500; color: var(--ink-2);
        }
        .filter-bar button.active { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 600; }
        .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 22px; }
        .panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .panel-head h3 { font-size: 15px; font-weight: 700; margin: 0; }
        .panel-head .ph-sub { font-size: 12.5px; color: var(--ink-dim); }
        .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tbl th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
                  text-transform: uppercase; color: var(--ink-mute); background: var(--bg-soft); border-bottom: 1px solid var(--line); }
        .tbl td { padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
        .tbl tr:last-child td { border-bottom: none; }
        .botrow { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom: 1px dashed var(--line); }
        .botrow:last-child { border-bottom: none; }
        .botname { font-family: var(--mono); font-size: 12px; color: var(--ink-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pbar { height: 6px; background: var(--bg-soft); border-radius: 3px; overflow: hidden; }
        .pbar-fill { height: 100%; border-radius: 3px; }
        .summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 22px; }
        .sum-card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 16px 20px; }
        .sum-l { font-size: 12px; color: var(--ink-dim); margin-bottom: 4px; }
        .sum-v { font-size: 22px; font-weight: 800; }
        @media (max-width: 980px) { .panels { grid-template-columns: 1fr; } .summary { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{marginBottom:'22px'}}>
        <h1 style={{fontSize:'26px', fontWeight:800, letterSpacing:'-0.02em', margin:0}}>분석 리포트</h1>
        <div style={{fontSize:'13.5px', color:'var(--ink-dim)', marginTop:'4px'}}>일별 봇 트래픽과 봇별 누적 통계.</div>
      </div>

      <div className="filter-bar">
        <span style={{fontSize:'13px', color:'var(--ink-dim)', marginRight:'4px'}}>기간:</span>
        {[7, 14, 30].map(n => (
          <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>최근 {n}일</button>
        ))}
      </div>

      <div className="summary">
        <div className="sum-card">
          <div className="sum-l">총 요청 (전체 카테고리)</div>
          <div className="sum-v">{loading ? '…' : fmt(totalReqs)}</div>
        </div>
        <div className="sum-card">
          <div className="sum-l">집계 일수</div>
          <div className="sum-v">{loading ? '…' : `${sortedDates.length}일`}</div>
        </div>
        <div className="sum-card">
          <div className="sum-l">AI 봇 (누적)</div>
          <div className="sum-v">{loading ? '…' : fmt(totalBots)}</div>
        </div>
      </div>

      <div className="panels">
        {/* 일별 표 */}
        <div className="panel" style={{padding:0, overflow:'hidden'}}>
          <div className="panel-head" style={{padding:'18px 22px 0'}}>
            <h3>일별 카테고리 분포</h3>
            <span className="ph-sub">최근 {days}일</span>
          </div>
          <div style={{overflowX:'auto', padding:'12px 0'}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th style={{textAlign:'right'}}>AI 봇</th>
                  <th style={{textAlign:'right'}}>기타</th>
                  <th style={{textAlign:'right'}}>악성</th>
                  <th style={{textAlign:'right'}}>사용자</th>
                  <th style={{textAlign:'right'}}>합계</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
                ) : sortedDates.length === 0 ? (
                  <tr><td colSpan={6} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>데이터 없음</td></tr>
                ) : sortedDates.map(d => {
                  const r = byDate[d]
                  return (
                    <tr key={d}>
                      <td style={{fontFamily:'var(--mono)', fontSize:'12px'}}>{d}</td>
                      <td style={{textAlign:'right', fontWeight:600, color:'#2b6df6'}}>{fmt(r.bot)}</td>
                      <td style={{textAlign:'right', color:'#1aa377'}}>{fmt(r.other_bot)}</td>
                      <td style={{textAlign:'right', color:'var(--bad)'}}>{fmt(r.malicious)}</td>
                      <td style={{textAlign:'right', color:'var(--ink-dim)'}}>{fmt(r.user)}</td>
                      <td style={{textAlign:'right', fontWeight:700}}>{fmt(r.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 봇별 (전체 누적) */}
        <div className="panel">
          <div className="panel-head">
            <h3>AI 봇별 누적 (전체 기간)</h3>
            <span className="ph-sub">TOP {bots.length}</span>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>로딩중…</div>
          ) : bots.length === 0 ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>데이터 없음</div>
          ) : bots.map(b => {
            const cnt = Number(b.count)
            const pct = Math.round(cnt / maxBot * 100)
            return (
              <div key={b.bot_ua} className="botrow">
                <span className="botname" title={b.bot_ua}>{b.bot_ua || '(이름 없음)'}</span>
                <div style={{width:'90px'}}><div className="pbar"><div className="pbar-fill" style={{width:`${pct}%`, background:'#2b6df6'}}/></div></div>
                <span style={{fontWeight:700, fontSize:'13px', minWidth:'46px', textAlign:'right'}}>{fmt(cnt)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
