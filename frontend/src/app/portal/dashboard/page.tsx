'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  dashboard, myStats, myTokens, fmt,
  type DashboardResponse, type CategoryStats, type DailyRow,
  type BotRow, type PurposeRow, type MaliciousRow, type Token,
} from '@/lib/api'
import ChannelSelector from '@/components/ChannelSelector'

const PURPOSE_LABEL: Record<string, string> = {
  ai_training:   'AI 학습',
  ai_search:     'AI 검색',
  ai_assistant:  'AI 어시스턴트',
  search_engine: '검색엔진',
  seo:           'SEO 툴',
  social:        '소셜',
  generic:       '기타',
}

const PURPOSE_COLOR: Record<string, string> = {
  ai_training:   '#2b6df6',
  ai_search:     '#9d6bff',
  ai_assistant:  '#1aa377',
  search_engine: '#f59e0b',
  seo:           '#ff7a5c',
  social:        '#ec4899',
  generic:       '#94a3b8',
}

interface State {
  dash:      DashboardResponse | null
  category:  CategoryStats     | null
  daily:     DailyRow[]
  botsAi:    BotRow[]
  botsOther: BotRow[]
  purpose:   PurposeRow[]
  malicious: MaliciousRow[]
  tokens:    Token[]
}

export default function DashboardPage() {
  const [channel, setChannel] = useState('')
  const [s, setS] = useState<State>({
    dash: null, category: null, daily: [], botsAi: [], botsOther: [], purpose: [], malicious: [], tokens: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const d = channel || undefined
    Promise.all([
      dashboard().catch(() => null),
      myStats.category(d).catch(() => null),
      myStats.daily(30, d).catch(() => []),
      myStats.bots('bot', 5, d).catch(() => []),
      myStats.bots('other_bot', 5, d).catch(() => []),
      myStats.purpose(d).catch(() => []),
      myStats.malicious(d).catch(() => []),
      myTokens().catch(() => []),
    ]).then(([dash, category, daily, botsAi, botsOther, purpose, malicious, tokens]) => {
      setS({
        dash,
        category,
        daily:     daily ?? [],
        botsAi:    botsAi ?? [],
        botsOther: botsOther ?? [],
        purpose:   purpose ?? [],
        malicious: malicious ?? [],
        tokens:    tokens ?? [],
      })
      setLoading(false)
    })
  }, [channel])

  const c           = s.category ?? { malicious: 0, bot: 0, other_bot: 0, user: 0 }
  const activeTok   = s.tokens.filter(t => t.active === 1).length
  const previewTok  = s.tokens.filter(t => t.plan === 'preview').length
  const maxPurpose  = Math.max(...s.purpose.map(p => Number(p.count)), 1)
  const maxBotsAi   = Math.max(...s.botsAi.map(b => Number(b.count)), 1)
  const maxBotsOth  = Math.max(...s.botsOther.map(b => Number(b.count)), 1)

  // ── Daily trend → SVG path ─────────────────────────────────────────────
  const dailyMap: Record<string, Record<string, number>> = {}
  s.daily.forEach(r => {
    if (!dailyMap[r.date]) dailyMap[r.date] = {}
    dailyMap[r.date][r.category] = Number(r.count)
  })
  const dates = Object.keys(dailyMap).sort()
  const series = dates.map(d => ({
    date:      d,
    bot:       dailyMap[d].bot       ?? 0,
    other_bot: dailyMap[d].other_bot ?? 0,
    user:      dailyMap[d].user      ?? 0,
    malicious: dailyMap[d].malicious ?? 0,
  }))
  const dailyMax = Math.max(1, ...series.map(d => d.bot + d.other_bot + d.user + d.malicious))

  return (
    <>
      <style>{`
        .kpis { display: grid; grid-template-columns: repeat(5,1fr); gap: 14px; margin-bottom: 24px; }
        .kpi {
          background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg);
          padding: 18px 20px; position: relative; overflow: hidden;
        }
        .kpi.accent { background: var(--brand); color: #fff; border-color: var(--brand); }
        .kpi.accent .kl, .kpi.accent .ks { color: rgba(255,255,255,.85); }
        .kl { font-size: 12px; color: var(--ink-dim); font-weight: 500; margin-bottom: 6px; }
        .kv { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
        .ks { font-size: 11.5px; color: var(--ink-dim); margin-top: 6px; }

        .panels { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
        .panels-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 22px; }
        .panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .panel-head h3 { font-size: 15px; font-weight: 700; margin: 0; color: var(--ink); }
        .panel-head .ph-sub { font-size: 12.5px; color: var(--ink-dim); }

        .prow { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .ptag { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; white-space: nowrap; min-width: 90px; text-align: center; }
        .pbar-wrap { flex: 1; }
        .pbar { height: 6px; background: var(--bg-soft); border-radius: 3px; overflow: hidden; }
        .pbar-fill { height: 100%; border-radius: 3px; transition: width 400ms; }
        .pval { font-size: 12.5px; font-weight: 700; color: var(--ink); min-width: 50px; text-align: right; }

        .botrow { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
        .botrow:last-child { border-bottom: none; }
        .botname { font-family: var(--mono); font-size: 12px; color: var(--ink-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .botcnt { font-size: 13px; font-weight: 700; color: var(--ink); }

        .mal-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom: 1px dashed var(--line); font-size:13px; }
        .mal-row:last-child { border-bottom: none; }
        .mal-name { font-weight: 600; color: var(--bad); }

        @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3,1fr); } .panels { grid-template-columns: 1fr; } .panels-2 { grid-template-columns: 1fr; } }
        @media (max-width: 600px)  { .kpis { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <div className="greeting">내 채널 봇 트래픽 현황을 실시간으로 확인하세요.</div>
        </div>
        <div className="right">
          <ChannelSelector value={channel} onChange={setChannel} />
        </div>
      </div>

      {/* ── KPI 5개 ───────────────────────────────────────── */}
      <div className="kpis">
        <div className="kpi accent">
          <div className="kl">AI 봇 요청</div>
          <div className="kv">{loading ? '…' : fmt(Number(c.bot))}</div>
          <div className="ks">학습/검색/어시스턴트</div>
        </div>
        <div className="kpi">
          <div className="kl">기타 봇</div>
          <div className="kv">{loading ? '…' : fmt(Number(c.other_bot))}</div>
          <div className="ks">검색엔진/SEO/소셜</div>
        </div>
        <div className="kpi">
          <div className="kl">차단된 악성</div>
          <div className="kv" style={{color:'var(--bad)'}}>{loading ? '…' : fmt(Number(c.malicious))}</div>
          <div className="ks">즉시 403</div>
        </div>
        <div className="kpi">
          <div className="kl">활성 토큰</div>
          <div className="kv">{loading ? '…' : fmt(activeTok)}</div>
          <div className="ks">발급된 유료 토큰</div>
        </div>
        <div className="kpi">
          <div className="kl">임시 토큰</div>
          <div className="kv">{loading ? '…' : fmt(previewTok)}</div>
          <div className="ks">PREVIEW 플랜</div>
        </div>
      </div>

      {/* ── 일별 추이 + 봇 목적별 비중 ─────────────────────── */}
      <div className="panels">
        <div className="panel">
          <div className="panel-head">
            <h3>일별 추이</h3>
            <span className="ph-sub">최근 30일 — 카테고리별 누적</span>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'40px 0'}}>로딩중…</div>
          ) : series.length === 0 ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'40px 0'}}>데이터 없음</div>
          ) : (
            <DailyChart series={series} max={dailyMax} />
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>봇 목적별</h3>
            <span className="ph-sub">누적</span>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'40px 0'}}>로딩중…</div>
          ) : s.purpose.length === 0 ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'40px 0'}}>데이터 없음</div>
          ) : s.purpose.map(p => {
            const pct   = Math.round(Number(p.count) / maxPurpose * 100)
            const label = PURPOSE_LABEL[p.bot_purpose] ?? p.bot_purpose
            const color = PURPOSE_COLOR[p.bot_purpose] ?? '#94a3b8'
            return (
              <div key={p.bot_purpose} className="prow">
                <span className="ptag" style={{background:color+'20', color}}>{label}</span>
                <div className="pbar-wrap"><div className="pbar"><div className="pbar-fill" style={{width:`${pct}%`, background:color}}/></div></div>
                <span className="pval">{fmt(Number(p.count))}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── AI 봇 TOP5 + 기타 봇 TOP5 ─────────────────── */}
      <div className="panels-2">
        <div className="panel">
          <div className="panel-head">
            <h3>AI 봇별 요청 (TOP 5)</h3>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>로딩중…</div>
          ) : s.botsAi.length === 0 ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>데이터 없음</div>
          ) : s.botsAi.map(b => {
            const pct = Math.round(Number(b.count) / maxBotsAi * 100)
            return (
              <div key={b.bot_ua} className="botrow">
                <span className="botname" title={b.bot_ua}>{b.bot_ua || '(이름 없음)'}</span>
                <div style={{width:'90px'}}><div className="pbar"><div className="pbar-fill" style={{width:`${pct}%`, background:'#2b6df6'}}/></div></div>
                <span className="botcnt">{fmt(Number(b.count))}</span>
              </div>
            )
          })}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>기타 봇 요청 (TOP 5)</h3>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>로딩중…</div>
          ) : s.botsOther.length === 0 ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>데이터 없음</div>
          ) : s.botsOther.map(b => {
            const pct = Math.round(Number(b.count) / maxBotsOth * 100)
            return (
              <div key={b.bot_ua} className="botrow">
                <span className="botname" title={b.bot_ua}>{b.bot_ua || '(이름 없음)'}</span>
                <div style={{width:'90px'}}><div className="pbar"><div className="pbar-fill" style={{width:`${pct}%`, background:'#1aa377'}}/></div></div>
                <span className="botcnt">{fmt(Number(b.count))}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 채널별 + 악성 봇 ──────────────────────────────── */}
      <div className="panels-2">
        <div className="panel">
          <div className="panel-head">
            <h3>채널별 요약</h3>
            <span className="ph-sub">내 사이트</span>
            <div style={{marginLeft:'auto'}}>
              <Link href="/portal/channels" style={{fontSize:'12.5px', color:'var(--brand)', fontWeight:600}}>관리 →</Link>
            </div>
          </div>
          {(s.dash?.channels ?? []).length === 0 ? (
            <div style={{textAlign:'center', padding:'30px 0', color:'var(--ink-mute)'}}>채널 없음</div>
          ) : (s.dash?.channels ?? []).map(ch => {
            const stat = (s.dash?.stats ?? []).find(st => st.domain === ch.domain)
            const total = Number(stat?.total ?? 0)
            const verified = Number(stat?.verified ?? 0)
            const blocked = Number(stat?.blocked ?? 0)
            return (
              <div key={ch.id} className="botrow">
                <div style={{flex:1}}>
                  <div style={{fontSize:'13.5px', fontWeight:700}}>{ch.name}</div>
                  <div style={{fontFamily:'var(--mono)', fontSize:'11px', color:'var(--ink-mute)'}}>{ch.domain}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'13px', fontWeight:700}}>{fmt(total)}</div>
                  <div style={{fontSize:'11px', color:'var(--ok)'}}>검증 {fmt(verified)}{blocked > 0 ? ` · 차단 ${fmt(blocked)}` : ''}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>악성 봇 차단</h3>
            <span className="ph-sub">최근 활동</span>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>로딩중…</div>
          ) : s.malicious.length === 0 ? (
            <div style={{color:'var(--ink-mute)', textAlign:'center', padding:'30px 0'}}>차단 이력 없음</div>
          ) : s.malicious.slice(0, 6).map((m, i) => (
            <div key={i} className="mal-row">
              <span className="mal-name">{m.bot_name || '(이름 없음)'}</span>
              <span style={{color:'var(--ink-dim)', fontSize:'12px'}}>{fmt(Number(m.count))}회</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Stacked area chart (SVG) ─────────────────────────────────────────────
function DailyChart({ series, max }: { series: Array<{ date: string; bot: number; other_bot: number; user: number; malicious: number }>, max: number }) {
  const W = 600, H = 200, P = 28
  const innerW = W - P * 2
  const innerH = H - P * 2
  const n = series.length
  if (n < 1) return null

  function x(i: number) { return P + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW) }
  function y(v: number) { return P + innerH - (v / max) * innerH }

  // stacked: malicious (bottom) → bot → other_bot → user
  const stacks = series.map(d => {
    const m = d.malicious
    const b = m + d.bot
    const ob = b + d.other_bot
    const u = ob + d.user
    return { m, b, ob, u, total: u }
  })

  function path(getY: (s: typeof stacks[number]) => number, baseY: (s: typeof stacks[number]) => number) {
    const top    = stacks.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(getY(s))}`).join(' ')
    const bottom = stacks.slice().reverse().map((s, i) => `L ${x(n - 1 - i)} ${y(baseY(s))}`).join(' ')
    return top + ' ' + bottom + ' Z'
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:'200px'}}>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={P} y1={y(max * f)} x2={W - P} y2={y(max * f)} stroke="#eef1f6" strokeWidth="1" />
      ))}
      <path d={path(s => s.m,  () => 0)}             fill="#ef4444" fillOpacity="0.6"/>
      <path d={path(s => s.b,  s => s.m)}            fill="#2b6df6" fillOpacity="0.7"/>
      <path d={path(s => s.ob, s => s.b)}            fill="#1aa377" fillOpacity="0.6"/>
      <path d={path(s => s.u,  s => s.ob)}           fill="#94a3b8" fillOpacity="0.4"/>

      {/* x-axis labels (every ~5th) */}
      {series.map((d, i) => {
        if (n > 10 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null
        return (
          <text key={i} x={x(i)} y={H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">
            {d.date.slice(5)}
          </text>
        )
      })}

      {/* legend */}
      <g transform={`translate(${P}, 8)`} fontSize="10" fill="#64748b">
        <rect x="0"  y="0" width="10" height="10" fill="#ef4444" fillOpacity="0.6"/><text x="14" y="9">악성</text>
        <rect x="50" y="0" width="10" height="10" fill="#2b6df6" fillOpacity="0.7"/><text x="64" y="9">AI 봇</text>
        <rect x="105" y="0" width="10" height="10" fill="#1aa377" fillOpacity="0.6"/><text x="119" y="9">기타 봇</text>
        <rect x="170" y="0" width="10" height="10" fill="#94a3b8" fillOpacity="0.4"/><text x="184" y="9">사용자</text>
      </g>
    </svg>
  )
}
