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
        { source: '/api/:path*', destination: `${apiUrl}/:path*` },
      ],
      fallback: [],
    }
  },
}

export default nextConfig
