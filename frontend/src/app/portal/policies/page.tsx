'use client'

import { useEffect, useState } from 'react'
import { purposePolicies } from '@/lib/api'

const PURPOSES = [
  { key: 'ai_training',   label: 'AI 학습',         desc: 'GPTBot, ClaudeBot, Meta-ExternalAgent 등 — LLM 학습용' },
  { key: 'ai_search',     label: 'AI 검색',         desc: 'PerplexityBot, OAI-SearchBot — 검색 답변용' },
  { key: 'ai_assistant',  label: 'AI 어시스턴트',   desc: 'ChatGPT-User, DuckAssistBot — 사용자 요청 응답용' },
  { key: 'search_engine', label: '검색엔진',         desc: 'Googlebot, Bingbot, Naver Yeti' },
  { key: 'seo',           label: 'SEO 툴',          desc: 'SemrushBot, AhrefsBot, MJ12bot' },
  { key: 'social',        label: '소셜',            desc: 'Slackbot, Twitterbot, KakaoTalk-scrap' },
  { key: 'generic',       label: '기타 / 미분류',    desc: '카탈로그에 없는 봇 / generic crawler' },
]

const ACTIONS = [
  { key: 'pass',       label: 'pass',       color: '#94a3b8', desc: '그냥 통과' },
  { key: 'meter',      label: 'meter',      color: '#2b6df6', desc: '통과 + 과금' },
  { key: 'verify',     label: 'verify',     color: '#9d6bff', desc: 'rDNS 검증' },
  { key: 'token_only', label: 'token_only', color: '#f59e0b', desc: '토큰 필수' },
  { key: 'block',      label: 'block',      color: '#ef4444', desc: '차단 (403)' },
  { key: 'gone',       label: 'gone',       color: '#6b7280', desc: '410 (SEO 친화)' },
]

const ACTION_COLOR: Record<string, string> = Object.fromEntries(ACTIONS.map(a => [a.key, a.color]))

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)

  useEffect(() => {
    purposePolicies.list()
      .then(p => setPolicies(p ?? {}))
      .catch(() => setPolicies({}))
      .finally(() => setLoading(false))
  }, [])

  async function changeAction(purpose: string, action: string) {
    setSaving(purpose)
    try {
      await purposePolicies.update(purpose, action)
      setPolicies(p => ({ ...p, [purpose]: action }))
    } catch (e: unknown) { alert((e as Error).message) }
    finally { setSaving(null) }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>봇 정책</h1>
          <div className="greeting">봇 목적별 기본 액션을 설정합니다. 경로 규칙(<code style={{fontFamily:'var(--mono)', fontSize:'12px'}}>block</code>)은 정책보다 우선합니다.</div>
        </div>
      </div>

      <div className="panel flush">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>봇 목적</th>
                <th>설명</th>
                <th style={{width:'200px'}}>정책</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : PURPOSES.map(p => {
                const action = policies[p.key] ?? 'pass'
                const color = ACTION_COLOR[action] ?? '#94a3b8'
                return (
                  <tr key={p.key}>
                    <td style={{fontWeight:700}}>{p.label}</td>
                    <td style={{fontSize:'12.5px', color:'var(--ink-dim)'}}>{p.desc}</td>
                    <td>
                      <select value={action}
                        disabled={saving === p.key}
                        onChange={e => changeAction(p.key, e.target.value)}
                        style={{
                          padding:'6px 10px', fontSize:'12.5px', fontWeight:700,
                          border:'1px solid var(--line)', borderRadius:'8px',
                          background: color + '15', color, fontFamily:'var(--mono)',
                          width:'100%',
                        }}>
                        {ACTIONS.map(a => <option key={a.key} value={a.key}>{a.label} — {a.desc}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{background:'var(--pastel-lemon)', borderColor:'var(--warn)', fontSize:'13px', color:'var(--ink-2)', lineHeight:1.7}}>
        <strong>액션 설명:</strong>
        <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px 24px', marginTop:'8px'}}>
          {ACTIONS.map(a => (
            <div key={a.key}>
              <code style={{background:'rgba(0,0,0,0.06)', padding:'1px 5px', borderRadius:'4px', fontFamily:'var(--mono)', color:a.color, fontWeight:700}}>{a.label}</code>
              <span style={{marginLeft:'8px'}}>{a.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{background:'var(--pastel-rose)', borderColor:'var(--bad)', fontSize:'12.5px', color:'var(--ink-2)', lineHeight:1.6}}>
        ⚠️ 봇 정책은 <strong>모든 채널 공통</strong>으로 적용됩니다. 개별 채널 단위 정책은 추후 제공될 예정입니다.
      </div>
    </>
  )
}
