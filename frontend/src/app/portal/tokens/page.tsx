'use client'

import { useEffect, useRef, useState } from 'react'
import { myTokens, issueToken, revokeToken, type Token } from '@/lib/api'

export default function TokensPage() {
  const [tokens, setTokens]   = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShow]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [issued, setIssued]   = useState<Token | null>(null)
  const ownerRef = useRef<HTMLInputElement>(null)
  const planRef  = useRef<HTMLSelectElement>(null)

  async function load() {
    try { setTokens(await myTokens()) }
    catch { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleIssue() {
    const owner = ownerRef.current?.value.trim() || ''
    const plan  = planRef.current?.value || 'default'
    if (!owner) { alert('소유자(봇 회사명)을 입력하세요.'); return }
    setSaving(true)
    try {
      const t = await issueToken(owner, plan)
      setIssued(t)
      setShow(false)
      if (ownerRef.current) ownerRef.current.value = ''
      load()
    } catch (err: unknown) { alert((err as Error).message || '발급 실패') }
    finally { setSaving(false) }
  }

  async function handleRevoke(t: Token) {
    if (!confirm(`'${t.owner}' 토큰을 폐기할까요?`)) return
    try {
      await revokeToken(t.id)
      setTokens(tokens.filter(x => x.id !== t.id))
    } catch (err: unknown) { alert((err as Error).message || '폐기 실패') }
  }

  function copyToken(t: string) {
    navigator.clipboard.writeText(t).then(() => alert('복사됨')).catch(() => {})
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>봇 토큰</h1>
          <div className="greeting">유료 콘텐츠 접근용 API 토큰을 발급/관리하세요.</div>
        </div>
        <div className="right">
          <button className="btn" onClick={() => setShow(!showForm)}>+ 토큰 발급</button>
        </div>
      </div>

      {issued && (
        <div className="panel" style={{background:'var(--brand-soft)', borderColor:'var(--brand)'}}>
          <div style={{fontSize:'13px', fontWeight:700, color:'var(--brand)', marginBottom:'8px'}}>✅ 발급 완료 — 지금 한 번만 표시됩니다</div>
          <div className="mono" style={{fontSize:'13px', wordBreak:'break-all', padding:'10px 12px', background:'#fff', border:'1px solid var(--line)', borderRadius:'8px'}}>{issued.token}</div>
          <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
            <button className="btn sm" onClick={() => copyToken(issued.token)}>복사</button>
            <button className="btn ghost sm" onClick={() => setIssued(null)}>닫기</button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="panel">
          <div style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap'}}>
            <div style={{flex:1, minWidth:'200px'}}>
              <label className="lbl">소유자 (봇 회사명)</label>
              <input ref={ownerRef} className="inp" type="text" placeholder="OpenAI / Anthropic / ..." />
            </div>
            <div style={{minWidth:'160px'}}>
              <label className="lbl">플랜</label>
              <select ref={planRef} className="inp" defaultValue="default">
                <option value="default">default</option>
                <option value="paid">paid</option>
                <option value="preview">preview (임시)</option>
              </select>
            </div>
            <div style={{display:'flex', gap:'8px'}}>
              <button className="btn" onClick={handleIssue} disabled={saving}>{saving ? '발급중…' : '발급'}</button>
              <button className="btn ghost" onClick={() => setShow(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel flush">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>소유자</th>
                <th>플랜</th>
                <th>토큰</th>
                <th>발급일</th>
                <th>상태</th>
                <th style={{textAlign:'right'}}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : tokens.length === 0 ? (
                <tr><td colSpan={6} style={{textAlign:'center', color:'var(--ink-mute)', padding:'40px'}}>발급된 토큰이 없어요.</td></tr>
              ) : tokens.map(t => (
                <tr key={t.id}>
                  <td style={{fontWeight:600}}>{t.owner ?? '—'}</td>
                  <td>
                    <span className={`badge ${t.plan === 'paid' ? 'brand' : t.plan === 'preview' ? 'warn' : 'ok'}`}>
                      {t.plan ?? 'default'}
                    </span>
                  </td>
                  <td className="mono" style={{fontSize:'11px', maxWidth:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={t.token}>{t.token}</td>
                  <td style={{fontSize:'12.5px', color:'var(--ink-dim)'}}>{(t.created_at ?? '').slice(0, 10)}</td>
                  <td><span className={`sdot ${t.active ? 'sdot-on' : 'sdot-off'}`}>{t.active ? '활성' : '폐기'}</span></td>
                  <td style={{textAlign:'right'}}>
                    {t.active === 1 && <button className="btn ghost sm" onClick={() => handleRevoke(t)} style={{color:'var(--bad)'}}>폐기</button>}
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
