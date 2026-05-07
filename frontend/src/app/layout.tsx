import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GuardUs — AI 크롤러도 정당하게, 콘텐츠로 수익 만드세요',
  description: 'AI Bot Traffic Monetization Gateway',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/botgate-marketing.css" />
      </head>
      <body>{children}</body>
    </html>
  )
}
