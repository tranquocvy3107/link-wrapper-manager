/**
 * Nhận diện lượt truy cập do máy tạo ra.
 *
 * Lý do tồn tại: link này nằm trong email. Gmail, Outlook SafeLinks và phần mềm
 * quét thư doanh nghiệp tự mở mọi link để kiểm tra virus, TRƯỚC khi người nhận
 * thấy email. Không lọc thì số click bị thổi phồng và báo cáo mất giá trị.
 *
 * Đây chỉ là lớp thứ nhất và nó không hoàn hảo — bộ quét có thể giả mạo
 * User-Agent. Lớp thứ hai là beacon /api/track: bộ quét hầu như không chạy
 * JavaScript, nên chỉ lượt nào bắn beacon về mới được tính là click thật.
 */

const BOT_UA_PATTERNS: RegExp[] = [
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /slurp/i,
  /googleimageproxy/i, // Gmail proxy ảnh
  /google-?safety/i,
  /safelinks/i, // Microsoft Outlook SafeLinks
  /microsoft office/i,
  /ms-office/i,
  /outlook/i,
  /barracuda/i,
  /proofpoint/i,
  /mimecast/i,
  /symantec/i,
  /forcepoint/i,
  /trendmicro/i,
  /bitdefender/i,
  /cloudflare-healthcheck/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /discordbot/i,
  /skypeuripreview/i,
  /curl\//i,
  /wget/i,
  /python-requests/i,
  /axios\//i,
  /node-fetch/i,
  /go-http-client/i,
  /java\//i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /preview/i,
  /monitor/i,
  /uptime/i,
  /pingdom/i,
]

/** Header báo trình duyệt đang nạp trước, không phải người dùng thật sự mở. */
function isPrefetch(headers: Headers): boolean {
  const secPurpose = headers.get('sec-purpose') ?? ''
  const purpose = headers.get('purpose') ?? headers.get('x-purpose') ?? ''
  const moz = headers.get('x-moz') ?? ''

  return (
    /prefetch|prerender/i.test(secPurpose) ||
    /prefetch|preview/i.test(purpose) ||
    /prefetch/i.test(moz)
  )
}

export interface BotCheck {
  isBot: boolean
  reason: 'user_agent' | 'prefetch' | 'no_user_agent' | null
}

export function detectBot(headers: Headers): BotCheck {
  if (isPrefetch(headers)) return { isBot: true, reason: 'prefetch' }

  const ua = headers.get('user-agent')
  if (!ua || !ua.trim()) return { isBot: true, reason: 'no_user_agent' }
  if (BOT_UA_PATTERNS.some((re) => re.test(ua))) {
    return { isBot: true, reason: 'user_agent' }
  }

  return { isBot: false, reason: null }
}
