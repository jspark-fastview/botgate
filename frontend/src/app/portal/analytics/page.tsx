'use client'

import { useEffect, useState } from 'react'
import { myStats, fmt, type DailyRow, type BotRow, type BillingStats } from '@/lib/api'
import ChannelSelector from '@/components/ChannelSelector'

type Tab = 'report' | 'pricing'

export default function AnalyticsPage() {
  const [tab, setTab]           = useState<Tab>('report')
  const [days, setDays]         = useState(30)
  const [channel, setChannel]   = useState('')
  const [daily, setDaily]       = useState<DailyRow[]>([])
  const [bots,  setBots]        = useState<BotRow[]>([])
  const [billing, setBilling]   = useState<BillingStats | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    const d = channel || undefined
    Promise.all([
      myStats.daily(days, d).catch(() => []),
      myStats.bots('bot', 50, d).catch(() => []),
      myStats.billing(d).catch(() => null),
    ]).then(([dl, b, bl]) => {
      setDaily(dl ?? [])
      setBots(b ?? [])
      setBilling(bl ?? null)
      setLoading(false)
    })
  }, [days, channel])

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
        .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .botrow { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom: 1px dashed var(--line); }
        .botrow:last-child { border-bottom: none; }
        .botname { font-family: var(--mono); font-size: 12px; color: var(--ink-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 22px; }
        .sum-card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 16px 20px; }
        .sum-l { font-size: 12px; color: var(--ink-dim); margin-bottom: 4px; }
        .sum-v { font-size: 22px; font-weight: 800; }
        .tabs { display: inline-flex; gap: 0; background: #fff; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: 4px; margin-right: 12px; }
        .tabs button { border: none; background: transparent; font-family: var(--sans); font-size: 13px; font-weight: 500; padding: 6px 16px; border-radius: var(--radius-pill); color: var(--ink-2); cursor: pointer; }
        .tabs button.active { background: var(--ink); color: #fff; font-weight: 600; }
        @media (max-width: 980px) { .panels { grid-template-columns: 1fr; } .summary { grid-template-columns: 1fr; } }
      `}</style>

      <div className="page-head">
        <div>
          <h1>분석 리포트</h1>
          <div className="greeting">일별 봇 트래픽 + 채널 단가 기반 수익 계산기.</div>
        </div>
        <div className="right">
          <ChannelSelector value={channel} onChange={setChannel} />
          <div className="tabs">
            <button className={tab === 'report'  ? 'active' : ''} onClick={() => setTab('report')}>리포트</button>
            <button className={tab === 'pricing' ? 'active' : ''} onClick={() => setTab('pricing')}>수익 계산기</button>
          </div>
          {tab === 'report' && (
            <div className="range-pill">
              {[7, 14, 30].map(n => (
                <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{n}일</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'pricing' ? (
        <PricingTab billing={billing} daily={daily} loading={loading} />
      ) : (
        <>
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
            <div className="panel flush">
              <div className="panel-head" style={{padding:'18px 22px 0'}}>
                <h3>일별 카테고리 분포</h3>
                <span className="sub">최근 {days}일</span>
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
                          <td className="mono">{d}</td>
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

            <div className="panel">
              <div className="panel-head">
                <h3>AI 봇별 누적 (전체 기간)</h3>
                <span className="sub">TOP {bots.length}</span>
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
                    <div style={{width:'90px'}}><div className="bar"><div className="bar-fill" style={{width:`${pct}%`, background:'#2b6df6'}}/></div></div>
                    <span style={{fontWeight:700, fontSize:'13px', minWidth:'46px', textAlign:'right'}}>{fmt(cnt)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── 수익 계산기 (Pricing Calculator) — 원본 SPA 디자인 그대로 ────────
function PricingTab({ billing, daily, loading }: { billing: BillingStats | null; daily: DailyRow[]; loading: boolean }) {
  type Base = 'total' | 'month' | 'billed'

  const [base,  setBase]  = useState<Base>('billed')
  const [rate,  setRate]  = useState(2.00)  // USD per 1,000 pages

  const total  = Number(billing?.total  ?? 0)
  const billed = Number(billing?.billed ?? 0)

  // 이번달 = 최근 30일 (모든 카테고리 합)
  const monthCount = daily.reduce((sum, r) => sum + Number(r.count), 0)

  const baseCount = base === 'total' ? total : base === 'month' ? monthCount : billed
  const baseLabel = base === 'total' ? '누적 전체' : base === 'month' ? '최근 30일' : '과금 대상만 (meter)'

  // rate는 1,000 pages 당 USD
  const usdRevenue = baseCount / 1000 * rate
  const krwRevenue = usdRevenue * 1300       // 1 USD ≈ 1300 KRW
  const perReqKrw  = baseCount > 0 ? krwRevenue / baseCount : 0

  function step(d: number) {
    setRate(r => Math.max(0, Math.round((r + d) * 100) / 100))
  }

  const cards: Array<{ key: Base; title: string; value: number; valColor: string; sub1: string; sub2: string }> = [
    { key: 'total',  title: '전체 AI봇 요청', value: total,      valColor: 'var(--ink)',   sub1: '누적 전체 · 통과 + 차단 포함',   sub2: '검색봇·기타봇 포함, 일부는 무료 통과' },
    { key: 'month',  title: '이번달 요청',    value: monthCount, valColor: 'var(--brand)', sub1: '최근 30일 · 통과 + 차단 포함',  sub2: '월별 트래픽 규모 파악용' },
    { key: 'billed', title: '과금 대상',      value: billed,     valColor: 'var(--ok)',    sub1: 'meter 정책 적용 요청만',        sub2: '실제 수익화 대상 — 전체보다 적음' },
  ]

  return (
    <>
      <div className="panel">
        <div className="panel-head" style={{marginBottom:'20px'}}>
          <h3>예상 수익 계산기</h3>
          <span className="sub">기준 데이터를 선택하고 단가를 입력하세요</span>
          <span style={{marginLeft:'8px', fontSize:'10px', fontWeight:700, background:'rgba(26,163,119,.15)', color:'var(--ok)', padding:'3px 8px', borderRadius:'6px'}}>PREVIEW</span>
        </div>

        {/* 기준 데이터 선택 */}
        <div style={{fontSize:'11px', fontWeight:700, color:'var(--ink-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px'}}>기준 데이터</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'24px'}}>
          {cards.map(c => {
            const active = base === c.key
            return (
              <div key={c.key} onClick={() => setBase(c.key)}
                style={{
                  cursor:'pointer',
                  border: `2px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
                  background: active ? 'var(--brand-soft)' : '#fff',
                  borderRadius:'12px', padding:'14px 16px', transition:'all 150ms',
                }}>
                <div style={{fontSize:'11px', fontWeight:700, color: c.key === 'billed' ? 'var(--ok)' : 'var(--ink-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px'}}>
                  {c.title}
                </div>
                <div style={{fontSize:'26px', fontWeight:800, letterSpacing:'-.02em', color: active ? 'var(--brand)' : c.valColor, marginBottom:'4px'}}>
                  {loading ? '—' : fmt(c.value)}
                </div>
                <div style={{fontSize:'11px', color:'var(--ink-mute)'}}>{c.sub1}</div>
                <div style={{fontSize:'10px', color:'var(--ink-mute)', marginTop:'4px'}}>{c.sub2}</div>
                <div style={{marginTop:'10px', fontSize:'12px', fontWeight:600, color: active ? 'var(--brand)' : 'var(--ink-dim)'}}>
                  {active ? '✓ 적용됨' : '계산에 적용 →'}
                </div>
              </div>
            )
          })}
        </div>

        {/* 구분선 */}
        <div style={{borderTop:'1px solid var(--line)', marginBottom:'20px'}}/>

        {/* 단가 + 결과 */}
        <div style={{fontSize:'11px', fontWeight:700, color:'var(--ink-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px'}}>단가 설정</div>
        <div style={{display:'flex', alignItems:'center', gap:'6px', marginBottom:'20px', flexWrap:'wrap'}}>
          <button onClick={() => step(-0.1)}
            style={{width:'36px', height:'44px', borderRadius:'8px', border:'1px solid var(--line)', background:'var(--bg-soft)', color:'var(--ink)', fontSize:'18px', cursor:'pointer'}}>−</button>
          <div style={{display:'flex', alignItems:'center', background:'var(--ink)', borderRadius:'8px', padding:'0 14px'}}>
            <span style={{fontSize:'16px', fontWeight:600, color:'rgba(255,255,255,.5)'}}>$</span>
            <input type="number" step="0.01" min={0} value={rate}
              onChange={e => setRate(Math.max(0, Number(e.target.value) || 0))}
              style={{background:'transparent', color:'#fff', border:'none', fontSize:'22px', fontWeight:700, fontFamily:'var(--mono)', width:'100px', outline:'none', padding:'10px 6px'}}/>
          </div>
          <button onClick={() => step(0.1)}
            style={{width:'36px', height:'44px', borderRadius:'8px', border:'1px solid var(--line)', background:'var(--bg-soft)', color:'var(--ink)', fontSize:'18px', cursor:'pointer'}}>+</button>
          <span style={{fontSize:'13px', color:'var(--ink-dim)'}}>/1,000 pages</span>

          <div style={{marginLeft:'24px'}}>
            <div style={{fontSize:'32px', fontWeight:800, color:'var(--brand)', letterSpacing:'-0.02em', lineHeight:1.1}}>
              ₩{fmt(Math.round(krwRevenue))}
            </div>
            <div style={{fontSize:'12px', color:'var(--ink-dim)', marginTop:'2px'}}>
              {baseLabel} · {fmt(baseCount)}건 × ₩{perReqKrw.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 결과 4타일 (어두운 배경) */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px'}}>
          <ResultTile label="예상 수익 (KRW)" val={`₩${fmt(Math.round(krwRevenue))}`} color="#1aa377"/>
          <ResultTile label="건당 단가"        val={`₩${perReqKrw.toFixed(2)}`}                color="#fff"/>
          <ResultTile label="예상 수익 (USD)" val={`$${usdRevenue.toFixed(2)}`}                color="#fff"/>
          <ResultTile label="기준 요청 수"     val={loading ? '—' : fmt(baseCount)}            color="#fff"/>
        </div>
      </div>

      <div className="panel" style={{background:'var(--pastel-blue)', borderColor:'var(--brand-soft)', fontSize:'13px', color:'var(--ink-2)', lineHeight:1.7}}>
        <strong>안내:</strong> &nbsp;
        이 계산은 임시 PREVIEW입니다. 정식 가격 정책은 GuardUs 운영팀과 협의 후 적용되며,
        채널별 단가 차등 설정은 추후 제공 예정입니다. 환율은 1 USD ≈ 1,300 KRW.
      </div>
    </>
  )
}

function ResultTile({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div style={{background:'var(--ink)', borderRadius:'10px', padding:'14px 16px'}}>
      <div style={{fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'rgba(255,255,255,.4)', marginBottom:'6px'}}>{label}</div>
      <div style={{fontSize:'18px', fontWeight:700, color, fontFamily:'var(--mono)'}}>{val}</div>
    </div>
  )
}
