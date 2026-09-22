import { cache } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Ga4Script from '@/components/Ga4Script'
import RedirectCountdown from '@/components/RedirectCountdown'
import { getConfig } from '@/lib/config'
import { getLinkByAlias, recordVisit } from '@/lib/links.service'
import { mergeForwardedParams } from '@/lib/params'
import { verify } from '@/lib/signature'
import { checkUrl } from '@/lib/url-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchParams = Record<string, string | string[] | undefined>

interface PageProps {
  params: Promise<{ alias: string }>
  searchParams: Promise<SearchParams>
}

/**
 * `generateMetadata` và component chính đều cần cùng một bản ghi link.
 * `cache()` gộp hai lần gọi trong cùng một request thành một truy vấn database.
 */
const loadLink = cache(async (alias: string) => {
  try {
    return await getLinkByAlias(alias)
  } catch (err) {
    console.error('[wrapper] không đọc được link:', err)
    return null
  }
})

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function flattenQuery(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v)
    if (val !== null) out[k] = val
  }
  return out
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { alias } = await params
  const link = await loadLink(alias)

  // Trang bọc không bao giờ được lập chỉ mục. Header X-Robots-Tag đặt trong
  // next.config.ts là lớp thứ hai — nhiều crawler ưu tiên header hơn thẻ meta.
  const robots = {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  }

  if (!link) {
    return { title: 'Link không tồn tại hoặc đã hết hiệu lực', robots }
  }

  return {
    title: link.title,
    description: link.description ?? undefined,
    robots,
  }
}

export default async function WrapperPage({ params, searchParams }: PageProps) {
  const { alias } = await params
  const sp = await searchParams
  const cfg = getConfig()

  const link = await loadLink(alias)

  // ---------------------------------------------------------------------
  // Nhánh dự phòng: alias tra không ra.
  // Chữ ký chứng minh URL này do chính hệ thống tạo ra, nên có thể tin
  // tham số `continue` và chuyển thẳng người dùng tới đó.
  // ---------------------------------------------------------------------
  if (!link) {
    const continueRaw = first(sp.continue)
    const check = verify({
      secret: cfg.linkSigningSecret,
      alias,
      continueRaw,
      expires: first(sp.expires),
      signature: first(sp.signature),
    })

    if (check.ok) {
      const urlCheck = checkUrl(continueRaw, { allowedHosts: cfg.allowedDestinationHosts })
      // Chuyển tới đúng chuỗi đã được ký, không phải bản chuẩn hoá của URL().
      // redirect() ném NEXT_REDIRECT nên phải gọi ở ngoài mọi try/catch.
      if (urlCheck.ok) redirect(continueRaw!.trim())
    }

    notFound()
  }

  // ---------------------------------------------------------------------
  // Luồng chính
  // ---------------------------------------------------------------------
  const requestHeaders = await headers()

  let visitToken: string | null = null
  try {
    visitToken = await recordVisit({
      link,
      headers: requestHeaders,
      query: flattenQuery(sp),
    })
  } catch (err) {
    // Ghi số liệu hỏng không được phép chặn người dùng tới đích.
    console.error('[wrapper] không ghi được lượt truy cập:', err)
  }

  const destination = link.forwardParams
    ? mergeForwardedParams(link.destinationUrl, sp)
    : link.destinationUrl

  const seconds = Math.ceil(link.timeWait / 1000)
  const safeDestination = escapeHtml(destination)

  return (
    <>
      <Ga4Script measurementId={cfg.ga4Id} pageTitle={link.title} />

      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 px-6 py-12 text-center">
        <header className="flex flex-col gap-3">
          <h1 className="text-lg font-medium text-[var(--color-muted)]">
            Đang chuyển hướng an toàn tới:
          </h1>
          <p className="break-all text-base font-semibold text-[var(--color-ink)]">
            {destination}
          </p>
          {link.description ? (
            <p className="text-sm text-[var(--color-muted)]">{link.description}</p>
          ) : null}
        </header>

        <RedirectCountdown
          destinationUrl={destination}
          timeWaitMs={link.timeWait}
          visitToken={visitToken}
        />

        {/*
          Dự phòng khi JavaScript bị tắt. Dùng dangerouslySetInnerHTML để React 19
          không nhấc thẻ <meta> lên <head> — meta refresh phải nằm nguyên trong
          <noscript> mới có tác dụng.
        */}
        <noscript
          dangerouslySetInnerHTML={{
            __html:
              `<meta http-equiv="refresh" content="${seconds};url=${safeDestination}">` +
              `<p>Trình duyệt của bạn đang tắt JavaScript. ` +
              `<a href="${safeDestination}" rel="noreferrer">Bấm vào đây để đi đến trang đích</a>.</p>`,
          }}
        />
      </main>
    </>
  )
}
