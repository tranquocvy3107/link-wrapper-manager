import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Link Wrapper Manager',
  description: 'Trang chuyển hướng trung gian',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
