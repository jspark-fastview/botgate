'use client'

import { useEffect, useRef, useState } from 'react'
import { myChannels, dashboard, createChannel, type Channel, type ChannelStat } from '@/lib/api'
import { fmt } from '@/lib/api'

export default function ChannelsPage() {
  const [channels, setChannels]     = useState<Channel[]>([])
  const [statsMap, setStatsMap]     = useState<Record<string, ChannelStat>>({})
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [formErr, setFormErr]       = useState('')
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

  return (
    <>
      <style>{`
        .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 16px; }
        .panel-0 { padding: 0; overflow: hidden; }
        .panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .panel-head h3 { font-size: 16px; font-weight: 700; margin: 0; color: var(--ink); }
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
        .add-form { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
        .add-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 140px; }
        .add-field label { font-size: 12px; color: var(--ink-dim); font-weight: 600; }
        .add-field input {
          padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px;
          font-size: 13px; font-family: var(--sans); outline: none;
        }
        .add-field input:focus { border-color: var(--brand); }
        .form-err { font-size: 12.5px; color: var(--bad); width: 100%; margin-top: -4px; }
      `}</style>

      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'16px', marginBottom:'28px'}}>
        <div>
          <h1 style={{fontSize:'28px', fontWeight:800, letterSpacing:'-0.02em', margin:0, color:'var(--ink)'}}>내 채널</h1>
          <div style={{fontSize:'14px', color:'var(--ink-dim)', marginTop:'4px'}}>AI 봇 트래픽을 받을 내 사이트를 등록하세요.</div>
        </div>
        <button className="btn" style={{flexShrink:0}} onClick={openForm}>+ 채널 추가</button>
      </div>

      {showForm && (
        <div className="panel" style={{marginBottom:'16px'}}>
          <div className="add-form">
            <div className="add-field" style={{minWidth:'140px'}}>
              <label>채널 이름</label>
              <input ref={nameRef} type="text" placeholder="내 뉴스 사이트" />
            </div>
            <div className="add-field" style={{minWidth:'180px'}}>
              <label>도메인</label>
              <input ref={domainRef} type="text" placeholder="news.example.com" style={{fontFamily:'var(--mono)'}} />
            </div>
            <div className="add-field" style={{minWidth:'200px'}}>
              <label>업스트림 URL</label>
              <input ref={upstreamRef} type="text" placeholder="http://origin.example.com" style={{fontFamily:'var(--mono)'}} />
            </div>
            <div style={{display:'flex', gap:'8px'}}>
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saving ? '저장중…' : '저장'}
              </button>
              <button className="btn" style={{background:'#fff', color:'var(--ink-2)'}} onClick={closeForm}>취소</button>
            </div>
            {formErr && <div className="form-err">{formErr}</div>}
          </div>
        </div>
      )}

      <div className="panel panel-0">
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>채널 이름</th>
                <th>도메인</th>
                <th>업스트림 URL</th>
                <th style={{textAlign:'right'}}>총 요청</th>
                <th style={{textAlign:'right'}}>검증</th>
                <th style={{textAlign:'right'}}>차단</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{textAlign:'center', color:'var(--ink-mute)', padding:'24px'}}>로딩중…</td></tr>
              ) : channels.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center', color:'var(--ink-mute)', padding:'32px'}}>등록된 채널이 없어요.</td></tr>
              ) : channels.map(c => {
                const s = statsMap[c.domain]
                return (
                  <tr key={c.id}>
                    <td style={{fontWeight:600}}>{c.name}</td>
                    <td className="mono">{c.domain}</td>
                    <td className="mono" style={{fontSize:'12px', color:'var(--ink-dim)'}}>{c.upstream}</td>
                    <td style={{textAlign:'right', fontWeight:700}}>{s ? fmt(s.total) : '—'}</td>
                    <td style={{textAlign:'right', color:'var(--ok)'}}>{s ? fmt(s.verified) : '—'}</td>
                    <td style={{textAlign:'right', color:'#ef4444'}}>{s ? fmt(s.blocked) : '—'}</td>
                    <td>
                      <span className={`sdot ${c.active ? 'sdot-on' : 'sdot-off'}`}>
                        {c.active ? '활성' : '비활성'}
                      </span>
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
