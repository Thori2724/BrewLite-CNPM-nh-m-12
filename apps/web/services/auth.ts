import {
  AUTH_ENDPOINTS,
  AUTH_ERROR_MESSAGES,
  AuthUser,
  LoginDto,
  LoginResponse,
  RegisterDto,
  RegisterResponse,
} from './auth-contract';
import { clearAuthSession, getSafeRedirectUrl, loadAuthSession } from '../utils/auth';

export class AuthApiError extends Error {
  statusCode: number;
  errorData?: unknown;

  constructor(statusCode: number, message: string, errorData?: unknown) {
    super(message);
    this.name = 'AuthApiError';
    this.statusCode = statusCode;
    this.errorData = errorData;
  }
}

// Biến cờ ngăn chặn chuyển hướng dồn dập (throttling redirect) khi có nhiều request 401 đồng thời
let isRedirectingToLogin = false;

export function resetRedirectFlag(): void {
  isRedirectingToLogin = false;
}

/**
 * Kiểm tra xem có đang bật chế độ Mock Auth hay không
 */
export function isMockAuthActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true';
}

/**
 * Lấy Base URL của API
 */
export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:3001';
}

/**
 * Hàm fetch trung tâm có hỗ trợ tự động gắn Token và xử lý mã lỗi 401
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, headers: customHeaders, ...fetchOptions } = options;

  const headers = new Headers(customHeaders || {});

  if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Tự động gắn token nếu có phiên đăng nhập và không yêu cầu bỏ qua (skipAuth)
  if (!skipAuth) {
    const session = loadAuthSession();
    if (session?.token) {
      headers.set('Authorization', `Bearer ${session.token}`);
    }
  }

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
    });
  } catch (err) {
    throw new AuthApiError(0, AUTH_ERROR_MESSAGES.NETWORK_ERROR, err);
  }

  // Xử lý khi gặp mã 401 Unauthorized
  if (response.status === 401) {
    const isAuthRoute =
      endpoint.includes(AUTH_ENDPOINTS.LOGIN) || endpoint.includes(AUTH_ENDPOINTS.REGISTER);

    // Nếu CHÍNH lời gọi login/register trả về 401 (sai tài khoản/mật khẩu):
    // KHÔNG được chuyển trang, chỉ ném lỗi để form tự hiển thị
    if (isAuthRoute) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }
      throw new AuthApiError(401, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS, errorBody);
    }

    // Nếu là request nghiệp vụ khác gặp 401 (token hết hạn):
    // 1. Xóa phiên đăng nhập
    clearAuthSession();

    // 2. Chuyển hướng về trang /login kèm tham số redirect và thông báo (chỉ chuyển 1 lần)
    if (typeof window !== 'undefined' && !isRedirectingToLogin) {
      isRedirectingToLogin = true;
      const currentPath = getSafeRedirectUrl(
        window.location.pathname + window.location.search,
        '/'
      );
      const redirectTarget = `/login?redirect=${encodeURIComponent(currentPath)}&expired=true`;

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Chuyển trang cấp hệ thống khi hết hạn token từ lớp fetch phi-React
      window.location.href = redirectTarget;

      setTimeout(() => {
        isRedirectingToLogin = false;
      }, 3000);
    }

    throw new AuthApiError(401, AUTH_ERROR_MESSAGES.SESSION_EXPIRED);
  }

  // Xử lý các mã lỗi khác (400, 404, 409, 500...)
  if (!response.ok) {
    let errorData: unknown;
    let message: string = AUTH_ERROR_MESSAGES.UNKNOWN_ERROR;

    try {
      errorData = await response.json();
      if (errorData && typeof errorData === 'object') {
        const errorObj = errorData as Record<string, unknown>;
        if (Array.isArray(errorObj.message) && errorObj.message.length > 0) {
          message = errorObj.message.join(', ');
        } else if (typeof errorObj.message === 'string') {
          message = errorObj.message;
        }
      }
    } catch {
      message = response.statusText || message;
    }

    if (response.status === 409) {
      message = AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS;
    }

    throw new AuthApiError(response.status, message, errorData);
  }

  // Phản hồi thành công
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

// ==========================================
// MOCK AUTH IMPLEMENTATION (Khi backend chưa có API auth)
// ==========================================

interface MockUserRecord {
  id: string;
  email: string;
  fullName: string;
  password: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
}

const mockDatabaseUsers: MockUserRecord[] = [
  {
    id: 'mock-user-1',
    email: 'khachhang@brewlite.vn',
    fullName: 'Khách hàng BrewLite',
    password: 'password123',
    role: 'CUSTOMER',
  },
];

async function mockLogin(dto: LoginDto): Promise<LoginResponse> {
  // Giả lập độ trễ mạng 250ms
  await new Promise((resolve) => setTimeout(resolve, 250));

  const normalizedEmail = dto.email.trim().toLowerCase();
  const user = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!user || user.password !== dto.password) {
    throw new AuthApiError(401, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    loyaltyPoints: 50,
  };

  return {
    access_token: `mock_jwt_token_${user.id}_${Date.now()}`,
    user: authUser,
  };
}

async function mockRegister(dto: RegisterDto): Promise<RegisterResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const normalizedEmail = dto.email.trim().toLowerCase();
  const existing = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (existing) {
    throw new AuthApiError(409, AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
  }

  const newUser: MockUserRecord = {
    id: `mock-user-${Date.now()}`,
    email: dto.email.trim(),
    fullName: dto.fullName.trim(),
    password: dto.password,
    role: 'CUSTOMER',
  };

  mockDatabaseUsers.push(newUser);

  return {
    message: AUTH_ERROR_MESSAGES.REGISTRATION_SUCCESS,
    user: {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role,
      loyaltyPoints: 0,
    },
  };
}

/**
 * Gọi API Đăng nhập
 */
export async function loginApi(dto: LoginDto): Promise<LoginResponse> {
  if (isMockAuthActive()) {
    return mockLogin(dto);
  }

  return apiFetch<LoginResponse>(AUTH_ENDPOINTS.LOGIN, {
    method: 'POST',
    body: JSON.stringify(dto),
    skipAuth: true,
  });
}

/**
 * Gọi API Đăng ký
 */
export async function registerApi(dto: RegisterDto): Promise<RegisterResponse> {
  if (isMockAuthActive()) {
    return mockRegister(dto);
  }

  return apiFetch<RegisterResponse>(AUTH_ENDPOINTS.REGISTER, {
    method: 'POST',
    body: JSON.stringify(dto),
    skipAuth: true,
  });
}
