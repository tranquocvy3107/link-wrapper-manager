export const ALIAS_MAX_LENGTH = 64

/** Alias hợp lệ: chữ thường, số, gạch ngang ở giữa. Không bắt đầu/kết thúc bằng `-`. */
export const ALIAS_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/

/**
 * Chuyển tiêu đề thành slug dùng được trên URL.
 *
 * Tiếng Việt: NFD tách được hầu hết dấu thanh và dấu mũ, nhưng `đ`/`Đ` là một
 * ký tự độc lập, KHÔNG phân rã. Phải thay tay trước khi normalize, nếu không
 * "Dự án" ra "du-Đan".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFC')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu thanh + dấu mũ đã tách ra
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // mọi thứ còn lại thành gạch ngang
    .replace(/-+/g, '-') // gộp gạch ngang liên tiếp
    .replace(/^-|-$/g, '') // bỏ gạch ngang đầu/cuối
    .slice(0, ALIAS_MAX_LENGTH)
    .replace(/-$/, '') // cắt chuỗi có thể để lại gạch ngang cuối
}

export function isValidAlias(alias: string): boolean {
  return ALIAS_PATTERN.test(alias)
}

/**
 * Ứng viên alias cho lần thử thứ `attempt`.
 * attempt 0 → "project-a", attempt 1 → "project-a-2", attempt 2 → "project-a-3"...
 *
 * Cắt phần gốc nếu cần để tổng độ dài không vượt ALIAS_MAX_LENGTH.
 */
export function aliasCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base

  const suffix = `-${attempt + 1}`
  const room = ALIAS_MAX_LENGTH - suffix.length
  return `${base.slice(0, room).replace(/-$/, '')}${suffix}`
}

/** Dùng khi slug rỗng (ví dụ title toàn ký tự đặc biệt) hoặc đụng độ quá nhiều lần. */
export function randomAlias(prefix = 'link'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${rand}`
}
