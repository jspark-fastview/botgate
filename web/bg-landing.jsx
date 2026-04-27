// Landing — AI bot toll gate. Stripe/Cloudflare vibe.
// Audience: AI companies that want paid, JWT-authenticated crawl access.

function Landing({ onNav }) {
  return (
    <div style={{ padding: '40px 40px 80px', maxWidth: 1280, margin: '0 auto' }}>
      {/* HERO */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'start', marginTop:20 }}>
        <div>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:8,
            fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)',
            padding:'4px 10px', border:'1px solid color-mix(in oklch, var(--accent) 40%, var(--border))',
            borderRadius:2, marginBottom:28, letterSpacing:'0.08em', textTransform:'uppercase',
          }}>
            <span style={{ width:5, height:5, background:'var(--accent)', borderRadius:'50%', boxShadow:'0 0 8px var(--accent)' }}></span>
            v0.4 · JWT gateway for AI crawlers
          </div>

          <h1 style={{
            fontFamily:'var(--mono)', fontWeight:700,
            fontSize:56, lineHeight:1.02, letterSpacing:'-0.02em',
            color:'var(--text)', margin:'0 0 20px',
          }}>
            Charge AI crawlers<br/>
            <span style={{ color:'var(--accent)' }}>per request.</span><br/>
            Metered at the edge.
          </h1>

          <p style={{ fontSize:16, lineHeight:1.6, color:'var(--text-dim)', maxWidth:520, marginBottom:28 }}>
            botgate는 <strong style={{ color:'var(--text)' }}>AI 크롤러에게 JWT 토큰을 발급</strong>하고 요청마다 과금합니다.
            OpenAI, Anthropic, Perplexity 같은 AI 회사가 구독하면 token scopes 안에서 자유롭게 긁어갈 수 있고,
            <strong style={{ color:'var(--text)' }}> 모든 request는 edge에서 자동으로 미터링</strong>됩니다.
          </p>

          <div style={{ display:'flex', gap:10, marginBottom:32 }}>
            <button className="btn primary" onClick={() => onNav('dashboard')}>
              <Ic.Dashboard/> Publisher dashboard <Ic.Arrow/>
            </button>
            <button className="btn ghost" onClick={() => onNav('buyer')}>
              <Ic.Lock/> AI buyer console
            </button>
          </div>

          {/* stat strip */}
          <div style={{
            display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:1,
            background:'var(--border)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', overflow:'hidden', maxWidth:560,
          }}>
            {[
              { k:'REVENUE · 30d',    v:'$25,671',  c:'var(--ok)' },
              { k:'PAID REQUESTS',    v:'11.8 M',   c:'var(--text)' },
              { k:'ACTIVE SUBS',      v:'6',        c:'var(--accent)' },
            ].map((s,i) => (
              <div key={i} style={{ background:'var(--surface)', padding:'14px 16px' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.08em' }}>{s.k}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:22, color:s.c, fontWeight:600, marginTop:4 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* right: JWT handshake animation */}
        <div className="card scope" style={{ padding:0, overflow:'hidden' }}>
          <div className="card-hd">
            <Ic.Radar/>
            <span>live auth · JWT → scope → meter</span>
            <span className="flex1"></span>
            <span className="tag mute">demo</span>
          </div>
          <div style={{ padding:16 }}><JWTFlow/></div>
          <div style={{
            padding:'10px 14px', borderTop:'1px solid var(--border)',
            fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)',
            display:'flex', gap:14, letterSpacing:'0.04em',
          }}>
            <span style={{ color:'var(--ok)' }}>● 200 paid</span>
            <span style={{ color:'var(--bad)' }}>● 401/403/402</span>
            <span className="flex1"></span>
            <span>cycles every ~6s</span>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={{ marginTop:72 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:14, marginBottom:24 }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)', letterSpacing:'0.12em' }}>── FLOW</span>
          <h2 style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:600, margin:0 }}>AI 회사 → 구독 → 자동 과금</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14 }}>
          {[
            { n:'01', t:'Subscribe', d:'AI 회사가 플랜을 선택하고 결제 계정 등록. Startup/Growth/Enterprise.',
              code:'POST /v1/subscriptions\nAuthorization: Bearer sk_live_…\n{ "plan": "enterprise" }' },
            { n:'02', t:'Mint JWT', d:'마스터 토큰 발급. 리전/프로젝트별 하위 토큰을 직접 mint.',
              code:'{ "sub":"openai",\n  "scopes":["/articles/*"],\n  "rate":50, "quota":5e7,\n  "exp":1765080000 }' },
            { n:'03', t:'Crawl w/ Bearer', d:'크롤러가 요청마다 Bearer 토큰 전송. botgate가 edge에서 검증.',
              code:'GET /articles/x HTTP/1.1\nUser-Agent: GPTBot/1.2\nAuthorization: Bearer eyJ…' },
            { n:'04', t:'Meter + Settle', d:'요청마다 미터링. 월말 자동 정산 + 인보이스.',
              code:'→ 200 OK · $0.0020\n→ ledger += 1\n→ monthly invoice' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)', letterSpacing:'0.08em' }}>{s.n}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:600 }}>{s.t}</span>
                </div>
                <div style={{ fontSize:12.5, color:'var(--text-dim)', marginTop:8, lineHeight:1.55 }}>{s.d}</div>
              </div>
              <pre style={{ margin:0, padding:12, background:'var(--bg-2)', fontFamily:'var(--mono)', fontSize:10.5, color:'var(--text-dim)', overflow:'auto' }}>{s.code}</pre>
            </div>
          ))}
        </div>
      </div>

      {/* PLANS */}
      <div style={{ marginTop:72 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:14, marginBottom:20 }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)', letterSpacing:'0.12em' }}>── PLANS</span>
          <h2 style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:600, margin:0 }}>요금제 / pricing</h2>
          <span style={{ flex:1 }}></span>
          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)' }}>USD · per-request · monthly settle</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
          {PLANS.map(p => (
            <div key={p.id} className="card" style={{
              padding:20, position:'relative', overflow:'hidden',
              borderColor: p.id === 'growth' ? 'var(--accent)' : 'var(--border)',
            }}>
              {p.id === 'growth' && (
                <div style={{
                  position:'absolute', top:0, right:0, padding:'3px 8px',
                  background:'var(--accent)', color:'oklch(0.15 0.02 240)',
                  fontFamily:'var(--mono)', fontSize:9, letterSpacing:'0.1em',
                  textTransform:'uppercase', fontWeight:700,
                }}>popular</div>
              )}
              <div style={{ fontFamily:'var(--mono)', fontSize:11, color:p.color, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600 }}>
                {p.name}
              </div>
              <div style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:600, color:'var(--text)', marginTop:8 }}>
                {p.price}
              </div>
              <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)', marginTop:4 }}>
                {p.req_rate} · {p.quota}
              </div>
              <div style={{ borderTop:'1px solid var(--border)', margin:'14px 0', paddingTop:10 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-mute)', letterSpacing:'0.06em', marginBottom:6 }}>SCOPES</div>
                {p.scopes.map(s => (
                  <div key={s} style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)', marginTop:2 }}>{s}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SUBSCRIBERS */}
      <div style={{ marginTop:56 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:14, marginBottom:16 }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)', letterSpacing:'0.12em' }}>── CUSTOMERS</span>
          <h2 style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:600, margin:0 }}>현재 구독중인 AI 회사</h2>
        </div>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{
            display:'grid', gridTemplateColumns:'160px 100px 140px 1fr 110px 80px',
            padding:'9px 16px', background:'var(--bg-2)',
            borderBottom:'1px solid var(--border)', fontFamily:'var(--mono)', fontSize:10,
            color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase', gap:10,
          }}>
            <span>vendor</span><span>tier</span><span>plan</span><span>usage · 30d</span>
            <span style={{ textAlign:'right' }}>revenue · 30d</span><span style={{ textAlign:'right' }}>status</span>
          </div>
          {SUBSCRIBERS.map(s => (
            <div key={s.id} className="hover-row" style={{
              display:'grid', gridTemplateColumns:'160px 100px 140px 1fr 110px 80px',
              padding:'10px 16px', borderBottom:'1px solid var(--border)',
              fontFamily:'var(--mono)', fontSize:12, alignItems:'center', gap:10,
            }}>
              <span style={{ color:'var(--text)' }}>{s.vendor}</span>
              <span className={'tag ' + (s.tier === 'enterprise' ? 'ok' : s.tier === 'growth' ? 'info' : 'warn')}>{s.tier}</span>
              <span style={{ color:'var(--text-dim)' }}>{s.plan}</span>
              <span style={{ color:'var(--text-dim)' }}>{s.requests_30d.toLocaleString()} req</span>
              <span style={{ color:'var(--ok)', textAlign:'right', fontWeight:500 }}>${s.revenue_30d.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              <span style={{ textAlign:'right' }}>
                {s.status === 'active' ? <span className="tag ok">active</span>
                 : s.status === 'trial' ? <span className="tag info">trial</span>
                 : <span className="tag warn">overage</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop:48, padding:'20px 0 0', borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:12,
        fontFamily:'var(--mono)', fontSize:11, color:'var(--text-mute)',
      }}>
        <BrandMark/>
        <span>botgate · AI crawler toll gateway</span>
        <span style={{ flex:1 }}></span>
        <span>OpenResty + JWT (ES256)</span>
      </div>
    </div>
  );
}

Object.assign(window, { Landing });
