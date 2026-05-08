// Live log — JWT-aware event stream
const { useState: useStateL, useEffect: useEffectL, useRef: useRefL } = React;

const CAT_META = {
  paid:      { tag:'ok',   label:'PAID',      color:'var(--ok)'   },
  free:      { tag:'info', label:'FREE',      color:'var(--info)' },
  unauth:    { tag:'warn', label:'401',       color:'var(--warn)' },
  expired:   { tag:'warn', label:'EXPIRED',   color:'var(--warn)' },
  scope_miss:{ tag:'bad',  label:'403 SCOPE', color:'var(--bad)'  },
  rate:      { tag:'warn', label:'429',       color:'var(--warn)' },
  overage:   { tag:'warn', label:'402',       color:'var(--warn)' },
  fake:      { tag:'bad',  label:'FAKE',      color:'var(--bad)'  },
  malicious: { tag:'bad',  label:'MALICIOUS', color:'var(--bad)'  },
};

function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

function LogView() {
  const [events, setEvents] = useStateL(INITIAL_EVENTS);
  const [play, setPlay] = useStateL(true);
  const [filter, setFilter] = useStateL('all');
  const [sel, setSel] = useStateL(INITIAL_EVENTS[0]);
  const lastIdRef = useRefL(0);

  // 실 로그 폴링 (3초마다)
  useEffectL(() => {
    if (!play) return;
    const tick = async () => {
      try {
        const logs = await API.getLogs(50);
        if (!logs || !logs.length) return;
        const newLogs = logs
          .filter(l => l.id > lastIdRef.current)
          .map(l => ({
            id:     l.id,
            t:      new Date(l.ts + 'Z').getTime(),
            bot:    BOTS.find(b => l.bot_ua && l.bot_ua.includes(b.ua)) || { ua: l.bot_ua, vendor: l.bot_ua, color: 'var(--text-mute)' },
            domain: l.domain || 'unknown',
            ip:     l.ip,
            cat:    l.verified ? 'paid' : 'fake',
            token:  l.token,
          }));
        if (newLogs.length) {
          lastIdRef.current = Math.max(...newLogs.map(l => l.id));
          setEvents(e => [...newLogs, ...e].slice(0, 200));
        }
      } catch (_) {}
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [play]);

  const visible = filter === 'all' ? events : events.filter(e => e.cat === filter);

  return (
    <div style={{ padding:'20px 28px 60px', maxWidth:1600, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'flex-end', gap:20, marginBottom:16 }}>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)', letterSpacing:'0.08em' }}>TAIL · /var/log/botgate/access.jsonl</div>
          <h1 style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:600, margin:'4px 0 0', letterSpacing:'-0.01em' }}>botgate / live log</h1>
        </div>
        <span style={{ flex:1 }}></span>
        <div style={{ display:'flex', gap:2, padding:3, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
          {['all','paid','unauth','scope_miss','fake','malicious'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ appearance:'none', border:0, background: filter===f?'var(--bg-2)':'transparent',
                boxShadow: filter===f?'inset 0 0 0 1px var(--border-2)':'none',
                color: filter===f?'var(--text)':'var(--text-dim)',
                fontFamily:'var(--mono)', fontSize:11, padding:'5px 10px', borderRadius:2, cursor:'pointer' }}>{f}</button>
          ))}
        </div>
        <button className="btn ghost" onClick={() => setPlay(!play)}>
          {play ? <><Ic.Pause/>pause</> : <><Ic.Play/>play</>}
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr', gap:10 }}>
        <div className="card" style={{ padding:0, overflow:'hidden', height:'calc(100vh - 180px)', display:'flex', flexDirection:'column' }}>
          <div className="card-hd">
            <span style={{ width:7, height:7, background:play?'var(--ok)':'var(--text-mute)', borderRadius:'50%', boxShadow: play?'0 0 8px var(--ok)':'none', animation: play?'pulse 2s ease-in-out infinite':'none' }}></span>
            <span>stream · {visible.length} events</span>
            <span className="flex1"></span>
            <span style={{ color:'var(--text-mute)' }}>newest first</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'100px 100px 130px 130px 1fr 60px 70px', padding:'7px 14px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', gap:10 }}>
            <span>time</span><span>cat</span><span>ua</span><span>sub · token</span><span>uri</span><span style={{ textAlign:'right' }}>status</span><span style={{ textAlign:'right' }}>$</span>
          </div>
          <div style={{ flex:1, overflow:'auto' }}>
            {visible.map(e => {
              const m = CAT_META[e.cat];
              const isSel = sel && sel.id === e.id;
              return (
                <div key={e.id} onClick={() => setSel(e)}
                  style={{ display:'grid', gridTemplateColumns:'100px 100px 130px 130px 1fr 60px 70px',
                    padding:'7px 14px', borderBottom:'1px solid var(--border)',
                    fontFamily:'var(--mono)', fontSize:11.5, alignItems:'center', gap:10, cursor:'pointer',
                    background: isSel ? 'var(--bg-2)' : 'transparent',
                    borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent' }}>
                  <span style={{ color:'var(--text-mute)' }}>{fmtTime(e.time)}</span>
                  <span className={'tag ' + m.tag}>{m.label}</span>
                  <span style={{ color:'var(--text-dim)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.ua}</span>
                  <span style={{ color: e.sub?'var(--accent)':'var(--text-mute)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.sub || '—'}</span>
                  <span style={{ color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.uri}</span>
                  <span style={{ color: e.status<300?'var(--ok)':e.status<400?'var(--info)':'var(--bad)', textAlign:'right' }}>{e.status}</span>
                  <span style={{ color: e.cents>0?'var(--ok)':'var(--text-mute)', textAlign:'right' }}>
                    {e.cents>0 ? '¢'+e.cents.toFixed(2) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* detail */}
        <div className="card scope" style={{ padding:0, overflow:'hidden', alignSelf:'start' }}>
          <div className="card-hd">
            <span>event · detail</span>
            <span className="flex1"></span>
            {sel && <span className={'tag ' + CAT_META[sel.cat].tag}>{CAT_META[sel.cat].label}</span>}
          </div>
          {sel ? (
            <div style={{ padding:16, fontFamily:'var(--mono)', fontSize:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'90px 1fr', rowGap:8, columnGap:12, color:'var(--text-dim)' }}>
                <span style={{ color:'var(--text-mute)' }}>time</span><span style={{ color:'var(--text)' }}>{fmtTime(sel.time)}</span>
                <span style={{ color:'var(--text-mute)' }}>ip</span><span style={{ color:'var(--text)' }}>{sel.ip}</span>
                <span style={{ color:'var(--text-mute)' }}>ua</span><span style={{ color:'var(--text)' }}>{sel.ua}</span>
                <span style={{ color:'var(--text-mute)' }}>uri</span><span style={{ color:'var(--accent)' }}>{sel.uri}</span>
                <span style={{ color:'var(--text-mute)' }}>subscriber</span><span>{sel.sub || <em style={{ color:'var(--text-mute)' }}>none</em>}</span>
                <span style={{ color:'var(--text-mute)' }}>token</span><span>{sel.tok || <em style={{ color:'var(--text-mute)' }}>—</em>}</span>
                <span style={{ color:'var(--text-mute)' }}>status</span><span style={{ color: sel.status<300?'var(--ok)':'var(--bad)' }}>{sel.status}</span>
                <span style={{ color:'var(--text-mute)' }}>billed</span><span style={{ color: sel.cents>0?'var(--ok)':'var(--text-mute)' }}>{sel.cents>0?'$'+sel.cents.toFixed(4):'—'}</span>
              </div>
              <div style={{ marginTop:14, padding:10, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:2, color: CAT_META[sel.cat].color, fontSize:11.5 }}>
                {sel.detail}
              </div>

              <div style={{ marginTop:18, fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>gateway pipeline</div>
              {[
                ['① parse Bearer',    sel.tok ? 'ok' : 'fail'],
                ['② verify ES256 sig',sel.cat==='unauth'||sel.cat==='fake' ? 'skip' : sel.cat==='expired' ? 'fail' : 'ok'],
                ['③ scope match',     sel.cat==='scope_miss' ? 'fail' : sel.tok ? 'ok' : 'skip'],
                ['④ rate + quota',    sel.cat==='rate'||sel.cat==='overage' ? 'fail' : sel.tok ? 'ok' : 'skip'],
                ['⑤ meter ledger',    sel.cat==='paid' ? 'ok' : 'skip'],
              ].map(([step, status]) => (
                <div key={step} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', fontSize:11.5 }}>
                  <span style={{ flex:1, color: status==='ok'?'var(--text)':'var(--text-dim)' }}>{step}</span>
                  <span style={{ color: status==='ok'?'var(--ok)':status==='fail'?'var(--bad)':'var(--text-mute)' }}>
                    {status==='ok'?'✓':status==='fail'?'✗':'·'} {status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding:20, fontFamily:'var(--mono)', fontSize:12, color:'var(--text-mute)' }}>select an event</div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LogView });
