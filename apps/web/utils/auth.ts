import { AuthUser, AUTH_ERROR_MESSAGES } from '../services/auth-contract';

export const AUTH_STORAGE_KEY = 'brewlite_auth_v2';
export const LEGACY_AUTH_STORAGE_KEY = 'brewlite_auth_v1';

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
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Không thể lưu phiên đăng nhập vào localStorage:', err);
    }
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
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Không thể xóa phiên đăng nhập:', err);
    }
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

/**
 * Validate định dạng Email
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Vui lòng nhập địa chỉ email' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Địa chỉ email không đúng định dạng' };
  }

  return { isValid: true };
}

/**
 * Validate Mật khẩu cho form Đăng nhập: chỉ bắt buộc nhập, không áp tối thiểu 6 ký tự
 */
export function validateLoginPassword(password: string): { isValid: boolean; error?: string } {
  if (!password) {
    return { isValid: false, error: 'Vui lòng nhập mật khẩu' };
  }
  return { isValid: true };
}

/**
 * Validate Mật khẩu cho form Đăng ký: tối thiểu 6 ký tự
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password) {
    return { isValid: false, error: 'Vui lòng nhập mật khẩu' };
  }

  if (password.length < 6) {
    return { isValid: false, error: 'Mật khẩu phải có ít nhất 6 ký tự' };
  }

  return { isValid: true };
}

/**
 * Validate Tên hiển thị (displayName):
 * Hợp lệ khi 1 đến 50 ký tự sau khi trim; chuỗi toàn dấu cách bị báo lỗi tiếng Việt.
 */
export function validateDisplayName(displayName: string): { isValid: boolean; error?: string } {
  const trimmed = (displayName || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Vui lòng nhập tên hiển thị' };
  }

  if (trimmed.length > 50) {
    return { isValid: false, error: 'Tên hiển thị không được vượt quá 50 ký tự' };
  }

  return { isValid: true };
}

/**
 * Validate Xác nhận mật khẩu
 */
export function validateConfirmPassword(
  password: string,
  confirmPassword: string
): { isValid: boolean; error?: string } {
  if (!confirmPassword) {
    return { isValid: false, error: 'Vui lòng nhập lại mật khẩu' };
  }

  if (password !== confirmPassword) {
    return { isValid: false, error: 'Mật khẩu nhập lại không khớp' };
  }

  return { isValid: true };
}

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

  if (typeof errorData === 'object' && errorData !== null) {
    const errorObj = errorData as Record<string, unknown>;

    // Định dạng NestJS validation: message là MẢNG chuỗi tiếng Anh -> chuyển thành câu chung tiếng Việt
    if (Array.isArray(errorObj.message) && errorObj.message.length > 0) {
      return AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
    }

    if (typeof errorObj.message === 'string' && errorObj.message.trim()) {
      return errorObj.message;
    }

    if (typeof errorObj.error === 'string' && errorObj.error.trim()) {
      return errorObj.error;
    }
  }

  return defaultFallback;
}
