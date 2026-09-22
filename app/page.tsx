export const dynamic = 'force-static'

/**
 * Trang gốc cố tình để trống thông tin.
 * Đây là hạ tầng chuyển hướng, không phải website công khai — không quảng bá gì.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-[var(--color-muted)]">Link Wrapper Manager</p>
    </main>
  )
}
