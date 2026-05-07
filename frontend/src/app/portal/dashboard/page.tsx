'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { dashboard, fmt, type DashboardResponse } from '@/lib/api'

const BOT_COLORS = ['#2b6df6', '#9d6bff', '#ff7a5c', '#1aa377']

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const channels  = data?.channels ?? []
  const stats     = data?.stats    ?? []
  const statsMap  = Object.fromEntries(stats.map(s => [s.domain, s]))
  const totalReqs     = stats.reduce((a, b) => a + (b.total    ?? 0), 0)
  const totalVerified = stats.reduce((a, b) => a + (b.verified ?? 0), 0)
  const maxReqs = Math.max(...stats.map(s => s.total ?? 0), 1)

  return (
    <>
      <style>{`
        .kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 28px; }
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
        .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 16px; }
        .panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .panel-head h3 { font-size: 16px; font-weight: 700; margin: 0; color: var(--ink); }
        .panel-head .ph-sub { font-size: 13px; color: var(--ink-dim); }
        .panel-head .ph-right { margin-left: auto; }
        .dbar { height: 8px; background: var(--bg-soft); border-radius: 4px; overflow: hidden; margin-top: 4px; }
        .dbar-fill { height: 100%; border-radius: 4px; transition: width 400ms; }
        @media (max-width: 980px) { .kpis { grid-template-columns: 1fr 1fr; } }
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
          <div className="kl">검증된 요청</div>
          <div className="kv">{loading ? '…' : fmt(totalVerified)}</div>
          <div className="ks">유료 토큰 보유 봇</div>
        </div>
      </div>

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
              const s   = statsMap[c.domain] ?? { total: 0, verified: 0, bot_types: 0 }
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
                      <div style={{fontSize:'12px', color:'var(--ok)'}}>검증 {fmt(s.verified)}건</div>
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
    </>
  )
}
