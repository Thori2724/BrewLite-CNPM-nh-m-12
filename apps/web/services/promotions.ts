import { apiRequest } from './auth';
import { isMockPromotionsActive } from '../mocks/mock-config';
import {
  mockCreatePromotion,
  mockGetPromotions,
  mockUpdatePromotion,
  mockValidatePromotion,
} from '../mocks/mock-promotions';

export type PromotionType = 'PERCENT' | 'FIXED';

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  PERCENT: 'Giảm theo %',
  FIXED: 'Giảm số tiền',
};

export const PROMOTION_STATUS_LABELS = {
  ACTIVE: 'Đang bật',
  INACTIVE: 'Đã tắt',
} as const;

export function getPromotionStatusLabel(isActive: boolean): string {
  return isActive ? PROMOTION_STATUS_LABELS.ACTIVE : PROMOTION_STATUS_LABELS.INACTIVE;
}

export const PROMOTION_ERROR_MESSAGES = {
  NOT_FOUND: 'Mã giảm giá không tồn tại',
  INACTIVE: 'Mã giảm giá đã ngừng áp dụng',
  ALREADY_EXISTS: 'Mã giảm giá đã tồn tại',
  MANAGE_NOT_FOUND: 'Không tìm thấy mã giảm giá',
} as const;

export interface Promotion {
  id: string;
  code: string;
  type: PromotionType;
  value: number;
  maxDiscount: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface ValidatePromotionDto {
  code: string;
  subtotal: number;
}

export interface ValidatePromotionResponse {
  code: string;
  type: PromotionType;
  value: number;
  maxDiscount: number | null;
  discountAmount: number;
}

export interface CreatePromotionDto {
  code: string;
  type: PromotionType;
  value: number;
  maxDiscount?: number;
  isActive?: boolean;
}

export interface UpdatePromotionDto {
  type?: PromotionType;
  value?: number;
  maxDiscount?: number;
  isActive?: boolean;
}

export const PROMOTION_ENDPOINTS = {
  VALIDATE: '/promotions/validate',
  LIST: '/promotions',
  CREATE: '/promotions',
  UPDATE: (id: string) => `/promotions/${encodeURIComponent(id)}`,
} as const;

/**
 * Kiểm tra và tính xem trước số tiền giảm của mã khuyến mãi.
 * Endpoint: POST /promotions/validate (Khách đã đăng nhập)
 */
export async function validatePromotionApi(
  dto: ValidatePromotionDto
): Promise<ValidatePromotionResponse> {
  if (isMockPromotionsActive()) {
    return mockValidatePromotion(dto);
  }

  return apiRequest<ValidatePromotionResponse>(PROMOTION_ENDPOINTS.VALIDATE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Lấy danh sách toàn bộ mã khuyến mãi (mới nhất trước).
 * Endpoint: GET /promotions (ADMIN)
 */
export async function getPromotionsApi(): Promise<Promotion[]> {
  if (isMockPromotionsActive()) {
    return mockGetPromotions();
  }

  return apiRequest<Promotion[]>(PROMOTION_ENDPOINTS.LIST, {
    method: 'GET',
  });
}

/**
 * Tạo mã khuyến mãi mới.
 * Endpoint: POST /promotions (ADMIN)
 */
export async function createPromotionApi(dto: CreatePromotionDto): Promise<Promotion> {
  if (isMockPromotionsActive()) {
    return mockCreatePromotion(dto);
  }

  return apiRequest<Promotion>(PROMOTION_ENDPOINTS.CREATE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Cập nhật hoặc bật/tắt mã khuyến mãi (không sửa code).
 * Endpoint: PATCH /promotions/:id (ADMIN)
 */
export async function updatePromotionApi(
  id: string,
  dto: UpdatePromotionDto
): Promise<Promotion> {
  if (isMockPromotionsActive()) {
    return mockUpdatePromotion(id, dto);
  }

  return apiRequest<Promotion>(PROMOTION_ENDPOINTS.UPDATE(id), {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}
