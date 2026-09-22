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

/**
 * Hạn chót chờ GA4 phản hồi, tính bằng ms.
 *
 * Đo thực tế trên bản chạy: `event_callback` gọi lại sau 4–15ms, nên độ trễ
 * người dùng cảm nhận được gần như bằng không. Con số 400 chỉ là lưới chặn cho
 * trường hợp GA4 bị chặn hoặc treo — hết giờ là chuyển hướng bất kể. Người dùng
 * KHÔNG bao giờ được phép kẹt lại vì chuyện đo đạc.
 */
const GA4_TIMEOUT_MS = 400

export default function RedirectCountdown({ destinationUrl, timeWaitMs, visitToken }: Props) {
  const total = Math.max(0, timeWaitMs)
  const [remaining, setRemaining] = useState(total)
  const [done, setDone] = useState(total === 0)
  const firedRef = useRef(false)

  const redirect = useCallback(
    (eventName: 'auto_redirect' | 'manual_redirect') => {
      if (firedRef.current) return
      firedRef.current = true

      // Báo cho server biết đây là trình duyệt thật, không phải bộ quét email.
      // sendBeacon được trình duyệt cam kết gửi xong dù trang đang đóng.
      try {
        if (visitToken) navigator.sendBeacon?.('/api/track', visitToken)
      } catch {
        // Không chặn chuyển hướng chỉ vì beacon hỏng.
      }

      // replace chứ không assign: nút Back của trình duyệt sẽ không quay lại
      // trang bọc rồi chuyển hướng lần nữa.
      const go = () => window.location.replace(destinationUrl)

      const gtag = window.gtag
      if (typeof gtag !== 'function') {
        go()
        return
      }

      // Chờ GA4 phản hồi trước khi chuyển trang. Đây là cách Google khuyến nghị
      // cho tình huống chuyển hướng ra ngoài.
      //
      // ĐỪNG hiểu nhầm `event_callback` là "đã gửi xong". Đo trên bản chạy thật:
      // callback gọi lại sau 4–15ms, nhưng lệnh gửi mạng xuất hiện sau vài giây,
      // và nhiều sự kiện bị gộp vào thân một request POST. Callback chỉ báo gtag
      // đã nhận sự kiện vào hàng đợi.
      //
      // Thứ thật sự cứu dữ liệu là gtag tự xả hàng đợi bằng sendBeacon lúc trang
      // đóng (nó tự gắn handler pagehide). Chờ callback chỉ là biên an toàn thêm,
      // gần như miễn phí vì chỉ mất chục mili giây.
      let navigated = false
      const goOnce = () => {
        if (navigated) return
        navigated = true
        go()
      }

      const timer = setTimeout(goOnce, GA4_TIMEOUT_MS)

      try {
        gtag('event', eventName, {
          destination_url: destinationUrl,
          event_callback: () => {
            clearTimeout(timer)
            goOnce()
          },
        })
      } catch {
        clearTimeout(timer)
        goOnce()
      }
    },
    [destinationUrl, visitToken],
  )

  useEffect(() => {
    if (total === 0) {
      setDone(true)
      redirect('auto_redirect')
      return
    }

    // Chỉ cộng dồn thời gian lúc tab đang HIỆN.
    //
    // requestAnimationFrame không chạy khi tab bị ẩn. Nếu tính theo giờ thực
    // thì người dùng mở link ở tab nền, lúc quay lại sẽ thấy đếm ngược nhảy
    // thẳng về 0 và chuyển hướng ngay — không kịp đọc mình đang đi đâu, tức là
    // mất đúng mục đích của trang bọc. Mốc lại `last` mỗi lần tab hiện lên để
    // quãng thời gian ẩn không bị tính vào.
    let elapsed = 0
    let last = performance.now()
    let frame = 0

    const onVisibilityChange = () => {
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const tick = (now: number) => {
      elapsed += now - last
      last = now

      const left = Math.max(0, total - elapsed)
      setRemaining(left)

      if (left <= 0) {
        setDone(true)
        redirect('auto_redirect')
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
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
