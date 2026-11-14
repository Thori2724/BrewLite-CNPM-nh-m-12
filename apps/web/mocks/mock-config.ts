/**
 * Cấu hình công tắc Mock tập trung cho Frontend.
 *
 * Quy tắc ưu tiên:
 * 1. Đọc biến chung `NEXT_PUBLIC_USE_MOCK` (mặc định TẮT khi chưa thiết lập hoặc khác `'true'`).
 * 2. Nếu `NEXT_PUBLIC_USE_MOCK` chưa được đặt (undefined hoặc rỗng), mới fallback về các biến cũ
 *    (`NEXT_PUBLIC_USE_MOCK_AUTH`, `NEXT_PUBLIC_USE_MOCK_PRODUCTS`, `NEXT_PUBLIC_USE_MOCK_ORDERS`)
 *    để đảm bảo các trang và bộ test hiện có vẫn hoạt động bình thường.
 */
export function isMockEnabled(legacyEnvValue?: string): boolean {
  const unifiedFlag = process.env.NEXT_PUBLIC_USE_MOCK;
  if (unifiedFlag !== undefined && unifiedFlag.trim() !== '') {
    return unifiedFlag.trim() === 'true';
  }
  return legacyEnvValue?.trim() === 'true';
}

export function isMockAuthActive(): boolean {
  return isMockEnabled(process.env.NEXT_PUBLIC_USE_MOCK_AUTH);
}

export function isMockProductsActive(): boolean {
  return isMockEnabled(process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS);
}

export function isMockOrdersActive(): boolean {
  return isMockEnabled(process.env.NEXT_PUBLIC_USE_MOCK_ORDERS);
}

export function isMockStaffActive(): boolean {
  return isMockEnabled(process.env.NEXT_PUBLIC_USE_MOCK_AUTH);
}

