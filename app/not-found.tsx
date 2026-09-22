import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '404 — Không tìm thấy trang',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold text-[var(--color-muted)]">404</p>
      <h1 className="text-lg font-medium text-[var(--color-ink)]">Không tìm thấy trang</h1>
    </main>
  )
}
