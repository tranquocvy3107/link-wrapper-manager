import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '404 — Link không tồn tại hoặc đã hết hiệu lực',
  robots: { index: false, follow: false },
}

export default function LinkNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold text-[var(--color-muted)]">404</p>
      <h1 className="text-lg font-medium text-[var(--color-ink)]">
        Link không tồn tại hoặc đã hết hiệu lực
      </h1>
      <p className="text-sm text-[var(--color-muted)]">
        Đường dẫn bạn vừa mở không còn khả dụng. Hãy kiểm tra lại email gốc hoặc liên hệ người gửi.
      </p>
    </main>
  )
}
