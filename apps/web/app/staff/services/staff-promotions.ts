import { AUTH_ERROR_MESSAGES } from '../../../services/auth-contract';
import {
  CreatePromotionDto,
  createPromotionApi,
  getPromotionsApi,
  getPromotionStatusLabel,
  PROMOTION_ERROR_MESSAGES,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TYPE_LABELS,
  Promotion,
  PromotionType,
  UpdatePromotionDto,
  updatePromotionApi,
} from '../../../services/promotions';
import {
  mockCreatePromotion,
  mockGetPromotions,
  mockUpdatePromotion,
} from '../../../mocks/mock-promotions';
import { isAccountLockedError } from '../../../utils/auth';
import { FieldValidationResult, formatVnd } from '../../../utils/validation';

export const STAFF_PROMOTION_ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra khi xử lý mã giảm giá. Vui lòng thử lại.',
  NOT_FOUND: PROMOTION_ERROR_MESSAGES.MANAGE_NOT_FOUND,
  ALREADY_EXISTS: PROMOTION_ERROR_MESSAGES.ALREADY_EXISTS,
  NO_CHANGES: 'Chưa có thay đổi nào để lưu',
  FORBIDDEN: AUTH_ERROR_MESSAGES.FORBIDDEN,
  SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
} as const;

export const PROMOTION_CODE_MIN_LENGTH = 3;
export const PROMOTION_CODE_MAX_LENGTH = 20;
export const PROMOTION_CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;
export const PROMOTION_PERCENT_MIN = 1;
export const PROMOTION_PERCENT_MAX = 100;
export const PROMOTION_VND_MIN = 1000;
export const PROMOTION_VND_MAX = 1000000;

export const STAFF_PROMOTION_TYPE_OPTIONS: {
  value: PromotionType;
  label: string;
}[] = [
  { value: 'PERCENT', label: PROMOTION_TYPE_LABELS.PERCENT },
  { value: 'FIXED', label: PROMOTION_TYPE_LABELS.FIXED },
];

export interface PromotionFormValues {
  code: string;
  type: PromotionType;
  value: string;
  maxDiscount: string;
  isActive: boolean;
}

export interface PromotionFormFieldErrors {
  code?: string;
  type?: string;
  value?: string;
  maxDiscount?: string;
}

export { PROMOTION_TYPE_LABELS, PROMOTION_STATUS_LABELS };

export function formatStaffPromotionVnd(amount: number): string {
  return formatVnd(amount);
}

export function normalizePromotionCode(rawCode: string): string {
  return (rawCode ?? '').trim().toUpperCase();
}

export function validatePromotionCode(rawCode: string): FieldValidationResult {
  const normalized = normalizePromotionCode(rawCode);
  if (!normalized) {
    return {
      isValid: false,
      error: `Vui lòng nhập mã giảm giá (${PROMOTION_CODE_MIN_LENGTH} đến ${PROMOTION_CODE_MAX_LENGTH} ký tự).`,
    };
  }
  if (
    normalized.length < PROMOTION_CODE_MIN_LENGTH ||
    normalized.length > PROMOTION_CODE_MAX_LENGTH
  ) {
    return {
      isValid: false,
      error: `Mã giảm giá phải từ ${PROMOTION_CODE_MIN_LENGTH} đến ${PROMOTION_CODE_MAX_LENGTH} ký tự.`,
    };
  }
  if (!PROMOTION_CODE_REGEX.test(normalized)) {
    return {
      isValid: false,
      error: "Mã giảm giá chỉ được gồm chữ A-Z, số, '_' và '-'.",
    };
  }
  return { isValid: true };
}

export function validatePromotionType(type: string): FieldValidationResult {
  if (type !== 'PERCENT' && type !== 'FIXED') {
    return {
      isValid: false,
      error: 'Vui lòng chọn loại mã giảm giá hợp lệ.',
    };
  }
  return { isValid: true };
}

export function validatePromotionValue(
  valueInput: string | number,
  type: PromotionType
): FieldValidationResult {
  const isPercent = type === 'PERCENT';
  const min = isPercent ? PROMOTION_PERCENT_MIN : PROMOTION_VND_MIN;
  const max = isPercent ? PROMOTION_PERCENT_MAX : PROMOTION_VND_MAX;
  const rangeError = isPercent
    ? 'Giá trị giảm theo % phải là số nguyên từ 1 đến 100.'
    : 'Số tiền giảm phải là số nguyên từ 1.000 đến 1.000.000đ.';

  if (typeof valueInput === 'number') {
    if (!Number.isInteger(valueInput) || valueInput < min || valueInput > max) {
      return { isValid: false, error: rangeError };
    }
    return { isValid: true };
  }

  const trimmed = (valueInput ?? '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: isPercent
        ? 'Vui lòng nhập giá trị giảm (1 đến 100%).'
        : 'Vui lòng nhập số tiền giảm (1.000 đến 1.000.000đ).',
    };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return { isValid: false, error: rangeError };
  }

  const numericValue = Number(trimmed);
  if (!Number.isSafeInteger(numericValue) || numericValue < min || numericValue > max) {
    return { isValid: false, error: rangeError };
  }

  return { isValid: true };
}

export const PROMOTION_MAX_DISCOUNT_REQUIRED_ON_EDIT_ERROR =
  'Mã đang có trần giảm nên không thể để trống. Muốn bỏ trần, hãy đổi loại sang giảm số tiền hoặc tạo mã mới.';

export function validatePromotionMaxDiscount(
  maxDiscountInput: string | number | null | undefined,
  type: PromotionType,
  options?: { disallowEmpty?: boolean }
): FieldValidationResult {
  if (type === 'FIXED') {
    return { isValid: true };
  }

  if (maxDiscountInput === null || maxDiscountInput === undefined) {
    return options?.disallowEmpty
      ? { isValid: false, error: PROMOTION_MAX_DISCOUNT_REQUIRED_ON_EDIT_ERROR }
      : { isValid: true };
  }

  const rangeError = 'Trần giảm phải là số nguyên từ 1.000 đến 1.000.000đ.';

  if (typeof maxDiscountInput === 'number') {
    if (
      !Number.isInteger(maxDiscountInput) ||
      maxDiscountInput < PROMOTION_VND_MIN ||
      maxDiscountInput > PROMOTION_VND_MAX
    ) {
      return { isValid: false, error: rangeError };
    }
    return { isValid: true };
  }

  const trimmed = (maxDiscountInput ?? '').trim();
  if (!trimmed) {
    return options?.disallowEmpty
      ? { isValid: false, error: PROMOTION_MAX_DISCOUNT_REQUIRED_ON_EDIT_ERROR }
      : { isValid: true };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return { isValid: false, error: rangeError };
  }

  const numericValue = Number(trimmed);
  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < PROMOTION_VND_MIN ||
    numericValue > PROMOTION_VND_MAX
  ) {
    return { isValid: false, error: rangeError };
  }

  return { isValid: true };
}

export function validatePromotionForm(
  values: PromotionFormValues,
  options?: { mode?: 'create' | 'edit'; initialPromotion?: Promotion | null }
): {
  isValid: boolean;
  errors: PromotionFormFieldErrors;
} {
  const errors: PromotionFormFieldErrors = {};

  if (options?.mode !== 'edit') {
    const codeCheck = validatePromotionCode(values.code);
    if (!codeCheck.isValid) errors.code = codeCheck.error;
  }

  const typeCheck = validatePromotionType(values.type);
  if (!typeCheck.isValid) {
    errors.type = typeCheck.error;
  } else {
    const valueCheck = validatePromotionValue(values.value, values.type);
    if (!valueCheck.isValid) errors.value = valueCheck.error;

    const hasInitialMaxDiscount =
      options?.mode === 'edit' &&
      options?.initialPromotion?.maxDiscount !== null &&
      options?.initialPromotion?.maxDiscount !== undefined;

    const maxDiscountCheck = validatePromotionMaxDiscount(values.maxDiscount, values.type, {
      disallowEmpty: hasInitialMaxDiscount,
    });
    if (!maxDiscountCheck.isValid) errors.maxDiscount = maxDiscountCheck.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildCreatePromotionPayload(values: PromotionFormValues): CreatePromotionDto {
  const payload: CreatePromotionDto = {
    code: normalizePromotionCode(values.code),
    type: values.type,
    value: Number(values.value.trim()),
    isActive: values.isActive,
  };

  if (values.type === 'PERCENT') {
    const trimmedMax = values.maxDiscount.trim();
    if (trimmedMax) {
      payload.maxDiscount = Number(trimmedMax);
    }
  }

  return payload;
}

export function buildUpdatePromotionPayload(
  values: PromotionFormValues,
  initialPromotion: Promotion
): UpdatePromotionDto {
  const payload: UpdatePromotionDto = {};

  if (values.type !== initialPromotion.type) {
    payload.type = values.type;
  }

  const nextValue = Number(values.value.trim());
  if (nextValue !== initialPromotion.value) {
    payload.value = nextValue;
  }

  if (values.type === 'PERCENT') {
    const trimmedMax = values.maxDiscount.trim();
    if (trimmedMax) {
      const nextMaxDiscount = Number(trimmedMax);
      if (nextMaxDiscount !== initialPromotion.maxDiscount) {
        payload.maxDiscount = nextMaxDiscount;
      }
    }
  }

  if (values.isActive !== initialPromotion.isActive) {
    payload.isActive = values.isActive;
  }

  return payload;
}

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

/**
 * Thêm mã giảm giá mới (ADMIN) qua POST /promotions.
 */
export async function createStaffPromotion(
  dto: CreatePromotionDto,
  forceMock = false
): Promise<Promotion> {
  const sanitizedDto: CreatePromotionDto = {
    code: normalizePromotionCode(dto.code),
    type: dto.type,
    value: dto.value,
    ...(dto.type === 'PERCENT' && dto.maxDiscount !== undefined && dto.maxDiscount !== null
      ? { maxDiscount: dto.maxDiscount }
      : {}),
    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
  };

  if (forceMock) {
    return mockCreatePromotion(sanitizedDto);
  }

  return createPromotionApi(sanitizedDto);
}

/**
 * Sửa mã giảm giá (ADMIN) qua PATCH /promotions/:id.
 * Tuyệt đối không gửi `code`; chỉ gửi các trường có trong dto.
 */
export async function updateStaffPromotion(
  promotionId: string,
  dto: UpdatePromotionDto,
  forceMock = false
): Promise<Promotion> {
  const sanitizedDto: UpdatePromotionDto = {
    ...(dto.type !== undefined ? { type: dto.type } : {}),
    ...(dto.value !== undefined ? { value: dto.value } : {}),
    ...(dto.type !== 'FIXED' &&
    dto.maxDiscount !== undefined &&
    dto.maxDiscount !== null
      ? { maxDiscount: dto.maxDiscount }
      : {}),
    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
  };

  if (forceMock) {
    return mockUpdatePromotion(promotionId, sanitizedDto);
  }

  return updatePromotionApi(promotionId, sanitizedDto);
}

export interface ParsedStaffPromotionError {
  statusCode: number;
  message: string;
  isUnauthorized: boolean;
  isAccountLocked: boolean;
  isForbiddenRole: boolean;
  isNotFound: boolean;
}

export interface ParsedStaffPromotionFormError extends ParsedStaffPromotionError {
  fieldErrors: PromotionFormFieldErrors;
}

function isRawEnglishHttpText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    /^(bad request|unauthorized|forbidden|not found|internal server error|conflict|failed to fetch|load failed)$/i.test(
      trimmed
    ) ||
    /\b(must be|must not be|should not be empty|at least one field|already exists|cannot be modified)\b/i.test(
      trimmed
    )
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

function mapPromotionValidationMessagesToFields(
  messages: string[]
): PromotionFormFieldErrors {
  const fieldErrors: PromotionFormFieldErrors = {};

  for (const rawMsg of messages) {
    const lower = rawMsg.toLowerCase();
    if (lower.includes('maxdiscount')) {
      fieldErrors.maxDiscount = 'Trần giảm phải là số nguyên từ 1.000 đến 1.000.000đ.';
    } else if (lower.includes('code')) {
      fieldErrors.code =
        "Mã giảm giá phải từ 3 đến 20 ký tự, chỉ gồm chữ A-Z, số, '_' và '-'.";
    } else if (lower.includes('type')) {
      fieldErrors.type = 'Vui lòng chọn loại mã giảm giá hợp lệ.';
    } else if (lower.includes('value')) {
      fieldErrors.value = 'Giá trị giảm không hợp lệ.';
    }
  }

  return fieldErrors;
}

export function parseStaffPromotionFormError(err: unknown): ParsedStaffPromotionFormError {
  const base = parseStaffPromotionError(err);
  let fieldErrors: PromotionFormFieldErrors = {};
  let rawMessage: unknown;

  if (err && typeof err === 'object') {
    rawMessage = (err as { message?: unknown }).message;
  }

  if (base.isAccountLocked || base.isUnauthorized) {
    return { ...base, fieldErrors };
  }

  if (base.statusCode === 409) {
    const conflictMessage =
      typeof rawMessage === 'string' &&
      rawMessage.trim() &&
      !isRawEnglishHttpText(rawMessage)
        ? rawMessage.trim()
        : STAFF_PROMOTION_ERROR_MESSAGES.ALREADY_EXISTS;

    fieldErrors.code = conflictMessage;
    return {
      ...base,
      message: conflictMessage,
      fieldErrors,
    };
  }

  if (base.statusCode === 400) {
    if (Array.isArray(rawMessage)) {
      const stringMessages = rawMessage.filter((item): item is string => typeof item === 'string');
      fieldErrors = mapPromotionValidationMessagesToFields(stringMessages);
      return {
        ...base,
        message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
        fieldErrors,
      };
    }

    if (typeof rawMessage === 'string' && rawMessage.trim()) {
      if (isRawEnglishHttpText(rawMessage)) {
        fieldErrors = mapPromotionValidationMessagesToFields([rawMessage]);
        return {
          ...base,
          message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
          fieldErrors,
        };
      }
      return {
        ...base,
        message: rawMessage.trim(),
        fieldErrors,
      };
    }

    return {
      ...base,
      message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors,
    };
  }

  return { ...base, fieldErrors };
}
