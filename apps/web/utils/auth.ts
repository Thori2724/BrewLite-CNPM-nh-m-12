import { AuthUser, AUTH_ERROR_MESSAGES } from '../services/auth-contract';
import {
  classifyApiError,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validateLoginPassword,
  validatePassword,
} from './validation';

export const AUTH_STORAGE_KEY = 'brewlite_auth_v2';
export const LEGACY_AUTH_STORAGE_KEY = 'brewlite_auth_v1';
export const AUTH_SESSION_CLEARED_EVENT = 'brewlite:auth-session-cleared';

export interface AuthSession {
  token: string;
  user: AuthUser;
}

/**
 * Đọc phiên đăng nhập an toàn từ localStorage.
 * - Tự động dọn dẹp khóa cũ brewlite_auth_v1 nếu còn (không đọc, không migrate).
 * - Trả về null nếu ở môi trường SSR, JSON hỏng, hoặc cấu trúc dữ liệu không hợp lệ.
 */
export function loadAuthSession(): AuthSession | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    // 1. Tự động xóa khóa cũ brewlite_auth_v1 nếu còn
    if (window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) !== null) {
      window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    }

    // 2. Đọc khóa v2
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const { token, user } = parsed as Partial<AuthSession>;

    if (
      typeof token !== 'string' ||
      !token.trim() ||
      !user ||
      typeof user !== 'object' ||
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      typeof user.displayName !== 'string' ||
      typeof user.role !== 'string'
    ) {
      return null;
    }

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Lưu phiên đăng nhập vào localStorage.
 * TUYỆT ĐỐI KHÔNG lưu mật khẩu, chỉ lưu token và thông tin user cơ bản.
 */
export function saveAuthSession(session: AuthSession): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const cleanSession: AuthSession = {
      token: session.token,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        role: session.user.role,
      },
    };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cleanSession));
  } catch {
    // Bỏ qua nếu bộ nhớ trình duyệt bị chặn hoặc đầy
  }
}

/**
 * Xóa phiên đăng nhập khỏi localStorage.
 * Giữ nguyên các dữ liệu khác như giỏ hàng (brewlite_cart_v2).
 */
export function clearAuthSession(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
    }
  } catch {
    // Bỏ qua nếu bộ nhớ trình duyệt bị chặn
  }
}

/**
 * Kiểm tra và chuẩn hóa URL chuyển hướng (Redirect URL) chống lỗ hổng Open Redirect.
 * Chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng duy nhất 1 dấu "/" (không nhận "//", "http:", "javascript:").
 */
export function getSafeRedirectUrl(
  redirectParam: string | null | undefined,
  fallback: string = '/'
): string {
  if (!redirectParam || typeof redirectParam !== 'string') {
    return fallback;
  }

  const trimmed = redirectParam.trim();

  // Bắt buộc bắt đầu bằng '/', không được bắt đầu bằng '//' hoặc '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Không được chứa backslash hoặc giao thức (://) hoặc javascript:
  if (trimmed.includes('\\') || trimmed.includes('://') || /^\/[a-zA-Z0-9_-]+:/.test(trimmed)) {
    return fallback;
  }

  // Kiểm tra không chứa ký tự điều khiển
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

export {
  validateEmail,
  validateLoginPassword,
  validatePassword,
  validateDisplayName,
  validateConfirmPassword,
};

/**
 * Trích xuất thông báo lỗi an toàn cho người dùng:
 * - Nếu server trả về mảng chuỗi tiếng Anh (lỗi validate 400): chỉ hiện câu chung tiếng Việt,
 *   tuyệt đối KHÔNG hiện nguyên văn chuỗi tiếng Anh lên màn hình.
 * - Lỗi 401 hoặc 409: trả về đúng câu tiếng Việt theo hợp đồng.
 */
export function extractErrorMessage(errorData: unknown, fallbackMessage?: string): string {
  const defaultFallback = fallbackMessage || AUTH_ERROR_MESSAGES.UNKNOWN_ERROR;
  if (!errorData) return defaultFallback;
  if (typeof errorData === 'string') return errorData;
  if (errorData instanceof Error) {
    return errorData.message || defaultFallback;
  }
  const classified = classifyApiError(errorData, defaultFallback);
  return classified.message;
}
