import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiUrl = process.env.API_URL || 'http://localhost:3002'
    return {
      beforeFiles: [
        // /portal 또는 /portal/* 모두 기존 SPA(portal-app.html)로 서빙
        { source: '/portal',          destination: '/portal-app.html' },
        { source: '/portal/:path*',   destination: '/portal-app.html' },
      ],
      afterFiles: [
        { source: '/api/:path*',   destination: `${apiUrl}/:path*` },
        // SPA(portal-app.html)가 ${origin}/me/* 형태로 직접 호출 → admin-api 로 프록시
        { source: '/me/:path*',    destination: `${apiUrl}/me/:path*` },
        { source: '/auth/:path*',  destination: `${apiUrl}/auth/:path*` },
        { source: '/admin/:path*', destination: `${apiUrl}/admin/:path*` },
      ],
      fallback: [],
    }
  },
}

export default nextConfig
