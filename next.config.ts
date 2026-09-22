import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Thư mục cha có package-lock.json riêng, Next.js đoán nhầm workspace root và
  // gói cả cây thư mục ngoài vào build trace. Ghim cứng về thư mục dự án.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Trang bọc không bao giờ được lập chỉ mục. Đặt ở header vì nhiều crawler
  // ưu tiên header hơn thẻ <meta>.
  async headers() {
    return [
      {
        source: '/r/:alias*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ]
  },
}

export default nextConfig
