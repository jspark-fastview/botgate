'use client'

import { useEffect, useState } from 'react'
import { myTokens, type Token } from '@/lib/api'

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    myTokens()
      .then(setTokens)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <style>{`
        .panel-0 { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 0; overflow: hidden; }
        .tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .tbl th {
          padding: 10px 14px; text-align: left;
          font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ink-mute); background: var(--bg-soft); border-bottom: 1px solid var(--line);
        }
        .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: middle; }
        .tbl tr:last-child td { border-bottom: none; }
        .tbl tr:hover td { background: var(--bg-soft); }
        .mono { font-family: var(--mono); font-size: 12px; color: var(--ink-dim); }
        .sdot { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
        .sdot::before { content:''; display:inline-block; width:7px; height:7px; border-radius:50%; }
        .sdot-on::before  { background: var(--ok); }
        .sdot-off::before { background: var(--ink-mute); }
        .badge { font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; }
        .badge-free { background: var(--pastel-mint); color: var(--ok); }
        .badge-paid { background: var(--brand-soft); color: var(--brand); }
      `}</style>

      <div style={{marginBottom:'28px'}}>
        <h1 style={{fontSize:'28px', fontWeight:800, letterSpacing:'-0.02em', margin:0, color:'var(--ink)'}}>내 토큰</h1>
        <div style={{fontSize:'14px', color:'var(--ink-dim)', marginTop:'4px'}}>내 계정에 연결된 API 토큰입니다.</div>
      </div>

      <div className="panel-0">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>소유자</th>
                <th>플랜</th>
                <th>토큰</th>
                <th>만료일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : tokens.length === 0 ? (
                <tr><td colSpan={5} style={{textAlign:'center', color:'var(--ink-mute)', padding:'32px'}}>발급된 토큰이 없어요. 관리자에게 문의하세요.</td></tr>
              ) : tokens.map(t => (
                <tr key={t.id}>
                  <td style={{fontWeight:600}}>{t.owner ?? '—'}</td>
                  <td>
                    <span className={`badge ${t.plan === 'paid' ? 'badge-paid' : 'badge-free'}`}>
                      {t.plan ?? 'free'}
                    </span>
                  </td>
                  <td className="mono">{t.token}</td>
                  <td style={{fontSize:'13px', color:'var(--ink-dim)'}}>
                    {t.expires_at ? t.expires_at.slice(0, 10) : '—'}
                  </td>
                  <td>
                    <span className={`sdot ${t.active ? 'sdot-on' : 'sdot-off'}`}>
                      {t.active ? '활성' : '비활성'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
