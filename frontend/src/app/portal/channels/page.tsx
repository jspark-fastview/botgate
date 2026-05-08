'use client'

import { useEffect, useRef, useState } from 'react'
import {
  myChannels, dashboard, createChannel, updateChannel, deleteChannel, checkDns,
  fmt,
  type Channel, type ChannelStat, type DnsCheckResult,
} from '@/lib/api'

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, ChannelStat>>({})
  const [dnsMap,   setDnsMap]   = useState<Record<string, DnsCheckResult>>({})
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')
  const nameRef     = useRef<HTMLInputElement>(null)
  const domainRef   = useRef<HTMLInputElement>(null)
  const upstreamRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const [chs, dash] = await Promise.all([myChannels(), dashboard()])
      setChannels(chs)
      setStatsMap(Object.fromEntries(dash.stats.map(s => [s.domain, s])))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openForm() {
    setShowForm(true)
    setFormErr('')
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  function closeForm() {
    setShowForm(false)
    setFormErr('')
    if (nameRef.current)     nameRef.current.value = ''
    if (domainRef.current)   domainRef.current.value = ''
    if (upstreamRef.current) upstreamRef.current.value = ''
  }

  async function handleSave() {
    const name     = nameRef.current?.value.trim() ?? ''
    const domain   = domainRef.current?.value.trim() ?? ''
    const upstream = upstreamRef.current?.value.trim() ?? ''
    if (!name || !domain || !upstream) { setFormErr('모든 항목을 입력하세요.'); return }
    if (!/^https?:\/\/.+/.test(upstream)) { setFormErr('업스트림 URL은 http:// 또는 https://로 시작해야 해요.'); return }
    setSaving(true)
    setFormErr('')
    try {
      await createChannel(name, domain, upstream)
      closeForm()
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFormErr(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Channel) {
    try {
      await updateChannel(c.id, { active: !c.active })
      setChannels(channels.map(ch => ch.id === c.id ? { ...ch, active: ch.active ? 0 : 1 } : ch))
    } catch (err: unknown) { alert((err as Error).message || '변경 실패') }
  }

  async function handleDelete(c: Channel) {
    if (!confirm(`'${c.name}' 채널을 삭제할까요?`)) return
    try {
      await deleteChannel(c.id)
      setChannels(channels.filter(ch => ch.id !== c.id))
    } catch (err: unknown) { alert((err as Error).message || '삭제 실패') }
  }

  async function handleDns(c: Channel) {
    setDnsMap(m => ({ ...m, [c.id]: { domain: c.domain, status: 'checking' } }))
    try {
      const res = await checkDns(c.id)
      setDnsMap(m => ({ ...m, [c.id]: res }))
    } catch (err: unknown) {
      setDnsMap(m => ({ ...m, [c.id]: { domain: c.domain, status: 'error', message: (err as Error).message } }))
    }
  }

  function dnsBadge(c: Channel) {
    const r = dnsMap[c.id]
    if (!r) return <button className="csv-btn" onClick={() => handleDns(c)}>DNS 확인</button>
    if (r.status === 'checking') return <span className="muted" style={{fontSize:'11px'}}>확인중…</span>
    if (r.status === 'ok')       return <span className="badge ok">정상</span>
    return <span className="badge bad" title={r.message ?? r.status}>{r.status}</span>
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>내 채널</h1>
          <div className="greeting">AI 봇 트래픽을 받을 사이트를 등록하세요.</div>
        </div>
        <div className="right">
          <button className="btn" onClick={openForm}>+ 채널 추가</button>
        </div>
      </div>

      {showForm && (
        <div className="panel" style={{marginBottom:'16px'}}>
          <div style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap'}}>
            <div style={{flex:1, minWidth:'140px'}}>
              <label className="lbl">채널 이름</label>
              <input ref={nameRef} className="inp" type="text" placeholder="내 뉴스 사이트" />
            </div>
            <div style={{flex:1, minWidth:'180px'}}>
              <label className="lbl">도메인</label>
              <input ref={domainRef} className="inp mono" type="text" placeholder="news.example.com" />
            </div>
            <div style={{flex:1, minWidth:'200px'}}>
              <label className="lbl">업스트림 URL</label>
              <input ref={upstreamRef} className="inp mono" type="text" placeholder="https://origin.example.com" />
            </div>
            <div style={{display:'flex', gap:'8px'}}>
              <button className="btn" onClick={handleSave} disabled={saving}>{saving ? '저장중…' : '저장'}</button>
              <button className="btn ghost" onClick={closeForm}>취소</button>
            </div>
            {formErr && <div style={{fontSize:'12.5px', color:'var(--bad)', width:'100%', marginTop:'-4px'}}>{formErr}</div>}
          </div>
        </div>
      )}

      <div className="panel flush">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>채널 이름</th>
                <th>도메인</th>
                <th>업스트림</th>
                <th style={{textAlign:'right'}}>요청</th>
                <th style={{textAlign:'right'}}>검증</th>
                <th style={{textAlign:'right'}}>차단</th>
                <th>DNS</th>
                <th>상태</th>
                <th style={{textAlign:'right'}}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : channels.length === 0 ? (
                <tr><td colSpan={9} style={{textAlign:'center', color:'var(--ink-mute)', padding:'40px'}}>등록된 채널이 없어요.</td></tr>
              ) : channels.map(c => {
                const s = statsMap[c.domain]
                return (
                  <tr key={c.id}>
                    <td style={{fontWeight:600}}>{c.name}</td>
                    <td className="mono">{c.domain}</td>
                    <td className="mono" style={{fontSize:'11.5px', color:'var(--ink-dim)', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={c.upstream}>{c.upstream}</td>
                    <td style={{textAlign:'right', fontWeight:700}}>{s ? fmt(Number(s.total)) : '—'}</td>
                    <td style={{textAlign:'right', color:'var(--ok)'}}>{s ? fmt(Number(s.verified)) : '—'}</td>
                    <td style={{textAlign:'right', color:'var(--bad)'}}>{s ? fmt(Number(s.blocked)) : '—'}</td>
                    <td>{dnsBadge(c)}</td>
                    <td>
                      <button onClick={() => toggleActive(c)} className={`sdot ${c.active ? 'sdot-on' : 'sdot-off'}`}
                        style={{background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit'}}>
                        {c.active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td style={{textAlign:'right'}}>
                      <button className="btn ghost sm" onClick={() => handleDelete(c)} style={{color:'var(--bad)', borderColor:'var(--line)'}}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
