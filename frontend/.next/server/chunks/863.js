exports.id=863,exports.ids=[863],exports.modules={2164:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>d});var n=r(687),o=r(5814),s=r.n(o),i=r(6189),a=r(3210),l=r(2185);function d({children:e}){let t=(0,i.usePathname)(),r=(0,i.useRouter)(),[o,d]=(0,a.useState)(null);function c(e){return t===e||t.startsWith(e+"/")}async function h(){await (0,l.ri)(),r.replace("/portal/login")}return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)("style",{children:`
        body { background: #f6f8fb; }
        .app-shell { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
        .side {
          background: #fff; border-right: 1px solid var(--line);
          padding: 20px 16px; position: sticky; top: 0; height: 100vh;
          display: flex; flex-direction: column; gap: 24px; overflow-y: auto;
        }
        .side-logo {
          display: inline-flex; align-items: center; gap: 9px;
          font-weight: 800; font-size: 19px; letter-spacing: -0.02em; color: var(--ink);
          padding: 4px 6px; text-decoration: none;
        }
        .side-logo .logo-mark {
          width: 28px; height: 28px; border-radius: 8px;
          background: var(--brand);
          display: flex; align-items: center; justify-content: center;
        }
        .side-section { display: flex; flex-direction: column; gap: 2px; }
        .side-section .h {
          font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--ink-mute); padding: 6px 10px;
        }
        .side a {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-radius: 10px;
          font-size: 14px; font-weight: 500; color: var(--ink-2);
          cursor: pointer; transition: background 120ms;
          text-decoration: none;
        }
        .side a:hover { background: var(--bg-soft); color: var(--ink); }
        .side a.active { background: var(--brand-soft); color: var(--brand); font-weight: 600; }
        .side a svg { width: 18px; height: 18px; flex-shrink: 0; }
        .side-foot {
          margin-top: auto; padding: 14px;
          background: var(--bg-soft); border-radius: 14px; font-size: 13px;
        }
        .side-foot .name  { font-weight: 700; color: var(--ink); margin-bottom: 2px; }
        .side-foot .email { color: var(--ink-dim); font-size: 12px; margin-bottom: 8px; }
        .side-foot .logout-btn {
          font-size: 12px; color: var(--ink-dim); cursor: pointer;
          background: none; border: none; padding: 0; font-family: var(--sans);
        }
        .side-foot .logout-btn:hover { color: var(--bad); }
        .portal-main { padding: 28px 32px 60px; max-width: 1200px; }
        @media (max-width: 980px) {
          .app-shell { grid-template-columns: 1fr; }
          .side { position: relative; height: auto; flex-direction: row; overflow-x: auto; padding: 12px; }
          .side-section .h, .side-foot { display: none; }
          .portal-main { padding: 16px; }
        }
      `}),(0,n.jsxs)("div",{className:"app-shell",children:[(0,n.jsxs)("aside",{className:"side",children:[(0,n.jsxs)(s(),{href:"/",className:"side-logo",children:[(0,n.jsx)("span",{className:"logo-mark",children:(0,n.jsxs)("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"#fff",strokeWidth:"2.4",strokeLinecap:"round",children:[(0,n.jsx)("path",{d:"M12 3l8 4v5c0 4.5-3.5 8.5-8 9-4.5-.5-8-4.5-8-9V7l8-4z"}),(0,n.jsx)("path",{d:"M9 12l2 2 4-4"})]})}),(0,n.jsx)("span",{children:"GuardUs"})]}),(0,n.jsxs)("div",{className:"side-section",children:[(0,n.jsx)("span",{className:"h",children:"포털"}),(0,n.jsxs)(s(),{href:"/portal/dashboard",className:c("/portal/dashboard")?"active":"",children:[(0,n.jsxs)("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,n.jsx)("rect",{x:"3",y:"3",width:"7",height:"9"}),(0,n.jsx)("rect",{x:"14",y:"3",width:"7",height:"5"}),(0,n.jsx)("rect",{x:"14",y:"12",width:"7",height:"9"}),(0,n.jsx)("rect",{x:"3",y:"16",width:"7",height:"5"})]}),"내 대시보드"]}),(0,n.jsxs)(s(),{href:"/portal/channels",className:c("/portal/channels")?"active":"",children:[(0,n.jsxs)("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,n.jsx)("circle",{cx:"12",cy:"12",r:"9"}),(0,n.jsx)("path",{d:"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"})]}),"내 채널"]}),(0,n.jsxs)(s(),{href:"/portal/tokens",className:c("/portal/tokens")?"active":"",children:[(0,n.jsxs)("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,n.jsx)("rect",{x:"2",y:"7",width:"20",height:"14",rx:"2"}),(0,n.jsx)("path",{d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"})]}),"내 토큰"]})]}),(0,n.jsxs)("div",{className:"side-foot",children:[(0,n.jsx)("div",{className:"name",children:o?.name??"—"}),(0,n.jsx)("div",{className:"email",children:o?.email??"—"}),(0,n.jsx)("button",{className:"logout-btn",onClick:h,children:"로그아웃"})]})]}),(0,n.jsx)("main",{className:"portal-main",children:e})]})]})}},2185:(e,t,r)=>{"use strict";r.d(t,{Ft:()=>p,PZ:()=>x,Sc:()=>f,iD:()=>a,kz:()=>l,me:()=>c,oP:()=>u,ri:()=>d,ze:()=>h});let n="/api";function o(e={}){return{...e}}async function s(e){let t=await fetch(`${n}${e}`,{headers:o()});if(!t.ok)throw Object.assign(Error(t.statusText),{status:t.status});return t.json()}async function i(e,t){let r=await fetch(`${n}${e}`,{method:"POST",headers:o({"Content-Type":"application/json"}),body:JSON.stringify(t)});if(!r.ok)throw Object.assign(Error((await r.json().catch(()=>({}))).error||r.statusText),{status:r.status});return r.json()}function a(e,t){return i("/auth/login",{email:e,password:t})}function l(e,t,r){return i("/auth/register",{email:e,password:t,name:r})}async function d(){localStorage.removeItem("portalToken")}function c(){return s("/auth/me")}function h(){return s("/me/dashboard")}function p(){return s("/me/channels")}function u(e,t,r){return i("/me/channels",{name:e,domain:t,upstream:r})}function x(){return s("/me/tokens")}function f(e){return null==e?"—":e>=1e6?(e/1e6).toFixed(1)+"M":e>=1e3?(e/1e3).toFixed(1)+"K":String(e)}},2812:(e,t,r)=>{Promise.resolve().then(r.t.bind(r,6346,23)),Promise.resolve().then(r.t.bind(r,7924,23)),Promise.resolve().then(r.t.bind(r,5656,23)),Promise.resolve().then(r.t.bind(r,99,23)),Promise.resolve().then(r.t.bind(r,8243,23)),Promise.resolve().then(r.t.bind(r,8827,23)),Promise.resolve().then(r.t.bind(r,2763,23)),Promise.resolve().then(r.t.bind(r,7173,23))},3394:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>n});let n=(0,r(2907).registerClientReference)(function(){throw Error("Attempted to call the default export of \"/Users/fastview/botcontroller/frontend/src/app/portal/layout.tsx\" from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/Users/fastview/botcontroller/frontend/src/app/portal/layout.tsx","default")},4431:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>s,metadata:()=>o});var n=r(7413);let o={title:"GuardUs — AI 크롤러도 정당하게, 콘텐츠로 수익 만드세요",description:"AI Bot Traffic Monetization Gateway"};function s({children:e}){return(0,n.jsxs)("html",{lang:"ko",children:[(0,n.jsxs)("head",{children:[(0,n.jsx)("link",{rel:"preconnect",href:"https://fonts.googleapis.com"}),(0,n.jsx)("link",{rel:"preconnect",href:"https://fonts.gstatic.com",crossOrigin:"anonymous"}),(0,n.jsx)("link",{href:"https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css",rel:"stylesheet"}),(0,n.jsx)("link",{href:"https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap",rel:"stylesheet"}),(0,n.jsx)("link",{rel:"stylesheet",href:"/botgate-marketing.css"})]}),(0,n.jsx)("body",{children:e})]})}},5964:(e,t,r)=>{Promise.resolve().then(r.t.bind(r,6444,23)),Promise.resolve().then(r.t.bind(r,6042,23)),Promise.resolve().then(r.t.bind(r,8170,23)),Promise.resolve().then(r.t.bind(r,9477,23)),Promise.resolve().then(r.t.bind(r,9345,23)),Promise.resolve().then(r.t.bind(r,2089,23)),Promise.resolve().then(r.t.bind(r,6577,23)),Promise.resolve().then(r.t.bind(r,1307,23))},6189:(e,t,r)=>{"use strict";var n=r(5773);r.o(n,"usePathname")&&r.d(t,{usePathname:function(){return n.usePathname}}),r.o(n,"useRouter")&&r.d(t,{useRouter:function(){return n.useRouter}})},6487:()=>{},8335:()=>{},8738:(e,t,r)=>{Promise.resolve().then(r.bind(r,2164))},8986:(e,t,r)=>{Promise.resolve().then(r.bind(r,3394))}};