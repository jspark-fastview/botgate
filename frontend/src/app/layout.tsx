import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GuardUs',
  description: 'AI Bot Traffic Gateway',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
