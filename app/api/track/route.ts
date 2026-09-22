import { markRedirected } from '@/lib/links.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Beacon xác nhận trình duyệt thật đã chuyển hướng.
 *
 * Đây là lớp thứ hai của bộ lọc bot. Bộ quét email (Gmail proxy, Outlook
 * SafeLinks, phần mềm diệt virus doanh nghiệp) mở link để kiểm tra nhưng hầu
 * như không chạy JavaScript — nên chúng không bao giờ gọi tới đây. Chỉ lượt nào
 * bắn beacon về mới được tính là click thật.
 *
 * Gọi bằng navigator.sendBeacon nên body là text/plain, không phải JSON.
 */
export async function POST(request: Request) {
  let token = ''
  try {
    token = (await request.text()).trim()
  } catch {
    return new Response(null, { status: 204 })
  }

  // Luôn trả 204 dù token sai: đây là beacon "bắn rồi quên", client không đọc
  // kết quả, và không nên để lộ token nào hợp lệ.
  try {
    if (token) await markRedirected(token)
  } catch (err) {
    console.error('[track] không cập nhật được lượt truy cập:', err)
  }

  return new Response(null, { status: 204 })
}
