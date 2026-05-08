// App shell — persona toggle (publisher vs buyer), nav, theme tweaks
const { useState, useEffect } = React;

function App() {
  const [persona, setPersona] = useState('publisher'); // 'publisher' | 'buyer'
  const [screen, setScreen] = useState('landing');
  const [theme, setTheme] = useState('dark');
  const [density, setDensity] = useState('compact');
  const [accentHue, setAccentHue] = useState(200);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', density);
    document.documentElement.style.setProperty('--accent',
      `oklch(${theme === 'dark' ? 0.80 : 0.55} ${theme === 'dark' ? 0.13 : 0.14} ${accentHue})`);
  }, [theme, density, accentHue]);

  // landing is shared; 'buyer' jumps to buyer console
  const handleNav = (s) => {
    if (s === 'buyer') { setPersona('buyer'); setScreen('console'); return; }
    setScreen(s);
  };

  const pubNav = [
    ['landing',   'Landing',   <Ic.Shield/>],
    ['dashboard', 'Dashboard', <Ic.Dashboard/>],
    ['log',       'Live log',  <Ic.Terminal/>],
    ['config',    'Config',    <Ic.Cog/>],
  ];
  const buyNav = [
    ['console', 'Contract', <Ic.Lock/>],
    ['landing', 'Back to landing', <Ic.Shield/>],
  ];
  const nav = persona === 'publisher' ? pubNav : buyNav;
  const activeEntry = nav.find(n => n[0] === screen) || nav[0];

  return (
    <div className="app" data-screen-label={persona + ' · ' + activeEntry[1]}>
      <div className="topbar">
        <div className="brand">
          <BrandMark/>
          <span className="brand-name">bot<span className="slash">/</span>gate</span>
        </div>

        {/* persona switcher */}
        <div style={{ display:'flex', gap:2, padding:3, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
          {[['publisher','Publisher',<Ic.Coin/>],['buyer','AI buyer',<Ic.User/>]].map(([id,label,icon]) => (
            <button key={id} onClick={() => { setPersona(id); setScreen(id==='buyer'?'console':'landing'); }}
              aria-current={persona===id}
              style={{ appearance:'none', border:0,
                background: persona===id ? 'var(--bg-2)' : 'transparent',
                boxShadow: persona===id ? 'inset 0 0 0 1px var(--border-2)' : 'none',
                color: persona===id ? 'var(--text)' : 'var(--text-dim)',
                fontFamily:'var(--mono)', fontSize:11, padding:'5px 10px', borderRadius:2, cursor:'pointer',
                display:'inline-flex', alignItems:'center', gap:6 }}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="nav">
          {nav.map(([id, label, icon]) => (
            <button key={id} aria-current={screen === id}
              onClick={() => setScreen(id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {icon} {label}
            </button>
          ))}
        </div>

        <span className="spacer"></span>

        <span className="status-pill">
          <span className="dot"></span>
          gateway-01.seoul · 37d uptime
        </span>

        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="toggle theme">
          {theme === 'dark' ? <Ic.Sun/> : <Ic.Moon/>}
        </button>

        <button className="icon-btn" title="github"><Ic.Github/></button>
      </div>

      <div>
        {persona === 'publisher' && screen === 'landing'   && <Landing onNav={handleNav}/>}
        {persona === 'publisher' && screen === 'dashboard' && <Dashboard/>}
        {persona === 'publisher' && screen === 'log'       && <LogView/>}
        {persona === 'publisher' && screen === 'config'    && <Config/>}
        {persona === 'buyer'     && screen === 'console'   && <Buyer/>}
        {persona === 'buyer'     && screen === 'landing'   && <Landing onNav={handleNav}/>}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Persona"/>
        <TweakRadio label="Role" value={persona} onChange={(v) => { setPersona(v); setScreen(v==='buyer'?'console':'landing'); }}
          options={[{ value:'publisher', label:'Publisher' }, { value:'buyer', label:'AI buyer' }]}/>
        <TweakSection label="Appearance"/>
        <TweakRadio label="Theme" value={theme} onChange={setTheme}
          options={[{ value:'dark', label:'Dark' },{ value:'light', label:'Light' }]}/>
        <TweakRadio label="Density" value={density} onChange={setDensity}
          options={[{ value:'compact', label:'Compact' },{ value:'comfortable', label:'Comfy' }]}/>
        <TweakSlider label="Accent hue" min={0} max={360} step={5} unit="°"
          value={accentHue} onChange={setAccentHue}/>
        <TweakSection label="Screen"/>
        <TweakRadio label="Active" value={screen} onChange={setScreen}
          options={nav.map(n => ({ value: n[0], label: n[1] }))}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
