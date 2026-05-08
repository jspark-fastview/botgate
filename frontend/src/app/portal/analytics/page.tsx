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
        <PricingTab billing={billing} loading={loading} />
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

// ── 수익 계산기 (Pricing Calculator) ─────────────────────────────────
function PricingTab({ billing, loading }: { billing: BillingStats | null; loading: boolean }) {
  type Base = 'total' | 'billed' | 'month'

  const [base, setBase]   = useState<Base>('billed')
  const [price, setPrice] = useState(2)  // 건당 단가 (KRW)

  const total  = Number(billing?.total ?? 0)
  const billed = Number(billing?.billed ?? 0)
  // monthly estimate: simple — total ÷ 30일 가정
  const monthlyAvg = Math.round(total / 30 * 30) // (placeholder for monthly basis)

  const baseCount = base === 'total' ? total : base === 'billed' ? billed : monthlyAvg
  const monthly   = base === 'month' ? baseCount : baseCount * 30 / 30   // approx
  const totalRev  = baseCount * price

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>기준 데이터</h3>
          <span className="sub">계산 기준을 선택하세요</span>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px'}}>
          {[
            { key: 'total'  as const, l: '총 봇 요청',     v: total,  c: 'var(--ink)'   },
            { key: 'billed' as const, l: '과금 대상 (meter)', v: billed, c: 'var(--ok)'    },
            { key: 'month'  as const, l: '월 평균 추정',   v: monthlyAvg, c: 'var(--brand)' },
          ].map(b => (
            <button key={b.key} onClick={() => setBase(b.key)}
              style={{
                cursor:'pointer', textAlign:'left',
                border: `2px solid ${base === b.key ? 'var(--brand)' : 'var(--line)'}`,
                background: base === b.key ? 'var(--brand-soft)' : '#fff',
                borderRadius:'12px', padding:'14px 16px', transition:'all 150ms',
                fontFamily:'var(--sans)',
              }}>
              <div style={{fontSize:'12px', color:'var(--ink-dim)', marginBottom:'4px'}}>{b.l}</div>
              <div style={{fontSize:'26px', fontWeight:800, letterSpacing:'-0.02em', color: base === b.key ? 'var(--brand)' : b.c}}>
                {loading ? '…' : fmt(b.v)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>단가 입력</h3>
          <span className="sub">건당 단가(KRW)를 입력하면 예상 수익이 갱신됩니다</span>
        </div>
        <div style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap', marginBottom:'18px'}}>
          <div style={{flex:1, minWidth:'200px'}}>
            <label className="lbl">건당 단가 (₩)</label>
            <input
              type="number" min={0} step="0.5"
              value={price}
              onChange={e => setPrice(Math.max(0, Number(e.target.value) || 0))}
              className="inp"
              style={{fontSize:'18px', fontWeight:700}}
            />
          </div>
          <div style={{display:'flex', gap:'8px'}}>
            {[1, 2, 5, 10, 50, 100].map(p => (
              <button key={p}
                className={`purpose-pill${price === p ? ' active' : ''}`}
                style={price === p ? {background:'var(--brand)'} : {}}
                onClick={() => setPrice(p)}>
                ₩{p}
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px'}}>
          <div className="kpi">
            <div className="l">기준 요청 수</div>
            <div className="v">{loading ? '…' : fmt(baseCount)}</div>
            <div className="s">{base === 'total' ? '누적 전체' : base === 'billed' ? '과금 대상만' : '월 추정'}</div>
          </div>
          <div className="kpi accent">
            <div className="l">예상 수익</div>
            <div className="v">₩{fmt(totalRev)}</div>
            <div className="s">단가 × 기준 요청</div>
          </div>
          <div className="kpi">
            <div className="l">월 환산 (USD ≈)</div>
            <div className="v">${(monthly * price / 1300).toFixed(2)}</div>
            <div className="s">1 USD ≈ 1300 KRW</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{background:'var(--pastel-blue)', borderColor:'var(--brand-soft)'}}>
        <div style={{fontSize:'13px', color:'var(--ink-2)', lineHeight:1.7}}>
          <strong>안내:</strong> &nbsp; 이 계산은 임시 PREVIEW입니다. 정식 가격 정책은 GuardUs 운영팀과 협의 후 적용됩니다.
          기준 요청 수는 현재 누적된 access_log 기준이며, 채널별로 단가를 다르게 설정하는 기능은 추후 제공됩니다.
        </div>
      </div>
    </>
  )
}
