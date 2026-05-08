// Publisher dashboard — revenue-first

function Metric({ label, value, sub, tone, spark }) {
  return (
    <div style={{ padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', display:'flex', flexDirection:'column', gap:6, minHeight:92 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase' }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:600, color:tone||'var(--text)', letterSpacing:'-0.01em' }}>{value}</span>
        {sub && <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)' }}>{sub}</span>}
      </div>
      {spark && <div style={{ marginTop:'auto' }}>{spark}</div>}
    </div>
  );
}

function Dashboard() {
  const [range, setRange] = React.useState('30d');

  // 실데이터 fetch
  const { data: botsData  } = useApi(() => API.getStatsBots());
  const { data: dailyData } = useApi(() => API.getStatsDaily());
  const { data: tokens    } = useApi(() => API.getTokens());

  // 일별 차트 데이터 (실데이터 우선, 없으면 목)
  const daily = dailyData && dailyData.length > 0 ? dailyData : DAILY_REV;
  const reqSpark = React.useMemo(
    () => (daily || DAILY_REV).slice(-14).map(d => d.count ?? d.requests ?? 0),
    [daily]
  );
  const revSpark = React.useMemo(
    () => DAILY_REV.slice(-14).map(d => d.revenue),
    []
  );

  // 봇별 통계 → SUBSCRIBERS 포맷으로 변환
  const BOT_COLORS = ['oklch(0.78 0.14 160)','oklch(0.78 0.14 40)','oklch(0.80 0.16 250)','oklch(0.78 0.14 200)','oklch(0.72 0.15 350)','oklch(0.80 0.15 85)','oklch(0.72 0.10 300)'];
  const liveSubscribers = botsData && botsData.length > 0
    ? botsData.map((b, i) => ({
        id: b.bot_ua,
        vendor: b.bot_ua,
        bots: [b.bot_ua],
        tier: 'live',
        plan: '—',
        requests_30d: b.count,
        revenue_30d: 0,
        status: 'active',
        since: '—',
      }))
    : SUBSCRIBERS;

  const vendorShare = liveSubscribers.map((s, i) => ({
    v: s.requests_30d,
    c: BOT_COLORS[i % BOT_COLORS.length],
    label: s.vendor,
  }));

  const totalRequests = liveSubscribers.reduce((a, s) => a + s.requests_30d, 0);
  const activeTokens  = tokens ? tokens.filter(t => t.active).length : '—';

  return (
    <div style={{ padding:'24px 28px 80px', maxWidth:1440, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'flex-end', gap:20, marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)', letterSpacing:'0.08em' }}>
            PUBLISHER · seoul.news.kr
          </div>
          <h1 style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:600, margin:'4px 0 0', letterSpacing:'-0.01em' }}>
            botgate / dashboard
          </h1>
        </div>
        <span style={{ flex:1 }}></span>
        <div style={{ display:'flex', gap:2, padding:3, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
          {['24h','7d','30d','MTD'].map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ appearance:'none', border:0, background: range===r ? 'var(--bg-2)' : 'transparent',
                boxShadow: range===r ? 'inset 0 0 0 1px var(--border-2)' : 'none',
                color: range===r ? 'var(--text)' : 'var(--text-dim)',
                fontFamily:'var(--mono)', fontSize:11, padding:'5px 10px', borderRadius:2, cursor:'pointer' }}>{r}</button>
          ))}
        </div>
        <button className="btn primary"><Ic.Bolt/>Payout $24,183</button>
      </div>

      {/* metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10, marginBottom:14 }}>
        <Metric label="REVENUE · 30d" value="$25,671.63" sub="mock data" tone="var(--ok)"
          spark={<Spark values={revSpark} width={180} color="var(--ok)"/>}/>
        <Metric label="TOTAL REQUESTS · 30d"
          value={totalRequests > 1e6 ? (totalRequests/1e6).toFixed(2)+'M' : totalRequests.toLocaleString()}
          sub="rDNS verified"
          spark={<Spark values={reqSpark} width={180} color="var(--accent)"/>}/>
        <Metric label="ACTIVE TOKENS" value={activeTokens} sub="issued"/>
        <Metric label="BOT TYPES" value={liveSubscribers.length} tone="var(--info)"/>
        <Metric label="VERIFIED BOTS"
          value={botsData ? botsData.length : '—'}
          sub="rDNS passed" tone="var(--ok)"/>
      </div>

      {/* revenue + live */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:10, marginBottom:14 }}>
        <div className="card">
          <div className="card-hd">
            <span style={{ width:7, height:7, background:'var(--ok)', borderRadius:'50%' }}></span>
            <span>revenue · 30 days</span>
            <span className="flex1"></span>
            <span style={{ color:'var(--text-mute)' }}>USD</span>
          </div>
          <div style={{ padding:'14px 16px' }}>
            <RevenueArea data={DAILY_REV} height={180}/>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'var(--mono)', fontSize:9, color:'var(--text-mute)' }}>
              <span>30d ago</span><span>20d</span><span>10d</span><span>today</span>
            </div>
          </div>
        </div>
        <div className="card scope">
          <div className="card-hd">
            <Ic.Radar/>
            <span>live auth · edge</span>
            <span className="flex1"></span>
            <span className="tag ok"><span style={{ width:5, height:5, background:'var(--ok)', borderRadius:'50%', display:'inline-block', boxShadow:'0 0 8px var(--ok)' }}></span>online</span>
          </div>
          <div style={{ padding:14 }}><JWTFlow compact/></div>
        </div>
      </div>

      {/* revenue share by vendor */}
      <div className="card" style={{ marginBottom:14, padding:0, overflow:'hidden' }}>
        <div className="card-hd">
          <span>revenue by AI customer · 30d</span>
          <span className="flex1"></span>
          <span style={{ color:'var(--text-mute)' }}>{liveSubscribers.length} bot types</span>
        </div>
        <div style={{ padding:'14px 16px 18px' }}>
          <VendorShare data={vendorShare} height={18}/>
          <div style={{ display:'flex', flexWrap:'wrap', gap:14, marginTop:10 }}>
            {vendorShare.map((v,i) => (
              <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:7, fontFamily:'var(--mono)', fontSize:11, color:'var(--text-dim)' }}>
                <span style={{ width:9, height:9, background:v.c }}></span>
                <span style={{ color:'var(--text)' }}>{v.label}</span>
                <span>${(v.v).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* subscribers + scopes */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:10 }}>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="card-hd"><span>subscribers</span><span className="flex1"></span><button className="btn ghost"><Ic.Plus/>invite</button></div>
          <div style={{ display:'grid', gridTemplateColumns:'130px 110px 1fr 90px 80px', padding:'8px 14px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', gap:10 }}>
            <span>vendor</span><span>plan</span><span>usage 30d</span><span style={{ textAlign:'right' }}>revenue</span><span style={{ textAlign:'right' }}>status</span>
          </div>
          {liveSubscribers.map(s => {
            const max = Math.max(...liveSubscribers.map(x => x.requests_30d), 1);
            const pct = s.requests_30d / max;
            return (
              <div key={s.id} className="hover-row" style={{ display:'grid', gridTemplateColumns:'130px 110px 1fr 90px 80px', padding:'10px 14px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text)' }}>{s.vendor}</span>
                <span style={{ color:'var(--text-dim)' }}>{s.tier}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, height:6, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:1, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:(pct*100)+'%', background:'var(--accent)', opacity:0.75 }}></div>
                  </div>
                  <span style={{ color:'var(--text-dim)', fontSize:11, minWidth:70, textAlign:'right' }}>{(s.requests_30d/1e6).toFixed(2)}M</span>
                </div>
                <span style={{ color:'var(--ok)', textAlign:'right' }}>${s.revenue_30d.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                <span style={{ textAlign:'right' }}>
                  {s.status === 'active' ? <span className="tag ok">active</span>
                   : s.status === 'trial' ? <span className="tag info">trial</span>
                   : <span className="tag warn">overage</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="card-hd"><span>top paid paths · 30d</span></div>
          {SITE_SCOPES.filter(p => p.access === 'paid').sort((a,b) => b.hits_30d - a.hits_30d).map(p => {
            const max = Math.max(...SITE_SCOPES.filter(x=>x.access==='paid').map(x=>x.hits_30d));
            const pct = p.hits_30d / max;
            return (
              <div key={p.path} className="hover-row" style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                  <span style={{ color:'var(--accent)', flex:1 }}>{p.path}</span>
                  <span style={{ color:'var(--text-dim)' }}>${p.price_per_req.toFixed(4)}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, height:4, background:'var(--bg-2)', borderRadius:1, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:(pct*100)+'%', background:'var(--ok)', opacity:0.75 }}></div>
                  </div>
                  <span style={{ color:'var(--text-mute)', fontSize:10, minWidth:90, textAlign:'right' }}>{p.hits_30d.toLocaleString()} hits</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Metric });
