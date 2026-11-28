import { apiRequest } from './auth';
import { isMockLoyaltyActive } from '../mocks/mock-config';
import { mockGetMyLoyalty } from '../mocks/mock-loyalty';

export type LoyaltyType = 'EARN' | 'REDEEM' | 'REFUND' | 'REVOKE';

export const LOYALTY_TYPE_LABELS: Record<LoyaltyType, string> = {
  EARN: 'Tích điểm',
  REDEEM: 'Dùng điểm',
  REFUND: 'Hoàn điểm',
  REVOKE: 'Thu hồi điểm',
};

/**
 * Đổi mã loại giao dịch điểm thưởng (`EARN`, `REDEEM`, `REFUND`, `REVOKE`) sang nhãn tiếng Việt.
 */
export function getLoyaltyTypeLabel(type: LoyaltyType | string): string {
  return LOYALTY_TYPE_LABELS[type as LoyaltyType] ?? type;
}

/**
 * Định dạng số điểm có dấu (`+N` cho số dương, `-N` cho số âm, `0` khi bằng 0).
 */
export function formatSignedLoyaltyPoints(points: number): string {
  const safePoints =
    typeof points === 'number' && Number.isFinite(points) ? Math.trunc(points) : 0;
  if (safePoints > 0) {
    return `+${safePoints}`;
  }
  if (safePoints < 0) {
    return `-${Math.abs(safePoints)}`;
  }
  return '0';
}

/**
 * Định dạng mã đơn trong lịch sử điểm (`#1042`, hoặc `—` khi `orderNumber` là `null`).
 */
export function formatLoyaltyOrderNumber(orderNumber: number | null | undefined): string {
  if (typeof orderNumber === 'number' && Number.isFinite(orderNumber)) {
    return `#${Math.trunc(orderNumber)}`;
  }
  return '—';
}

export interface LoyaltyTransaction {
  id: string;
  type: LoyaltyType;
  points: number;
  orderNumber: number | null;
  createdAt: string;
}

export interface LoyaltyMeResponse {
  loyaltyPoints: number;
  transactions: LoyaltyTransaction[];
}

export const LOYALTY_ENDPOINTS = {
  ME: '/loyalty/me',
} as const;

/**
 * Lấy số điểm hiện tại và tối đa 50 giao dịch điểm gần nhất của khách hàng.
 * Endpoint: GET /loyalty/me (CUSTOMER)
 */
export async function getMyLoyaltyApi(): Promise<LoyaltyMeResponse> {
  if (isMockLoyaltyActive()) {
    return mockGetMyLoyalty();
  }

  return apiRequest<LoyaltyMeResponse>(LOYALTY_ENDPOINTS.ME, {
    method: 'GET',
  });
}
