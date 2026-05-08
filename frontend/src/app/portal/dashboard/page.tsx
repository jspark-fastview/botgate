'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { dashboard, fmt, type DashboardResponse } from '@/lib/api'

const BOT_COLORS = ['#2b6df6', '#9d6bff', '#ff7a5c', '#1aa377']

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
  seo:           '#ef4444',
  social:        '#ec4899',
  generic:       '#94a3b8',
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const channels      = data?.channels  ?? []
  const stats         = data?.stats     ?? []
  const purposes      = data?.purposes  ?? []
  const statsMap      = Object.fromEntries(stats.map(s => [s.domain, s]))
  const totalReqs     = stats.reduce((a, b) => a + (b.total    ?? 0), 0)
  const totalVerified = stats.reduce((a, b) => a + (b.verified ?? 0), 0)
  const totalBlocked  = stats.reduce((a, b) => a + (b.blocked  ?? 0), 0)
  const maxReqs       = Math.max(...stats.map(s => s.total ?? 0), 1)
  const maxPurpose    = Math.max(...purposes.map(p => p.total), 1)

  return (
    <>
      <style>{`
        .kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 28px; }
        .kpi {
          background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg);
          padding: 22px 24px; position: relative; overflow: hidden;
        }
        .kpi.accent { background: var(--brand); color: #fff; border-color: var(--brand); }
        .kpi.accent .kl, .kpi.accent .ks { color: rgba(255,255,255,.85); }
        .kl { font-size: 13px; color: var(--ink-dim); font-weight: 500; margin-bottom: 8px; }
        .kv { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
        .ks { font-size: 12.5px; color: var(--ink-dim); margin-top: 8px; }
        .k-icon {
          position: absolute; top: 18px; right: 18px;
          width: 38px; height: 38px; border-radius: 12px;
          background: var(--brand-soft); color: var(--brand);
          display: flex; align-items: center; justify-content: center;
        }
        .kpi.accent .k-icon { background: rgba(255,255,255,.18); color: #fff; }
        .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 24px; }
        .panel.full { grid-column: 1 / -1; }
        .panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .panel-head h3 { font-size: 16px; font-weight: 700; margin: 0; color: var(--ink); }
        .panel-head .ph-sub { font-size: 13px; color: var(--ink-dim); }
        .panel-head .ph-right { margin-left: auto; }
        .dbar { height: 8px; background: var(--bg-soft); border-radius: 4px; overflow: hidden; margin-top: 4px; }
        .dbar-fill { height: 100%; border-radius: 4px; transition: width 400ms; }
        .prow { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .ptag { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
        .pbar-wrap { flex: 1; }
        .pbar { height: 6px; background: var(--bg-soft); border-radius: 3px; overflow: hidden; }
        .pbar-fill { height: 100%; border-radius: 3px; transition: width 400ms; }
        .pval { font-size: 13px; font-weight: 700; color: var(--ink); min-width: 50px; text-align: right; }
        @media (max-width: 980px) { .kpis { grid-template-columns: 1fr 1fr; } .panels { grid-template-columns: 1fr; } .panel.full { grid-column: auto; } }
        @media (max-width: 600px) { .kpis { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{display:'flex', alignItems:'center', gap:'16px', marginBottom:'28px'}}>
        <div>
          <h1 style={{fontSize:'28px', fontWeight:800, letterSpacing:'-0.02em', margin:0, color:'var(--ink)'}}>내 대시보드</h1>
          <div style={{fontSize:'14px', color:'var(--ink-dim)', marginTop:'4px'}}>내 채널의 AI 봇 트래픽 현황입니다.</div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi accent">
          <div className="k-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
            </svg>
          </div>
          <div className="kl">등록 채널</div>
          <div className="kv">{loading ? '…' : `${channels.length}개`}</div>
          <div className="ks">내 사이트 수</div>
        </div>
        <div className="kpi">
          <div className="k-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
              <path d="M12 7v5l3 2"/>
            </svg>
          </div>
          <div className="kl">총 봇 요청</div>
          <div className="kv">{loading ? '…' : fmt(totalReqs)}</div>
          <div className="ks">누적</div>
        </div>
        <div className="kpi">
          <div className="k-icon" style={{background:'var(--pastel-mint)', color:'var(--ok)'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div className="kl">검증된 봇</div>
          <div className="kv">{loading ? '…' : fmt(totalVerified)}</div>
          <div className="ks">토큰 보유</div>
        </div>
        <div className="kpi">
          <div className="k-icon" style={{background:'#fef2f2', color:'#ef4444'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div className="kl">차단된 요청</div>
          <div className="kv">{loading ? '…' : fmt(totalBlocked)}</div>
          <div className="ks">정책에 의해 차단</div>
        </div>
      </div>

      <div className="panels">
        {/* 채널별 현황 */}
        <div className="panel">
          <div className="panel-head">
            <h3>채널별 현황</h3>
            <span className="ph-sub">내 사이트 요약</span>
            <div className="ph-right">
              <Link href="/portal/channels" style={{fontSize:'13px', color:'var(--brand)', fontWeight:600}}>
                채널 관리 →
              </Link>
            </div>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', fontSize:'14px', textAlign:'center', padding:'40px 0'}}>로딩중…</div>
          ) : channels.length === 0 ? (
            <div style={{textAlign:'center', padding:'40px 0'}}>
              <div style={{fontSize:'40px', marginBottom:'12px'}}>🌐</div>
              <div style={{fontSize:'15px', fontWeight:700, color:'var(--ink)', marginBottom:'6px'}}>등록된 채널이 없어요</div>
              <div style={{fontSize:'13px', color:'var(--ink-dim)'}}>
                <Link href="/portal/channels" style={{color:'var(--brand)', fontWeight:600}}>내 채널</Link> 탭에서 사이트를 추가해보세요.
              </div>
            </div>
          ) : (
            <div>
              {channels.map((c, i) => {
                const s   = statsMap[c.domain] ?? { total: 0, verified: 0, blocked: 0, bot_types: 0 }
                const pct = Math.round((s.total ?? 0) / maxReqs * 100)
                const color = BOT_COLORS[i % BOT_COLORS.length]
                return (
                  <div key={c.id} style={{marginBottom:'20px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <div style={{
                          width:'32px', height:'32px', borderRadius:'10px', background:color,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontWeight:800, fontSize:'14px', color:'#fff',
                        }}>
                          {c.name[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{fontSize:'14px', fontWeight:700, color:'var(--ink)'}}>{c.name}</div>
                          <div style={{fontSize:'11px', fontFamily:'var(--mono)', color:'var(--ink-mute)'}}>{c.domain}</div>
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:'14px', fontWeight:700, color:'var(--ink)'}}>{fmt(s.total)}건</div>
                        <div style={{fontSize:'12px', color:'var(--ok)'}}>검증 {fmt(s.verified)}</div>
                        {(s.blocked ?? 0) > 0 && <div style={{fontSize:'12px', color:'#ef4444'}}>차단 {fmt(s.blocked)}</div>}
                      </div>
                    </div>
                    <div className="dbar">
                      <div className="dbar-fill" style={{width:`${pct}%`, background:color}}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 봇 목적별 비중 */}
        <div className="panel">
          <div className="panel-head">
            <h3>봇 목적별 분류</h3>
            <span className="ph-sub">누적 요청 기준</span>
          </div>
          {loading ? (
            <div style={{color:'var(--ink-mute)', fontSize:'14px', textAlign:'center', padding:'40px 0'}}>로딩중…</div>
          ) : purposes.length === 0 ? (
            <div style={{color:'var(--ink-mute)', fontSize:'14px', textAlign:'center', padding:'40px 0'}}>데이터 없음</div>
          ) : (
            <div>
              {purposes.map(p => {
                const pct   = Math.round(p.total / maxPurpose * 100)
                const label = PURPOSE_LABEL[p.bot_purpose] ?? p.bot_purpose
                const color = PURPOSE_COLOR[p.bot_purpose] ?? '#94a3b8'
                return (
                  <div key={p.bot_purpose} className="prow">
                    <span className="ptag" style={{background:color+'20', color}}>{label}</span>
                    <div className="pbar-wrap">
                      <div className="pbar">
                        <div className="pbar-fill" style={{width:`${pct}%`, background:color}}></div>
                      </div>
                    </div>
                    <span className="pval">{fmt(p.total)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
