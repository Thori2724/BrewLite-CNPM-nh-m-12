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
