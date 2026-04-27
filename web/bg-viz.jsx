// JWT-signing signature animation + revenue/usage charts

// ============ JWT handshake visualization ============
// Request comes in → Bearer token extracted → verify signature → check scopes/quota → meter + allow
function JWTFlow({ compact = false }) {
  const [step, setStep] = React.useState(0);
  const [s, setS] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => {
      setStep(prev => {
        if (prev >= 6) { setTimeout(() => { setStep(0); setS(x => (x + 1) % SC.length); }, 1100); return prev; }
        return prev + 1;
      });
    }, 850);
    return () => clearInterval(id);
  }, []);

  const SC = [
    { label:'PAID · metered', ua:'GPTBot/1.2', tok:'eyJhbGc…prod_us', sub:'openai', scopes:'/articles/*',
      verdict:'200 · $0.0020', ok:true,  failAt:null, reason:'verified · metered' },
    { label:'401 · missing',  ua:'ClaudeBot/1.0', tok:'—', sub:'—', scopes:'—',
      verdict:'401 Bearer', ok:false, failAt:2, reason:'no Authorization header' },
    { label:'403 · scope',    ua:'GPTBot/1.2', tok:'eyJhbGc…gpt_us',  sub:'openai', scopes:'/articles/*',
      verdict:'403 scope', ok:false, failAt:4, reason:'path /admin/* not in token scopes' },
    { label:'402 · quota',    ua:'Bytespider/1.0', tok:'eyJhbGc…bd_prod', sub:'bytedance', scopes:'/articles/*',
      verdict:'402 overage', ok:false, failAt:5, reason:'quota exhausted · overage billing' },
  ];
  const sc = SC[s];
  const failed = (n) => sc.failAt != null && step >= sc.failAt && n >= sc.failAt;

  const W = 660, H = 230;
  return (
    <div style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text-dim)', padding: compact ? 0 : 6 }}>
      {!compact && (
        <div style={{ display:'flex', gap:10, marginBottom:12, alignItems:'center', fontSize:11 }}>
          <span style={{ color:'var(--text-mute)', letterSpacing:'0.08em', textTransform:'uppercase' }}>scenario</span>
          <span style={{ color: sc.ok ? 'var(--ok)' : 'var(--bad)' }}>{sc.label}</span>
          <span style={{ flex:1 }}></span>
          <span style={{ color:'var(--text-mute)' }}>{step}/6</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:'block' }}>
        <defs>
          <marker id="aa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/>
          </marker>
          <marker id="ab" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--bad)"/>
          </marker>
        </defs>

        {[
          { x:70,  y:50, l:'AI BOT',  s:sc.ua, t:'Authorization: Bearer' },
          { x:330, y:50, l:'BOTGATE', s:'verify + meter', t:'lua + jwt' },
          { x:590, y:50, l:'ORIGIN',  s:'publisher', t:'blog · api · docs' },
        ].map((n,i) => (
          <g key={i}>
            <rect x={n.x-62} y={n.y-22} width={124} height={46} rx="2"
              fill="var(--surface)" stroke="var(--border-2)"/>
            <text x={n.x} y={n.y-6} textAnchor="middle" fill="var(--text-mute)" fontSize="9"
              fontFamily="var(--mono)" letterSpacing="0.08em">{n.l}</text>
            <text x={n.x} y={n.y+8} textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--mono)">{n.s}</text>
            <text x={n.x} y={n.y+20} textAnchor="middle" fill="var(--text-mute)" fontSize="9" fontFamily="var(--mono)">{n.t}</text>
          </g>
        ))}
        <g opacity="0.6"><path d="M330 17 v6 M330 85 v6 M258 50 h6 M398 50 h6" stroke="var(--accent)"/></g>

        {/* 1: request + token */}
        <g opacity={step>=1 ? 1 : 0.18} style={{ transition:'opacity 300ms' }}>
          <line x1="132" y1="95" x2="268" y2="95"
            stroke={step>=2 && sc.failAt===2 ? 'var(--bad)' : 'var(--accent)'} strokeWidth="1.2"
            markerEnd={step>=2 && sc.failAt===2 ? 'url(#ab)' : 'url(#aa)'}/>
          <text x="200" y="89" textAnchor="middle" fill="var(--accent)" fontSize="10" fontFamily="var(--mono)">
            GET /articles/… · Bearer {sc.tok.length > 18 ? sc.tok.slice(0,18)+'…' : sc.tok}
          </text>
          <text x="200" y="107" textAnchor="middle" fill="var(--text-mute)" fontSize="9">① request</text>
        </g>

        {/* 2: verify sig */}
        <g opacity={step>=2 ? 1 : 0.18} style={{ transition:'opacity 300ms' }}>
          <rect x="270" y="115" width="120" height="30" rx="2" fill="var(--bg-2)"
            stroke={failed(2) ? 'var(--bad)' : 'var(--accent)'}/>
          <text x="330" y="128" textAnchor="middle" fill="var(--text-mute)" fontSize="9" letterSpacing="0.08em">
            ② VERIFY SIG · ES256
          </text>
          <text x="330" y="140" textAnchor="middle" fill={failed(2)?'var(--bad)':'var(--ok)'} fontSize="10" fontFamily="var(--mono)" fontWeight="600">
            {failed(2) ? '✗ no bearer' : '✓ signature ok'}
          </text>
        </g>

        {/* 3: decode claims */}
        <g opacity={step>=3 && sc.failAt!==2 ? 1 : 0.12} style={{ transition:'opacity 300ms' }}>
          <rect x="270" y="150" width="120" height="36" rx="2" fill="var(--bg-2)" stroke="var(--border-2)"/>
          <text x="330" y="163" textAnchor="middle" fill="var(--text-mute)" fontSize="9" letterSpacing="0.08em">③ CLAIMS</text>
          <text x="330" y="176" textAnchor="middle" fill="var(--accent)" fontSize="9.5" fontFamily="var(--mono)">
            sub:{sc.sub} · {sc.scopes}
          </text>
        </g>

        {/* 4: scope check */}
        <g opacity={step>=4 && sc.failAt!==2 ? 1 : 0.12} style={{ transition:'opacity 300ms' }}>
          <rect x="140" y="150" width="120" height="36" rx="2" fill="var(--bg-2)"
            stroke={failed(4) ? 'var(--bad)' : 'var(--border-2)'}/>
          <text x="200" y="163" textAnchor="middle" fill="var(--text-mute)" fontSize="9" letterSpacing="0.08em">④ SCOPE MATCH</text>
          <text x="200" y="176" textAnchor="middle" fill={failed(4)?'var(--bad)':'var(--ok)'} fontSize="10" fontFamily="var(--mono)" fontWeight="600">
            {failed(4) ? '✗ /admin not allowed' : '✓ path allowed'}
          </text>
        </g>

        {/* 5: quota + rate */}
        <g opacity={step>=5 && sc.failAt==null ? 1 : step>=5 && sc.failAt===5 ? 1 : 0.12} style={{ transition:'opacity 300ms' }}>
          <rect x="400" y="150" width="120" height="36" rx="2" fill="var(--bg-2)"
            stroke={failed(5) ? 'var(--bad)' : 'var(--border-2)'}/>
          <text x="460" y="163" textAnchor="middle" fill="var(--text-mute)" fontSize="9" letterSpacing="0.08em">⑤ QUOTA / RATE</text>
          <text x="460" y="176" textAnchor="middle" fill={failed(5)?'var(--bad)':'var(--ok)'} fontSize="10" fontFamily="var(--mono)" fontWeight="600">
            {failed(5) ? '✗ overage' : '✓ 23.9M / 50M'}
          </text>
        </g>

        {/* 6: meter + forward */}
        <g opacity={step>=6 ? 1 : 0.12} style={{ transition:'opacity 300ms' }}>
          <line x1="392" y1="95" x2="528" y2="95"
            stroke={sc.ok ? 'var(--ok)' : 'var(--bad)'} strokeWidth="1.2"
            markerEnd={sc.ok ? 'url(#aa)' : 'url(#ab)'}/>
          <text x="460" y="89" textAnchor="middle" fill={sc.ok?'var(--ok)':'var(--bad)'} fontSize="10" fontFamily="var(--mono)" fontWeight="600">
            {sc.verdict}
          </text>
          <text x="460" y="107" textAnchor="middle" fill="var(--text-mute)" fontSize="9">⑥ {sc.ok ? 'meter + forward' : 'reject'}</text>
        </g>

        {/* verdict pill */}
        <g opacity={step>=6 ? 1 : 0} style={{ transition:'opacity 300ms' }}>
          <rect x="270" y={H-22} width="120" height="22" rx="2"
            fill={sc.ok ? 'color-mix(in oklch, var(--ok) 20%, var(--bg))' : 'color-mix(in oklch, var(--bad) 20%, var(--bg))'}
            stroke={sc.ok ? 'var(--ok)' : 'var(--bad)'}/>
          <text x="330" y={H-7} textAnchor="middle" fill={sc.ok?'var(--ok)':'var(--bad)'}
            fontSize="11" fontFamily="var(--mono)" fontWeight="700" letterSpacing="0.06em">
            {sc.ok ? '✓ ' + sc.verdict : '✕ ' + sc.verdict}
          </text>
        </g>
      </svg>
    </div>
  );
}

// ============ Revenue area chart ============
function RevenueArea({ data, height = 140 }) {
  const W = 800, H = height;
  const max = Math.max(...data.map(d => d.revenue));
  const step = W / (data.length - 1);
  const pts = data.map((d,i) => `${i*step},${H - (d.revenue/max)*(H-14) - 2}`);
  const path = `M${pts.join(' L')}`;
  const area = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:'block' }}>
      <defs>
        <linearGradient id="revg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0.25,0.5,0.75].map(f => (
        <line key={f} x1="0" x2={W} y1={H*f} y2={H*f} stroke="var(--border)" strokeDasharray="2 3" opacity="0.5"/>
      ))}
      <path d={area} fill="url(#revg)"/>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.4"/>
      {data.map((d,i) => (
        <circle key={i} cx={i*step} cy={H-(d.revenue/max)*(H-14)-2} r="1.3" fill="var(--accent)" opacity="0.6"/>
      ))}
    </svg>
  );
}

// ============ Horizontal stacked bar: AI buyer rev share ============
function VendorShare({ data, height = 14 }) {
  const total = data.reduce((s,d)=>s+d.v, 0);
  let x = 0;
  return (
    <svg viewBox={`0 0 100 ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display:'block', borderRadius: 2 }}>
      {data.map((d,i) => {
        const w = (d.v/total) * 100;
        const r = <rect key={i} x={x} y="0" width={w} height={height} fill={d.c}/>;
        x += w;
        return r;
      })}
    </svg>
  );
}

// ============ Sparkline ============
function Spark({ values, width = 100, height = 24, color = 'var(--accent)' }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v,i) => {
    const x = (i/(values.length-1)) * width;
    const y = height - ((v-min)/(max-min||1)) * (height-2) - 1;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ============ Meter ============
function Meter({ value, label, size = 90, tone = 'var(--ok)' }) {
  const r = 36, c = 2 * Math.PI * r;
  const pct = Math.min(1, value);
  return (
    <svg width={size} height={size} viewBox="0 0 90 90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border)" strokeWidth="6"/>
      <circle cx="45" cy="45" r={r} fill="none" stroke={tone} strokeWidth="6"
        strokeDasharray={`${c*pct} ${c}`} strokeLinecap="round" transform="rotate(-90 45 45)"/>
      <text x="45" y="44" textAnchor="middle" fontFamily="var(--mono)" fontSize="16" fontWeight="600" fill="var(--text)">
        {Math.round(value*100)}%
      </text>
      <text x="45" y="58" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--text-mute)" letterSpacing="0.08em">{label}</text>
    </svg>
  );
}

Object.assign(window, { JWTFlow, RevenueArea, VendorShare, Spark, Meter });
