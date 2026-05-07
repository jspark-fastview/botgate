'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { me, logout } from '@/lib/api'

interface User { id: string; email: string; name: string }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    me().then(setUser).catch(() => {
      // not authenticated — redirect to login
      router.replace('/login')
    })
  }, [router])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  async function handleLogout() {
    await logout()
    router.replace('/portal/login')
  }

  return (
    <>
      <style>{`
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
      `}</style>

      <div className="app-shell">
        <aside className="side">
          <Link href="/" className="side-logo">
            <span className="logo-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 3l8 4v5c0 4.5-3.5 8.5-8 9-4.5-.5-8-4.5-8-9V7l8-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </span>
            <span>GuardUs</span>
          </Link>

          <div className="side-section">
            <span className="h">포털</span>
            <Link href="/portal/dashboard" className={isActive('/portal/dashboard') ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
                <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
              </svg>
              내 대시보드
            </Link>
            <Link href="/portal/channels" className={isActive('/portal/channels') ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
              </svg>
              내 채널
            </Link>
            <Link href="/portal/tokens" className={isActive('/portal/tokens') ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
              내 토큰
            </Link>
          </div>

          <div className="side-foot">
            <div className="name">{user?.name ?? '—'}</div>
            <div className="email">{user?.email ?? '—'}</div>
            <button className="logout-btn" onClick={handleLogout}>로그아웃</button>
          </div>
        </aside>

        <main className="portal-main">
          {children}
        </main>
      </div>
    </>
  )
}
