'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, register } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]         = useState<'login' | 'register'>('login')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await register(email, password, name)
      }
      const res = await login(email, password)
      localStorage.setItem('portalToken', res.token)
      // 로그인 후 SPA 대시보드로 (rewrite: /portal/* → portal-app.html)
      window.location.href = '/portal/dashboard'
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message || '처리 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .login-wrap {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: #f6f8fb; padding: 24px;
        }
        .login-box {
          background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg);
          padding: 40px; width: 100%; max-width: 420px;
        }
        .login-logo {
          display: flex; align-items: center; gap: 10px; margin-bottom: 28px;
          font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink);
          text-decoration: none;
        }
        .login-logo .logo-mark {
          width: 32px; height: 32px; border-radius: 10px; background: var(--brand);
          display: flex; align-items: center; justify-content: center;
        }
        .login-box h2 { font-size: 22px; font-weight: 800; margin: 0 0 6px; color: var(--ink); }
        .login-box .sub { font-size: 14px; color: var(--ink-dim); margin-bottom: 28px; }
        .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
        .field label { font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
        .field input {
          padding: 10px 13px; border: 1px solid var(--line); border-radius: 9px;
          font-size: 14px; font-family: var(--sans); outline: none; transition: border-color 150ms;
        }
        .field input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
        .login-err { background: #fff0ef; color: var(--bad); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
        .login-submit { width: 100%; margin-top: 6px; }
        .login-toggle { text-align: center; margin-top: 16px; font-size: 13px; color: var(--ink-dim); }
        .login-toggle button { background: none; border: none; color: var(--brand); font-weight: 600; cursor: pointer; font-size: 13px; font-family: var(--sans); }
      `}</style>

      <div className="login-wrap">
        <div className="login-box">
          <Link href="/" className="login-logo">
            <span className="logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 3l8 4v5c0 4.5-3.5 8.5-8 9-4.5-.5-8-4.5-8-9V7l8-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </span>
            GuardUs
          </Link>

          <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>
          <p className="sub">
            {mode === 'login' ? '채널 오너 포털에 오신 걸 환영합니다.' : '이메일로 계정을 만드세요.'}
          </p>

          {error && <div className="login-err">{error}</div>}

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="field">
                <label htmlFor="name">이름</label>
                <input
                  id="name" type="text" required
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="홍길동"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                id="email" type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">비밀번호</label>
              <input
                id="password" type="password" required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="8자 이상"
              />
            </div>

            <button type="submit" className="btn brand login-submit" disabled={loading}>
              {loading ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </form>

          <div className="login-toggle">
            {mode === 'login' ? (
              <>계정이 없으신가요? <button onClick={() => { setMode('register'); setError('') }}>회원가입</button></>
            ) : (
              <>이미 계정이 있으신가요? <button onClick={() => { setMode('login'); setError('') }}>로그인</button></>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
