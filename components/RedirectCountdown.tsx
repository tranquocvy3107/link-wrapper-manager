'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

interface Props {
  destinationUrl: string
  timeWaitMs: number
  /** Null khi không ghi được lượt truy cập — trang vẫn chạy bình thường. */
  visitToken: string | null
}

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function track(event: string, destinationUrl: string) {
  try {
    window.gtag?.('event', event, { destination_url: destinationUrl })
  } catch {
    // GA4 chưa cắm hoặc bị chặn — không phải lý do để chặn chuyển hướng.
  }
}

export default function RedirectCountdown({ destinationUrl, timeWaitMs, visitToken }: Props) {
  const total = Math.max(0, timeWaitMs)
  const [remaining, setRemaining] = useState(total)
  const [done, setDone] = useState(total === 0)
  const firedRef = useRef(false)

  const redirect = useCallback(
    (event: 'auto_redirect' | 'manual_redirect') => {
      if (firedRef.current) return
      firedRef.current = true

      track(event, destinationUrl)

      // Báo cho server biết đây là trình duyệt thật, không phải bộ quét email.
      // sendBeacon sống sót qua lúc trang bị unload, fetch thì không chắc.
      try {
        if (visitToken) navigator.sendBeacon?.('/api/track', visitToken)
      } catch {
        // Không chặn chuyển hướng chỉ vì beacon hỏng.
      }

      // replace chứ không assign: nút Back của trình duyệt sẽ không quay lại
      // trang bọc rồi chuyển hướng lần nữa.
      window.location.replace(destinationUrl)
    },
    [destinationUrl, visitToken],
  )

  useEffect(() => {
    if (total === 0) {
      setDone(true)
      redirect('auto_redirect')
      return
    }

    // requestAnimationFrame thay vì setInterval: vòng tròn chạy mượt, và thời
    // gian tính từ mốc thật nên không trôi sai khi trình duyệt bóp tần suất tab nền.
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const left = Math.max(0, total - (now - start))
      setRemaining(left)

      if (left <= 0) {
        setDone(true)
        redirect('auto_redirect')
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [total, redirect])

  const progress = total > 0 ? remaining / total : 0
  const seconds = Math.ceil(remaining / 1000)

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-32 w-32" role="timer" aria-live="off">
        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="8"
          />
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums">{seconds}</span>
        </div>
      </div>

      <p className="text-sm text-[var(--color-muted)]" aria-live="polite">
        {done ? 'Đang chuyển hướng…' : `Sẽ chuyển hướng sau ${seconds} giây.`}
      </p>

      {/* Spec yêu cầu: nút chỉ kích hoạt sau khi đếm ngược kết thúc. */}
      <button
        type="button"
        onClick={() => redirect('manual_redirect')}
        disabled={!done}
        className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        Đi đến trang đích
      </button>
    </div>
  )
}
