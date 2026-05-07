import Link from 'next/link'

export default function HomePage() {
  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link className="logo" href="/">
            <span className="logo-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 4v5c0 4.5-3.5 8.5-8 9-4.5-.5-8-4.5-8-9V7l8-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </span>
            <span>GuardUs</span>
          </Link>
          <div className="nav-links">
            <a href="#features">기능</a>
            <a href="#how">이용 방법</a>
            <a href="#numbers">현황</a>
            <Link href="/portal">대시보드</Link>
            <a href="#">AI 회사 →</a>
          </div>
          <span className="nav-spacer"></span>
          <span className="nav-role"><strong>퍼블리셔</strong>용</span>
          <Link className="btn ghost" href="/portal">로그인</Link>
          <Link className="btn brand" href="/portal">무료로 시작하기</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow"><span className="dot"></span> 콘텐츠 수익화 · 새로운 수익 모델</div>
          <h1>
            AI 크롤러도 이젠 <br/>
            <span className="hl">정당하게</span> 비용을 내고<br/>
            <span className="em">우리 콘텐츠</span>를 봅니다.
          </h1>
          <p className="lead">
            ChatGPT, Claude, Perplexity 같은 AI들이 매일 수백만 번 우리 콘텐츠를 가져갑니다.
            GuardUs는 어떤 AI가 무엇을 보는지 한눈에 보여드리고,
            <strong>요청 한 건당 자동으로 수익이 쌓이게</strong> 만들어드려요.
          </p>
          <div className="hero-cta">
            <Link className="btn brand" href="/portal">
              지금 무료로 시작
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </Link>
            <Link className="btn" href="/portal">대시보드 미리보기</Link>
          </div>

          <div className="hero-stats">
            <div><div className="k">지난 30일 분석</div><div className="v">12.3M</div><div className="sub">AI 봇 요청</div></div>
            <div><div className="k">발생 수익</div><div className="v">₩34M</div><div className="sub">자동 정산</div></div>
            <div><div className="k">참여 AI 회사</div><div className="v">6곳</div><div className="sub">매월 증가</div></div>
            <div><div className="k">설정 시간</div><div className="v">10분</div><div className="sub">한 번이면 끝</div></div>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="blob a"></div>
          <div className="blob b"></div>

          <div className="card" style={{top:'40px', left:'40px', transform:'rotate(-3deg)'}}>
            <div className="l">오늘 수익</div>
            <div className="v" style={{color:'var(--brand)'}}>+₩1,247,300</div>
          </div>
          <div className="card" style={{top:'90px', right:'30px', transform:'rotate(2deg)'}}>
            <div className="l">실시간 요청</div>
            <div className="v">2,481 / 분</div>
          </div>
          <div className="card" style={{bottom:'60px', left:'50px', transform:'rotate(2deg)', width:'200px'}}>
            <div className="l" style={{marginBottom:'8px'}}>AI 회사별 비중</div>
            <div style={{display:'flex', gap:'6px', alignItems:'flex-end', height:'40px'}}>
              <span style={{flex:4, background:'#2b6df6', borderRadius:'4px 4px 0 0', height:'100%'}}></span>
              <span style={{flex:3, background:'#9d6bff', borderRadius:'4px 4px 0 0', height:'75%'}}></span>
              <span style={{flex:2, background:'#ff7a5c', borderRadius:'4px 4px 0 0', height:'50%'}}></span>
              <span style={{flex:2, background:'#1aa377', borderRadius:'4px 4px 0 0', height:'48%'}}></span>
              <span style={{flex:1, background:'#c4a01a', borderRadius:'4px 4px 0 0', height:'25%'}}></span>
            </div>
          </div>
          <div className="card" style={{bottom:'80px', right:'50px', transform:'rotate(-2deg)'}}>
            <div className="l">차단된 무단 스크랩</div>
            <div className="v" style={{color:'#d4351c'}}>2.9M건</div>
          </div>

          <svg width="160" height="160" viewBox="0 0 160 160" style={{zIndex:1}}>
            <circle cx="80" cy="80" r="60" fill="#fff" stroke="#2b6df6" strokeWidth="2"/>
            <circle cx="80" cy="80" r="40" fill="#2b6df6" opacity="0.1"/>
            <path d="M80 50 L100 60 L100 84 C100 96 92 104 80 108 C68 104 60 96 60 84 L60 60 Z" fill="#2b6df6"/>
            <path d="M70 80 L78 88 L92 72" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="section-head">
          <div className="section-tag">━ 주요 기능</div>
          <h2>복잡한 설정 없이, <br/>콘텐츠가 알아서 돈이 됩니다</h2>
          <p>코드 한 줄, 클릭 몇 번이면 끝. 어려운 건 GuardUs가 다 처리합니다.</p>
        </div>

        <div className="fgrid">
          <div className="fcard p-blue span-7">
            <div className="ftag">실시간 분석</div>
            <h3>어떤 AI가 우리 사이트를 얼마나 보는지, 한눈에</h3>
            <p>GPTBot, ClaudeBot, PerplexityBot, Googlebot까지 — 봇별로 어떤 페이지가 인기 있고 어디서 수익이 나는지 실시간으로 보여드려요.</p>
            <div className="vis">
              <div style={{background:'#fff', borderRadius:'14px', padding:'16px'}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', color:'var(--ink-dim)', marginBottom:'10px'}}>
                  <span style={{fontWeight:600, color:'var(--ink)'}}>AI 회사별 요청 (지난 7일)</span>
                  <span>실시간</span>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'7px', fontSize:'13px'}}>
                  {[
                    {name:'GPTBot',    color:'#2b6df6', pct:'82%', val:'4.89M'},
                    {name:'ClaudeBot', color:'#9d6bff', pct:'55%', val:'3.10M'},
                    {name:'Perplexity',color:'#ff7a5c', pct:'35%', val:'1.48M'},
                    {name:'Googlebot', color:'#1aa377', pct:'42%', val:'2.20M'},
                  ].map(r => (
                    <div key={r.name} style={{display:'flex', alignItems:'center', gap:'10px'}}>
                      <span style={{width:'90px', color:'var(--ink)'}}>{r.name}</span>
                      <div style={{flex:1, height:'10px', background:'#f0f2f6', borderRadius:'5px', overflow:'hidden'}}>
                        <div style={{width:r.pct, height:'100%', background:r.color}}></div>
                      </div>
                      <span style={{color:'var(--ink)', fontWeight:600, minWidth:'60px', textAlign:'right'}}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="fcard p-mint span-5">
            <div className="ftag">자동 수익화</div>
            <h3>요청 1건당 자동으로 수익이 쌓여요</h3>
            <p>AI가 우리 페이지를 한 번 볼 때마다 미리 정한 가격이 자동으로 정산됩니다. 월말에 한 번에 입금받으세요.</p>
            <div className="vis">
              <div className="mini-line" style={{fontFamily:'var(--sans)', fontSize:'14px'}}>
                <div>📰 기사 페이지 1건 → <strong style={{color:'var(--ok)'}}>+₩2.6</strong></div>
                <div>📊 분석 리포트 1건 → <strong style={{color:'var(--ok)'}}>+₩5.2</strong></div>
                <div style={{marginTop:'6px', paddingTop:'6px', borderTop:'1px solid rgba(0,0,0,0.08)', fontWeight:700}}>오늘만 ₩1,247,300 적립 ✨</div>
              </div>
            </div>
          </div>

          <div className="fcard p-peach span-4">
            <div className="ftag">간단한 규칙</div>
            <h3>어떤 페이지를 어떻게 줄지 직접 정하세요</h3>
            <p>무료로 공개할 곳, 유료로 줄 곳, 아예 막을 곳 — 경로별로 자유롭게 설정. 변경은 바로 적용돼요.</p>
            <div className="vis">
              <div style={{background:'rgba(255,255,255,0.75)', borderRadius:'12px', padding:'12px', fontSize:'13.5px', lineHeight:1.9}}>
                <div><span style={{background:'var(--pastel-mint)', color:'var(--ok)', padding:'2px 8px', borderRadius:'6px', fontSize:'11.5px', fontWeight:700}}>무료</span>&nbsp; /robots.txt</div>
                <div><span style={{background:'var(--brand-soft)', color:'var(--brand)', padding:'2px 8px', borderRadius:'6px', fontSize:'11.5px', fontWeight:700}}>유료</span>&nbsp; /articles/*</div>
                <div><span style={{background:'#ffd9d3', color:'var(--bad)', padding:'2px 8px', borderRadius:'6px', fontSize:'11.5px', fontWeight:700}}>차단</span>&nbsp; /admin/*</div>
              </div>
            </div>
          </div>

          <div className="fcard p-lilac span-4">
            <div className="ftag">무단 스크랩 방지</div>
            <h3>가짜 봇, 무단 크롤러는 자동으로 차단</h3>
            <p>User-Agent를 속이는 가짜 봇과 robots.txt를 무시하는 무단 크롤러를 엣지에서 자동으로 막아드려요.</p>
            <div className="vis">
              <div style={{background:'rgba(255,255,255,0.75)', borderRadius:'12px', padding:'14px', fontFamily:'var(--mono)', fontSize:'12px', lineHeight:1.7}}>
                <div style={{color:'var(--ok)'}}>✓ GPTBot/1.2 — 검증 완료</div>
                <div style={{color:'var(--bad)'}}>✗ FakeBot/2.0 — 차단됨</div>
                <div style={{color:'var(--bad)'}}>✗ scrapy/2.5 — 차단됨</div>
              </div>
            </div>
          </div>

          <div className="fcard p-rose span-4">
            <div className="ftag">매월 자동 정산</div>
            <h3>은행 계좌로 매월 자동 입금</h3>
            <p>정산 보고서, 세금계산서, 입금까지 전부 자동. 신경 쓸 일은 콘텐츠를 만드는 것뿐이에요.</p>
            <div className="vis">
              <div style={{background:'rgba(255,255,255,0.75)', borderRadius:'12px', padding:'14px'}}>
                <div style={{fontSize:'12px', color:'var(--ink-dim)', marginBottom:'4px'}}>2026년 4월 정산 예정</div>
                <div style={{fontSize:'24px', fontWeight:800, color:'var(--ink)'}}>₩34,210,500</div>
                <div style={{fontSize:'12px', color:'var(--ok)', marginTop:'4px'}}>↑ 지난달 대비 +18.4%</div>
              </div>
            </div>
          </div>

          <div className="fcard dark span-12">
            <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:'32px', alignItems:'center'}}>
              <div>
                <div className="ftag">새로운 콘텐츠 수익 모델</div>
                <h3 style={{fontSize:'30px', maxWidth:'560px'}}>광고에만 의존하지 마세요. <br/>좋은 콘텐츠는 AI에게도 가치 있습니다.</h3>
                <p style={{marginTop:'12px'}}>AI 시대, 콘텐츠가 가진 가치를 정당하게 인정받을 차례입니다. GuardUs는 크리에이터와 퍼블리셔가 새로운 수익 채널을 열 수 있도록 돕습니다.</p>
              </div>
              <div style={{fontFamily:'var(--mono)', fontSize:'13px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'14px', padding:'18px', lineHeight:1.8}}>
                <div style={{color:'#9aa1ad', marginBottom:'6px'}}>월별 수익 추이</div>
                <div style={{color:'#fff'}}>1월 &nbsp; ₩18M</div>
                <div style={{color:'#fff'}}>2월 &nbsp; ₩24M</div>
                <div style={{color:'#fff'}}>3월 &nbsp; ₩29M</div>
                <div style={{color:'var(--brand-2)', fontWeight:700}}>4월 &nbsp; ₩34M ↑</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <div className="section-head">
          <div className="section-tag">━ 이용 방법</div>
          <h2>처음 써도 10분이면 충분해요</h2>
          <p>설치 한 번이면 그 다음부터는 자동입니다. 매일 아침 대시보드만 확인하세요.</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <h4>가입하기</h4>
            <p>이메일만 있으면 가입 끝. 신용카드 등록도 필요 없어요.</p>
          </div>
          <div className="step">
            <div className="num">2</div>
            <h4>사이트 연결</h4>
            <p>제공해드린 한 줄 설정을 서버에 추가. Cloudflare 사용중이면 클릭 한 번이면 돼요.</p>
          </div>
          <div className="step">
            <div className="num">3</div>
            <h4>가격 정하기</h4>
            <p>어떤 페이지를 얼마에 팔지 자유롭게 설정. 추천 가격을 그대로 써도 돼요.</p>
          </div>
          <div className="step">
            <div className="num">4</div>
            <h4>수익 받기</h4>
            <p>매월 1일 자동 정산, 자동 입금. 보고서까지 메일로 보내드려요.</p>
          </div>
        </div>
      </section>

      {/* BAND */}
      <section className="band" id="numbers">
        <div className="band-inner">
          <div className="section-tag">━ 숫자로 보는 GuardUs</div>
          <h2>이미 많은 퍼블리셔가 함께하고 있어요</h2>
          <p className="lead">2026년 1분기 기준, GuardUs가 처리한 트래픽입니다.</p>
          <div className="numbers">
            <div><div className="big">12.3M+</div><div className="label">매달 처리하는 AI 봇 요청</div></div>
            <div><div className="big">2.9M+</div><div className="label">자동 차단된 무단 스크랩</div></div>
            <div><div className="big">₩340M+</div><div className="label">퍼블리셔에게 정산된 누적 수익</div></div>
            <div><div className="big">99.99%</div><div className="label">엣지 게이트웨이 가동률</div></div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="cta-inner">
          <h2>좋은 콘텐츠가 정당한 가치를 받는,<br/>새로운 수익의 시작.</h2>
          <p>14일 무료 체험 · 신용카드 등록 없이 시작 · 언제든 해지 가능</p>
          <div className="cta-btns">
            <Link className="btn brand" href="/portal">
              지금 무료로 시작
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </Link>
            <Link className="btn" href="/portal">대시보드 미리보기</Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-inner">
          <span>© 2026 GuardUs · AI 시대의 콘텐츠 수익화 플랫폼</span>
          <div className="links">
            <a href="#">AI 회사 페이지</a>
            <Link href="/portal">대시보드</Link>
            <a href="#">고객센터</a>
            <a href="#">이용약관</a>
          </div>
        </div>
      </footer>
    </>
  )
}
