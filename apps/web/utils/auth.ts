import { AuthUser, AUTH_ERROR_MESSAGES } from '../services/auth-contract';

export const AUTH_STORAGE_KEY = 'brewlite_auth_v1';

export interface AuthSession {
  token: string;
  user: AuthUser;
}

/**
 * Đọc phiên đăng nhập an toàn từ localStorage.
 * Trả về null nếu ở môi trường SSR, JSON hỏng, hoặc cấu trúc dữ liệu không hợp lệ.
 */
export function loadAuthSession(): AuthSession | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
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
      typeof user.fullName !== 'string' ||
      typeof user.role !== 'string'
    ) {
      return null;
    }

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        loyaltyPoints: typeof user.loyaltyPoints === 'number' ? user.loyaltyPoints : undefined,
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
        fullName: session.user.fullName,
        role: session.user.role,
        loyaltyPoints: session.user.loyaltyPoints,
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
 * Giữ nguyên các dữ liệu khác như giỏ hàng (brewlite_cart_v1).
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
 * Validate Mật khẩu (tối thiểu 6 ký tự)
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
 * Validate Họ và tên (tối thiểu 2 ký tự)
 */
export function validateFullName(fullName: string): { isValid: boolean; error?: string } {
  const trimmed = (fullName || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Vui lòng nhập họ và tên' };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: 'Họ và tên phải có ít nhất 2 ký tự' };
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
 * Trích xuất thông báo lỗi dễ hiểu từ response API hoặc Error
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

    // Định dạng NestJS: message có thể là string hoặc mảng các string
    if (Array.isArray(errorObj.message) && errorObj.message.length > 0) {
      return errorObj.message.join(', ');
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

