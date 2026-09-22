import Script from 'next/script'

interface Props {
  /** Chuỗi rỗng = không nhúng gì cả. */
  measurementId: string
  pageTitle: string
}

/**
 * Nhúng Google Analytics 4.
 *
 * `measurementId` được truyền xuống qua prop từ server component chứ KHÔNG đọc
 * từ NEXT_PUBLIC_*. Lý do: Next.js nhúng cứng biến NEXT_PUBLIC_* vào bundle lúc
 * build, nên điền mã GA4 sau này sẽ phải build lại toàn bộ. Đọc ở server rồi
 * truyền xuống thì chỉ cần đổi env và restart. Xem CONTEXT.md mục 3.8.
 */
export default function Ga4Script({ measurementId, pageTitle }: Props) {
  if (!measurementId) return null

  const id = JSON.stringify(measurementId)
  const title = JSON.stringify(pageTitle)

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config',${id},{page_title:${title},send_page_view:true});`}
      </Script>
    </>
  )
}
