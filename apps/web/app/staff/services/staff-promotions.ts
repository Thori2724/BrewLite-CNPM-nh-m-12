import { AUTH_ERROR_MESSAGES } from '../../../services/auth-contract';
import {
  getPromotionsApi,
  getPromotionStatusLabel,
  PROMOTION_ERROR_MESSAGES,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TYPE_LABELS,
  Promotion,
  PromotionType,
  updatePromotionApi,
} from '../../../services/promotions';
import { mockGetPromotions, mockUpdatePromotion } from '../../../mocks/mock-promotions';
import { isAccountLockedError } from '../../../utils/auth';
import { formatVnd } from '../../../utils/validation';

export const STAFF_PROMOTION_ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra khi xử lý mã giảm giá. Vui lòng thử lại.',
  NOT_FOUND: PROMOTION_ERROR_MESSAGES.MANAGE_NOT_FOUND,
  FORBIDDEN: AUTH_ERROR_MESSAGES.FORBIDDEN,
  SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
} as const;

export { PROMOTION_TYPE_LABELS, PROMOTION_STATUS_LABELS };

export function getStaffPromotionTypeLabel(type: PromotionType): string {
  return PROMOTION_TYPE_LABELS[type] ?? type;
}

export function getStaffPromotionStatusLabel(isActive: boolean): string {
  return getPromotionStatusLabel(isActive);
}

export function formatStaffPromotionValue(
  promotion: Pick<Promotion, 'type' | 'value'>
): string {
  if (promotion.type === 'PERCENT') {
    return `${promotion.value}%`;
  }
  return formatVnd(promotion.value);
}

export function formatStaffPromotionMaxDiscount(maxDiscount: number | null): string {
  if (maxDiscount === null || maxDiscount === undefined) {
    return '—';
  }
  return formatVnd(maxDiscount);
}

/**
 * Lấy danh sách toàn bộ mã giảm giá từ GET /promotions (chỉ ADMIN).
 * Giữ nguyên thứ tự từ server (mới nhất trước).
 */
export async function fetchStaffPromotions(forceMock = false): Promise<Promotion[]> {
  if (forceMock) {
    return mockGetPromotions();
  }

  return getPromotionsApi();
}

/**
 * Bật hoặc tắt mã giảm giá qua PATCH /promotions/:id (chỉ ADMIN).
 * Chỉ gửi duy nhất trường `isActive`.
 */
export async function toggleStaffPromotionActive(
  promotionId: string,
  isActive: boolean,
  forceMock = false
): Promise<Promotion> {
  if (forceMock) {
    return mockUpdatePromotion(promotionId, { isActive });
  }

  return updatePromotionApi(promotionId, { isActive });
}

export interface ParsedStaffPromotionError {
  statusCode: number;
  message: string;
  isUnauthorized: boolean;
  isAccountLocked: boolean;
  isForbiddenRole: boolean;
  isNotFound: boolean;
}

function isRawEnglishHttpText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    /^(bad request|unauthorized|forbidden|not found|internal server error|conflict|failed to fetch|load failed)$/i.test(
      trimmed
    ) || /\b(must be|must not be|should not be empty|at least one field)\b/i.test(trimmed)
  );
}

export function parseStaffPromotionError(err: unknown): ParsedStaffPromotionError {
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
  const isForbiddenRole = statusCode === 403 && !isAccountLocked;
  const isNotFound = statusCode === 404;

  if (isAccountLocked) {
    message = AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED;
  } else if (isUnauthorized) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : AUTH_ERROR_MESSAGES.SESSION_EXPIRED;
  } else if (isForbiddenRole) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : STAFF_PROMOTION_ERROR_MESSAGES.FORBIDDEN;
  } else if (isNotFound) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : STAFF_PROMOTION_ERROR_MESSAGES.NOT_FOUND;
  } else if (statusCode === 400) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
  } else if (statusCode >= 500) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : STAFF_PROMOTION_ERROR_MESSAGES.SERVER_ERROR;
  } else if (statusCode === 0) {
    message = STAFF_PROMOTION_ERROR_MESSAGES.NETWORK_ERROR;
  } else if (!message || isRawEnglishHttpText(message)) {
    message = STAFF_PROMOTION_ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  return {
    statusCode,
    message,
    isUnauthorized,
    isAccountLocked,
    isForbiddenRole,
    isNotFound,
  };
}
