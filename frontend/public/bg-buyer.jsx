// Buyer console — AI company's view. They subscribed; now they manage sub-tokens & spend.

function Buyer() {
  const c = MY_CONTRACT;
  const usagePct = c.quota_used / c.quota;
  const spendPct = BUY_SUMMARY.spend_month / 60000;

  const [reveal, setReveal] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const shortTok = c.master_token.slice(0, 32) + '…' + c.master_token.slice(-18);

  // faux live rate
  const [rate, setRate] = React.useState(BUY_SUMMARY.rate_now);
  React.useEffect(() => {
    const id = setInterval(() => setRate(r => Math.max(12, Math.min(50, r + (Math.random() - 0.5) * 6))), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding:'24px 28px 80px', maxWidth:1440, margin:'0 auto' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'flex-end', gap:20, marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)', letterSpacing:'0.08em' }}>
            BUYER · {c.vendor} · {c.account_id}
          </div>
          <h1 style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:600, margin:'4px 0 0', letterSpacing:'-0.01em' }}>
            botgate / contract
          </h1>
        </div>
        <span style={{ flex:1 }}></span>
        <span className="tag ok">{c.tier}</span>
        <button className="btn ghost"><Ic.Cog/>billing settings</button>
        <button className="btn primary"><Ic.Plus/>mint sub-token</button>
      </div>

      {/* contract overview */}
      <div className="card scope" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
        <div className="card-hd">
          <span>master contract</span>
          <span className="flex1"></span>
          <span style={{ color:'var(--text-mute)' }}>period {c.period} · renews {c.renews}</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', padding:'18px 20px', gap:20 }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase' }}>spend · month</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:28, fontWeight:600, marginTop:4 }}>${c.spend_month.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-dim)', marginTop:4 }}>
              지난 달 대비 <span style={{ color:'var(--warn)' }}>+16.2%</span>
            </div>
            <div style={{ height:6, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:1, overflow:'hidden', marginTop:10 }}>
              <div style={{ height:'100%', width:(spendPct*100)+'%', background:'var(--accent)', opacity:0.75 }}></div>
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', marginTop:4 }}>
              예산 상한 $60,000 대비 {(spendPct*100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase' }}>quota · req</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:28, fontWeight:600, marginTop:4 }}>
              {(c.quota_used/1e6).toFixed(1)}M <span style={{ color:'var(--text-mute)', fontSize:14 }}>/ {(c.quota/1e6).toFixed(0)}M</span>
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-dim)', marginTop:4 }}>
              {(usagePct*100).toFixed(1)}% 사용 · 16일 남음
            </div>
            <div style={{ height:6, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:1, overflow:'hidden', marginTop:10 }}>
              <div style={{ height:'100%', width:(usagePct*100)+'%', background:'var(--ok)', opacity:0.75 }}></div>
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', marginTop:4 }}>on-track · no overage projected</div>
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase' }}>live rate</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:28, fontWeight:600, marginTop:4 }}>
              {Math.round(rate)} <span style={{ color:'var(--text-mute)', fontSize:14 }}>/ {c.rate} req/s</span>
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-dim)', marginTop:4 }}>
              {BUY_SUMMARY.req_today.toLocaleString()} req today · {BUY_SUMMARY.active_tokens} tokens active
            </div>
            <div style={{ height:6, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:1, overflow:'hidden', marginTop:10 }}>
              <div style={{ height:'100%', width:(rate/c.rate*100)+'%', background:'var(--info)', opacity:0.75, transition:'width 400ms' }}></div>
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', marginTop:4 }}>updated every 1.2s</div>
          </div>
        </div>

        {/* master token row */}
        <div style={{ borderTop:'1px solid var(--border)', padding:'14px 20px', display:'flex', alignItems:'center', gap:12, background:'var(--bg-2)' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase' }}>master JWT</span>
          <code style={{ flex:1, fontFamily:'var(--mono)', fontSize:11, color:reveal?'var(--accent)':'var(--text-dim)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {reveal ? c.master_token : shortTok}
          </code>
          <button className="btn ghost" onClick={() => setReveal(!reveal)}>
            {reveal ? <Ic.EyeOff/> : <Ic.Eye/>}{reveal ? 'hide' : 'reveal'}
          </button>
          <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(c.master_token); setCopied(true); setTimeout(()=>setCopied(false),1200); }}>
            <Ic.Copy/>{copied ? 'copied' : 'copy'}
          </button>
          <button className="btn danger ghost"><Ic.Refresh/>rotate</button>
        </div>
      </div>

      {/* sub-tokens */}
      <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
        <div className="card-hd">
          <span>sub-tokens · fleet</span>
          <span className="flex1"></span>
          <span style={{ color:'var(--text-mute)' }}>하위 토큰은 region·프로젝트 단위로 발급 / 회수 가능</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 140px 1fr 110px 90px', padding:'9px 16px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', gap:10 }}>
          <span>label</span><span>region</span><span>rate</span><span>quota used</span><span style={{ textAlign:'right' }}>last use</span><span style={{ textAlign:'right' }}>status</span>
        </div>
        {SUB_TOKENS.map(t => {
          const pct = t.used / t.quota;
          return (
            <div key={t.id} className="hover-row" style={{ display:'grid', gridTemplateColumns:'1fr 110px 140px 1fr 110px 90px', padding:'11px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:10 }}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:7, height:7, background:t.color, borderRadius:1 }}></span>
                <span style={{ color:t.active?'var(--text)':'var(--text-mute)' }}>{t.label}</span>
              </span>
              <span style={{ color:'var(--text-dim)' }}>{t.region}</span>
              <span style={{ color:'var(--text-dim)' }}>{t.rate} req/s</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ flex:1, height:5, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:1, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:(pct*100)+'%', background:pct>0.8?'var(--warn)':'var(--ok)', opacity:0.75 }}></div>
                </div>
                <span style={{ color:'var(--text-dim)', fontSize:10, minWidth:100, textAlign:'right' }}>{(t.used/1e6).toFixed(1)}M / {(t.quota/1e6).toFixed(0)}M</span>
              </div>
              <span style={{ color:'var(--text-mute)', textAlign:'right' }}>{t.last_use}</span>
              <span style={{ textAlign:'right' }}>
                {t.active ? <span className="tag ok">active</span> : <span className="tag mute">idle</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* JWT flow + usage chart */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div className="card">
          <div className="card-hd">
            <Ic.Radar/>
            <span>auth flow · edge</span>
            <span className="flex1"></span>
            <span style={{ color:'var(--text-mute)' }}>live</span>
          </div>
          <div style={{ padding:14 }}><JWTFlow compact/></div>
        </div>
        <div className="card">
          <div className="card-hd">
            <span>daily requests · 30d</span>
            <span className="flex1"></span>
            <span className="tag info">{BUY_SUMMARY.errors_24h} 4xx · 24h</span>
          </div>
          <div style={{ padding:'14px 16px' }}>
            <RevenueArea data={DAILY_REV} height={200}/>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'var(--mono)', fontSize:9, color:'var(--text-mute)' }}>
              <span>30d ago</span><span>15d</span><span>today</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Buyer });
