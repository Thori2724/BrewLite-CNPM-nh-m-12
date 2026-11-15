import {
  getManageProductsApi,
  ProductManage,
  updateProductApi,
  updateProductAvailabilityApi,
} from '../../../services/api';
import { AUTH_ERROR_MESSAGES } from '../../../services/auth-contract';
import { isAccountLockedError } from '../../../utils/auth';
import { formatVnd } from '../../../utils/validation';
import {
  getMockStaffProducts,
  isStaffProductsMockEnabled,
  updateMockStaffProductAvailability,
  updateMockStaffProductVisibility,
} from '../mocks/staff-products-mock';

export const STAFF_PRODUCT_ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra khi xử lý thông tin món. Vui lòng thử lại.',
} as const;

export const STAFF_PRODUCT_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='10' fill='%23E5D7C4'/%3E%3Cpath d='M28 40h32v20a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14V40zm32 5h6a7 7 0 0 1 0 14h-6' fill='none' stroke='%23354024' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export function formatStaffProductVnd(amount: number): string {
  return formatVnd(amount);
}

/**
 * Lấy danh sách toàn bộ món từ GET /products/manage (bao gồm cả món ẩn).
 */
export async function fetchStaffProducts(forceMock = false): Promise<ProductManage[]> {
  if (forceMock || isStaffProductsMockEnabled()) {
    return getMockStaffProducts();
  }

  return getManageProductsApi();
}

/**
 * Gạt trạng thái Đang bán / Tạm hết qua PATCH /products/:id/availability.
 * Chỉ gửi duy nhất trường `isAvailable`.
 */
export async function updateStaffProductAvailability(
  productId: string,
  isAvailable: boolean,
  forceMock = false
): Promise<ProductManage> {
  if (forceMock || isStaffProductsMockEnabled()) {
    return updateMockStaffProductAvailability(productId, isAvailable);
  }

  return updateProductAvailabilityApi(productId, { isAvailable });
}

/**
 * Ẩn hoặc hiện món qua PATCH /products/:id.
 * Chỉ gửi duy nhất trường `isVisible`.
 */
export async function updateStaffProductVisibility(
  productId: string,
  isVisible: boolean,
  forceMock = false
): Promise<ProductManage> {
  if (forceMock || isStaffProductsMockEnabled()) {
    return updateMockStaffProductVisibility(productId, isVisible);
  }

  return updateProductApi(productId, { isVisible });
}

export interface ParsedStaffProductError {
  statusCode: number;
  message: string;
  isUnauthorized: boolean;
  isAccountLocked: boolean;
  isNotFound: boolean;
}

export function parseStaffProductError(err: unknown): ParsedStaffProductError {
  let statusCode = 0;
  let message = '';

  if (err && typeof err === 'object') {
    const candidate = err as {
      statusCode?: unknown;
      message?: unknown;
    };

    if (typeof candidate.statusCode === 'number') {
      statusCode = candidate.statusCode;
    }

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      message = candidate.message.trim();
    } else if (Array.isArray(candidate.message)) {
      const joined = candidate.message
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(', ');
      if (statusCode === 400) {
        message = AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
      } else {
        message = joined;
      }
    }
  }

  const isAccountLocked = isAccountLockedError(err);
  const isUnauthorized = statusCode === 401;
  const isNotFound = statusCode === 404;

  if (isAccountLocked) {
    message = AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED;
  } else if (isUnauthorized && !message) {
    message = AUTH_ERROR_MESSAGES.SESSION_EXPIRED;
  } else if (statusCode === 403 && !message) {
    message = AUTH_ERROR_MESSAGES.FORBIDDEN;
  } else if (statusCode === 0 && !message) {
    message = STAFF_PRODUCT_ERROR_MESSAGES.NETWORK_ERROR;
  } else if (!message) {
    message = STAFF_PRODUCT_ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  return {
    statusCode,
    message,
    isUnauthorized,
    isAccountLocked,
    isNotFound,
  };
}

