'use client'

import { useEffect, useRef, useState } from 'react'
import { pathRules, type PathRule } from '@/lib/api'

const ACTIONS = [
  { key: 'allow',      label: 'allow',      color: '#1aa377', desc: '무료 통과' },
  { key: 'meter',      label: 'meter',      color: '#2b6df6', desc: '과금 (기본)' },
  { key: 'verify',     label: 'verify',     color: '#9d6bff', desc: 'rDNS/토큰 검증' },
  { key: 'token_only', label: 'token_only', color: '#f59e0b', desc: '토큰 필수' },
  { key: 'block',      label: 'block',      color: '#ef4444', desc: '차단' },
  { key: 'gone',       label: 'gone',       color: '#94a3b8', desc: '410 (SEO)' },
]

const ACTION_COLOR: Record<string, string> = Object.fromEntries(ACTIONS.map(a => [a.key, a.color]))

export default function RulesPage() {
  const [rules, setRules]     = useState<PathRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShow]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
  const patternRef = useRef<HTMLInputElement>(null)
  const actionRef  = useRef<HTMLSelectElement>(null)
  const noteRef    = useRef<HTMLInputElement>(null)

  async function load() {
    try { setRules(await pathRules.list()) }
    catch { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleSave() {
    const pattern = patternRef.current?.value.trim() ?? ''
    const action  = actionRef.current?.value ?? 'meter'
    const note    = noteRef.current?.value.trim() ?? ''
    if (!pattern) { setErr('패턴을 입력하세요.'); return }
    setSaving(true)
    setErr('')
    try {
      await pathRules.create(pattern, action, note)
      setShow(false)
      if (patternRef.current) patternRef.current.value = ''
      if (noteRef.current)    noteRef.current.value = ''
      load()
    } catch (e: unknown) { setErr((e as Error).message || '저장 실패') }
    finally { setSaving(false) }
  }

  async function toggleActive(r: PathRule) {
    try {
      await pathRules.update(r.id, { active: !r.active })
      setRules(rules.map(x => x.id === r.id ? { ...x, active: x.active ? 0 : 1 } : x))
    } catch (e: unknown) { alert((e as Error).message) }
  }

  async function changeAction(r: PathRule, action: string) {
    try {
      await pathRules.update(r.id, { action })
      setRules(rules.map(x => x.id === r.id ? { ...x, action } : x))
    } catch (e: unknown) { alert((e as Error).message) }
  }

  async function handleDelete(r: PathRule) {
    if (!confirm(`'${r.pattern}' 규칙을 삭제할까요?`)) return
    try {
      await pathRules.remove(r.id)
      setRules(rules.filter(x => x.id !== r.id))
    } catch (e: unknown) { alert((e as Error).message) }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>경로 규칙</h1>
          <div className="greeting">URL 패턴별로 허용·차단·과금을 설정합니다. 규칙은 60초마다 게이트웨이에 반영됩니다.</div>
        </div>
        <div className="right">
          <button className="btn" onClick={() => setShow(!showForm)}>+ 규칙 추가</button>
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <div style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap'}}>
            <div style={{flex:1, minWidth:'180px'}}>
              <label className="lbl">경로 패턴</label>
              <input ref={patternRef} className="inp mono" type="text" placeholder="/articles/*" />
            </div>
            <div style={{minWidth:'160px'}}>
              <label className="lbl">액션</label>
              <select ref={actionRef} className="inp" defaultValue="meter">
                {ACTIONS.map(a => <option key={a.key} value={a.key}>{a.label} — {a.desc}</option>)}
              </select>
            </div>
            <div style={{flex:1, minWidth:'140px'}}>
              <label className="lbl">메모 (선택)</label>
              <input ref={noteRef} className="inp" type="text" placeholder="설명" />
            </div>
            <div style={{display:'flex', gap:'8px'}}>
              <button className="btn" onClick={handleSave} disabled={saving}>{saving ? '저장중…' : '저장'}</button>
              <button className="btn ghost" onClick={() => setShow(false)}>취소</button>
            </div>
            {err && <div style={{fontSize:'12.5px', color:'var(--bad)', width:'100%', marginTop:'-4px'}}>{err}</div>}
          </div>
        </div>
      )}

      <div className="panel flush">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>패턴</th>
                <th>액션</th>
                <th>메모</th>
                <th>상태</th>
                <th style={{textAlign:'right'}}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : rules.length === 0 ? (
                <tr><td colSpan={5} style={{textAlign:'center', color:'var(--ink-mute)', padding:'40px'}}>규칙 없음 — 매칭되는 패턴이 없으면 봇 정책의 기본값을 따릅니다.</td></tr>
              ) : rules.map(r => {
                const color = ACTION_COLOR[r.action] ?? '#94a3b8'
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{fontSize:'12.5px', fontWeight:600}}>{r.pattern}</td>
                    <td>
                      <select value={r.action} onChange={e => changeAction(r, e.target.value)}
                        style={{
                          padding:'4px 8px', fontSize:'12px', fontWeight:700,
                          border:'1px solid var(--line)', borderRadius:'6px',
                          background: color + '15', color, fontFamily:'var(--mono)',
                        }}>
                        {ACTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                      </select>
                    </td>
                    <td style={{fontSize:'12.5px', color:'var(--ink-dim)'}}>{r.note || '—'}</td>
                    <td>
                      <button onClick={() => toggleActive(r)} className={`sdot ${r.active ? 'sdot-on' : 'sdot-off'}`}
                        style={{background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit'}}>
                        {r.active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td style={{textAlign:'right'}}>
                      <button className="btn ghost sm" onClick={() => handleDelete(r)} style={{color:'var(--bad)'}}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{background:'var(--pastel-blue)', borderColor:'var(--brand-soft)', fontSize:'13px', color:'var(--ink-2)', lineHeight:1.7}}>
        <strong>패턴 규칙:</strong> &nbsp;
        <code style={{background:'rgba(0,0,0,0.06)', padding:'1px 5px', borderRadius:'4px', fontFamily:'var(--mono)'}}>/admin/*</code> 형태로 뒤에
        <code style={{background:'rgba(0,0,0,0.06)', padding:'1px 5px', borderRadius:'4px', fontFamily:'var(--mono)', margin:'0 2px'}}>*</code>를 붙이면 하위 경로 전체에 적용됩니다.
        더 긴 패턴이 우선이며, 매칭되는 규칙이 없으면 봇 정책의 기본값(보통 <strong>meter</strong>)이 적용됩니다.
        악성 봇은 정책 무관 항상 차단됩니다.
      </div>
    </>
  )
}
