import {
  AUTH_ERROR_MESSAGES,
  getStaffStatusLabel,
  ROLE_LABELS,
  STAFF_STATUS_LABELS,
  StaffUser,
  UserRole,
} from '../../../services/auth-contract';
import { formatVietnamDateTime } from '../../../services/order-contract';
import { getStaffListApi, updateStaffStatusApi } from '../../../services/staff';
import { isAccountLockedError } from '../../../utils/auth';
import {
  getMockStaffEmployees,
  isStaffEmployeesMockEnabled,
  updateMockStaffEmployeeStatus,
} from '../mocks/staff-employees-mock';

export const STAFF_EMPLOYEE_ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra khi xử lý thông tin nhân viên. Vui lòng thử lại.',
  NOT_FOUND: AUTH_ERROR_MESSAGES.STAFF_NOT_FOUND,
  FORBIDDEN: AUTH_ERROR_MESSAGES.FORBIDDEN,
  SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
} as const;

export function getEmployeeRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function getEmployeeStatusLabel(isActive: boolean): string {
  return getStaffStatusLabel(isActive);
}

export function formatStaffEmployeeDateTime(isoString?: string | null): string {
  return formatVietnamDateTime(isoString) || '-';
}

export { STAFF_STATUS_LABELS };

/**
 * Lấy danh sách nhân viên (STAFF) từ GET /staff (chỉ ADMIN).
 */
export async function fetchStaffEmployees(forceMock = false): Promise<StaffUser[]> {
  if (forceMock || isStaffEmployeesMockEnabled()) {
    return getMockStaffEmployees();
  }

  return getStaffListApi();
}

/**
 * Khóa hoặc mở khóa tài khoản nhân viên qua PATCH /staff/:id/status (chỉ ADMIN).
 * Chỉ gửi duy nhất trường `isActive`.
 */
export async function updateStaffEmployeeStatus(
  staffId: string,
  isActive: boolean,
  forceMock = false
): Promise<StaffUser> {
  if (forceMock || isStaffEmployeesMockEnabled()) {
    return updateMockStaffEmployeeStatus(staffId, isActive);
  }

  return updateStaffStatusApi(staffId, { isActive });
}

export interface ParsedStaffEmployeeError {
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
    ) || /\b(must be|must not be|should not be empty)\b/i.test(trimmed)
  );
}

export function parseStaffEmployeeError(err: unknown): ParsedStaffEmployeeError {
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
        : STAFF_EMPLOYEE_ERROR_MESSAGES.FORBIDDEN;
  } else if (isNotFound) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : STAFF_EMPLOYEE_ERROR_MESSAGES.NOT_FOUND;
  } else if (statusCode === 400) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
  } else if (statusCode >= 500) {
    message =
      message && !isRawEnglishHttpText(message)
        ? message
        : STAFF_EMPLOYEE_ERROR_MESSAGES.SERVER_ERROR;
  } else if (statusCode === 0) {
    message = STAFF_EMPLOYEE_ERROR_MESSAGES.NETWORK_ERROR;
  } else if (!message || isRawEnglishHttpText(message)) {
    message = STAFF_EMPLOYEE_ERROR_MESSAGES.UNKNOWN_ERROR;
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

