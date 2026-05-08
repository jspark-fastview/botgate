// Config — publisher's settings: plans, scopes, UA blocklist, rDNS fallback
const { useState: useStateC } = React;

function Config() {
  const [tab, setTab] = useStateC('plans');
  const tabs = [
    ['plans',    'Plans & pricing', <Ic.Coin/>],
    ['scopes',   'Site scopes',     <Ic.Lock/>],
    ['rdns',     'rDNS · free tier',<Ic.Dns/>],
    ['blocklist','Blocklist',       <Ic.Shield/>],
  ];

  return (
    <div style={{ padding:'24px 28px 80px', maxWidth:1440, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'flex-end', gap:20, marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)', letterSpacing:'0.08em' }}>
            PUBLISHER · seoul.news.kr
          </div>
          <h1 style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:600, margin:'4px 0 0', letterSpacing:'-0.01em' }}>
            botgate / config
          </h1>
        </div>
        <span style={{ flex:1 }}></span>
        <button className="btn ghost"><Ic.Refresh/>reload</button>
        <button className="btn primary"><Ic.Bolt/>deploy</button>
      </div>

      {/* tabs */}
      <div style={{ display:'flex', gap:2, padding:3, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', width:'fit-content', marginBottom:16 }}>
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ appearance:'none', border:0, background: tab===id ? 'var(--bg-2)' : 'transparent',
              boxShadow: tab===id ? 'inset 0 0 0 1px var(--border-2)' : 'none',
              color: tab===id ? 'var(--text)' : 'var(--text-dim)',
              fontFamily:'var(--mono)', fontSize:12, padding:'6px 12px', borderRadius:2, cursor:'pointer',
              display:'inline-flex', alignItems:'center', gap:6 }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'plans'     && <PlansConfig/>}
      {tab === 'scopes'    && <ScopesConfig/>}
      {tab === 'rdns'      && <RdnsConfig/>}
      {tab === 'blocklist' && <BlocklistConfig/>}
    </div>
  );
}

function PlansConfig() {
  return (
    <div>
      <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:12 }}>
        <div className="card-hd">
          <span>active plans · pricing ladder</span>
          <span className="flex1"></span>
          <button className="btn ghost"><Ic.Plus/>new plan</button>
        </div>
        {PLANS.map(p => (
          <div key={p.id} style={{ display:'grid', gridTemplateColumns:'180px 160px 130px 130px 1fr 90px', padding:'14px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:12 }}>
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:9, height:9, background:p.color, borderRadius:1 }}></span>
              <span style={{ color:'var(--text)', fontWeight:500 }}>{p.name}</span>
            </span>
            <span style={{ color:'var(--accent)' }}>{p.price}</span>
            <span style={{ color:'var(--text-dim)' }}>{p.req_rate}</span>
            <span style={{ color:'var(--text-dim)' }}>{p.quota}</span>
            <span style={{ color:'var(--text-mute)', fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              scopes: {p.scopes.join(' · ')}
            </span>
            <span style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
              <button className="icon-btn"><Ic.Edit/></button>
              <button className="icon-btn"><Ic.Trash/></button>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div className="card">
          <div className="card-hd"><span>billing · settlement</span></div>
          <div style={{ padding:16, fontFamily:'var(--mono)', fontSize:12, color:'var(--text-dim)', display:'flex', flexDirection:'column', gap:12 }}>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Settlement period</span>
              <select className="input" style={{ width:160 }} defaultValue="monthly"><option>monthly</option><option>weekly</option></select>
            </label>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Overage behavior</span>
              <select className="input" style={{ width:160 }} defaultValue="allow-bill"><option value="allow-bill">allow · bill at 1.5×</option><option>block at quota</option></select>
            </label>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Payout account</span>
              <span style={{ color:'var(--text)' }}>Stripe · acct_1NH…</span>
            </label>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Currency</span>
              <select className="input" style={{ width:160 }} defaultValue="USD"><option>USD</option><option>KRW</option><option>EUR</option></select>
            </label>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span>JWT · signing</span></div>
          <div style={{ padding:16, fontFamily:'var(--mono)', fontSize:12, color:'var(--text-dim)', display:'flex', flexDirection:'column', gap:12 }}>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Algorithm</span>
              <span style={{ color:'var(--accent)' }}>ES256 (ECDSA P-256)</span>
            </label>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Key ID</span>
              <span style={{ color:'var(--text)' }}>bg_kid_2026_04</span>
            </label>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>Default exp</span>
              <select className="input" style={{ width:160 }} defaultValue="30d"><option>7d</option><option>30d</option><option>90d</option></select>
            </label>
            <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <span>JWKS endpoint</span>
              <code style={{ color:'var(--accent)', fontSize:11 }}>/.well-known/jwks.json</code>
            </label>
            <button className="btn ghost" style={{ alignSelf:'flex-start' }}><Ic.Refresh/>rotate signing key</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopesConfig() {
  return (
    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <div className="card-hd">
        <span>site scopes · which paths are paid / free / blocked</span>
        <span className="flex1"></span>
        <button className="btn ghost"><Ic.Plus/>add scope</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 130px 1fr 90px', padding:'9px 16px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', gap:10 }}>
        <span>path pattern</span><span>access</span><span>price · $</span><span>30d hits</span><span></span>
      </div>
      {SITE_SCOPES.map(p => {
        const max = Math.max(...SITE_SCOPES.map(x => x.hits_30d));
        const pct = p.hits_30d / max;
        return (
          <div key={p.path} className="hover-row" style={{ display:'grid', gridTemplateColumns:'1fr 110px 130px 1fr 90px', padding:'11px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:10 }}>
            <code style={{ color:'var(--accent)' }}>{p.path}</code>
            <span>
              {p.access === 'paid'  ? <span className="tag ok">paid</span> :
               p.access === 'free'  ? <span className="tag info">free</span> :
                                      <span className="tag bad">block</span>}
            </span>
            <span style={{ color: p.access==='paid' ? 'var(--text)' : 'var(--text-mute)' }}>
              {p.access === 'paid' ? '$'+p.price_per_req.toFixed(4)+' / req' : '—'}
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ flex:1, height:5, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:1, overflow:'hidden' }}>
                <div style={{ height:'100%', width:(pct*100)+'%', background:p.color, opacity:0.75 }}></div>
              </div>
              <span style={{ color:'var(--text-dim)', fontSize:11, minWidth:90, textAlign:'right' }}>{p.hits_30d.toLocaleString()}</span>
            </div>
            <span style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
              <button className="icon-btn"><Ic.Edit/></button>
              <button className="icon-btn"><Ic.Trash/></button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RdnsConfig() {
  return (
    <div>
      <div className="card" style={{ padding:'14px 18px', marginBottom:12, fontFamily:'var(--mono)', fontSize:12, color:'var(--text-dim)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Free tier는 rDNS로 검증합니다.</strong> 토큰 없이 들어오는 공식 봇(예: Googlebot)은 forward/reverse DNS가
        일치해야만 <code style={{ color:'var(--accent)' }}>/robots.txt</code>, <code style={{ color:'var(--accent)' }}>/sitemap.xml</code> 같은 free-tier 경로에 접근할 수 있습니다.
        유료 scope에 접근하려면 Bearer JWT가 필요합니다.
      </div>
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div className="card-hd">
          <span>allowed PTR patterns · free-tier verification</span>
          <span className="flex1"></span>
          <button className="btn ghost"><Ic.Plus/>add bot</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'150px 140px 1fr 120px 90px', padding:'9px 16px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', gap:10 }}>
          <span>user-agent</span><span>vendor</span><span>PTR pattern</span><span>free scopes</span><span></span>
        </div>
        {BOTS.slice(0, 8).map(b => (
          <div key={b.id} className="hover-row" style={{ display:'grid', gridTemplateColumns:'150px 140px 1fr 120px 90px', padding:'11px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:10 }}>
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:8, height:8, background:b.color, borderRadius:1 }}></span>
              <span style={{ color:'var(--text)' }}>{b.ua}</span>
            </span>
            <span style={{ color:'var(--text-dim)' }}>{b.vendor}</span>
            <code style={{ color:'var(--accent)' }}>{b.ptr}</code>
            <span style={{ color:'var(--text-mute)' }}>robots · sitemap</span>
            <span style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
              <button className="icon-btn"><Ic.Edit/></button>
              <button className="icon-btn"><Ic.Trash/></button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlocklistConfig() {
  const patterns = [
    'sqlmap/*', 'nikto/*', 'masscan/*', 'zgrab/*',
    'curl/7.* (no referer)', 'python-requests/* (no UA)',
    '*crawler* (not verified)',
  ];
  return (
    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <div className="card-hd">
        <span>malicious UA patterns · auto-block</span>
        <span className="flex1"></span>
        <button className="btn ghost"><Ic.Plus/>add pattern</button>
      </div>
      {patterns.map(p => (
        <div key={p} className="hover-row" style={{ display:'flex', padding:'12px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:10 }}>
          <code style={{ color:'var(--bad)', flex:1 }}>{p}</code>
          <span className="tag bad">block</span>
          <button className="icon-btn"><Ic.Edit/></button>
          <button className="icon-btn"><Ic.Trash/></button>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Config });
