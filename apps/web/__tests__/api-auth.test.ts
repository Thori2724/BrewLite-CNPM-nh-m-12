import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  apiFetch,
  AuthApiError,
  loginApi,
  registerApi,
  resetRedirectFlag,
} from '../services/auth';
import { AUTH_ENDPOINTS, AUTH_ERROR_MESSAGES } from '../services/auth-contract';
import { loadAuthSession, saveAuthSession } from '../utils/auth';

describe('Lớp gọi API xác thực (services/auth.ts)', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  // 1. Kiểm tra gắn header Authorization
  describe('Tự động gắn Token vào header', () => {
    it('1.1. Tự động gắn header Authorization: Bearer <token> khi có phiên đăng nhập', async () => {
      saveAuthSession({
        token: 'test-valid-jwt-token',
        user: { id: '1', email: 'test@brewlite.vn', fullName: 'Tester', role: 'CUSTOMER' },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'ok' }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await apiFetch('/api/protected-route');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer test-valid-jwt-token');
    });

    it('1.2. Không gắn header Authorization khi chưa đăng nhập', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'ok' }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await apiFetch('/api/public-route');

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
    });

    it('1.3. Không gắn header Authorization khi truyền skipAuth: true', async () => {
      saveAuthSession({
        token: 'test-valid-jwt-token',
        user: { id: '1', email: 'test@brewlite.vn', fullName: 'Tester', role: 'CUSTOMER' },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'ok' }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await apiFetch('/auth/login', { skipAuth: true });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
    });
  });

  // 2. Kiểm tra xử lý mã lỗi 401 Unauthorized
  describe('Xử lý mã lỗi 401 và chống vòng lặp redirect', () => {
    it('2.1. Request nghiệp vụ gặp 401 (hết hạn): Xóa token và kích hoạt chuyển về /login', async () => {
      saveAuthSession({
        token: 'expired-token',
        user: { id: '1', email: 'test@brewlite.vn', fullName: 'Tester', role: 'CUSTOMER' },
      });

      // Mock window.location
      const originalLocation = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      (window as unknown as Record<string, unknown>).location = {
        pathname: '/cart',
        search: '',
        href: '',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      } as unknown as Response);

      await expect(apiFetch('/orders')).rejects.toThrow(AUTH_ERROR_MESSAGES.SESSION_EXPIRED);

      // 1. Phải xóa phiên trong localStorage
      expect(loadAuthSession()).toBeNull();

      // 2. Phải chuyển hướng về /login kèm redirect=/cart
      expect(window.location.href).toBe('/login?redirect=%2Fcart&expired=true');

      (window as unknown as Record<string, unknown>).location = originalLocation;
    });

    it('2.2. CHÍNH lời gọi POST /auth/login gặp 401 (sai pass): KHÔNG được redirect, chỉ ném lỗi', async () => {
      const originalLocation = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      (window as unknown as Record<string, unknown>).location = {
        pathname: '/login',
        search: '',
        href: '/login',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized', statusCode: 401 }),
      } as unknown as Response);

      await expect(
        apiFetch(AUTH_ENDPOINTS.LOGIN, {
          method: 'POST',
          body: JSON.stringify({ email: 'user@brewlite.vn', password: 'wrong' }),
        })
      ).rejects.toThrow(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);

      // Tuyệt đối không bị đổi href sang trang khác
      expect(window.location.href).toBe('/login');

      (window as unknown as Record<string, unknown>).location = originalLocation;
    });

    it('2.3. Chống dồn dập: Nhiều request 401 đồng thời chỉ kích hoạt redirect 1 lần', async () => {
      saveAuthSession({
        token: 'expired-token',
        user: { id: '1', email: 'test@brewlite.vn', fullName: 'Tester', role: 'CUSTOMER' },
      });

      const originalLocation = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      let setHrefCount = 0;
      let currentHref = '/cart';
      (window as unknown as Record<string, unknown>).location = {
        pathname: '/cart',
        search: '',
        get href() {
          return currentHref;
        },
        set href(val: string) {
          setHrefCount++;
          currentHref = val;
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      } as unknown as Response);

      // Bắn 3 request 401 song song
      await Promise.allSettled([
        apiFetch('/api/orders'),
        apiFetch('/api/profile'),
        apiFetch('/api/notifications'),
      ]);

      // href chỉ được gán 1 lần duy nhất
      expect(setHrefCount).toBe(1);

      (window as unknown as Record<string, unknown>).location = originalLocation;
    });
  });

  // 3. Xử lý các mã lỗi HTTP khác (400, 409...)
  describe('Xử lý mã lỗi HTTP khác', () => {
    it('3.1. Xử lý lỗi 409 Conflict khi trùng email', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Email đã tồn tại' }),
      } as unknown as Response);

      await expect(
        apiFetch(AUTH_ENDPOINTS.REGISTER, {
          method: 'POST',
          body: JSON.stringify({
            fullName: 'Test',
            email: 'duplicate@brewlite.vn',
            password: 'password123',
          }),
        })
      ).rejects.toThrow(AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    });

    it('3.2. Ném AuthApiError chứa đầy đủ statusCode và message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Dữ liệu không hợp lệ', statusCode: 400 }),
      } as unknown as Response);

      try {
        await apiFetch('/api/test-400');
        expect.unreachable('Phải ném lỗi');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthApiError);
        const apiErr = err as AuthApiError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.message).toBe('Dữ liệu không hợp lệ');
      }
    });
  });

  // 4. Kiểm tra công tắc Mock Auth
  describe('Công tắc NEXT_PUBLIC_USE_MOCK_AUTH', () => {
    it('4.1. Đăng nhập qua Mock Auth thành công với tài khoản mẫu', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH = 'true';

      const res = await loginApi({
        email: 'khachhang@brewlite.vn',
        password: 'password123',
      });

      expect(res.access_token).toBeDefined();
      expect(res.user.email).toBe('khachhang@brewlite.vn');
      expect(res.user.role).toBe('CUSTOMER');
    });

    it('4.2. Đăng nhập qua Mock Auth thất bại khi sai mật khẩu (ném 401)', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH = 'true';

      await expect(
        loginApi({
          email: 'khachhang@brewlite.vn',
          password: 'wrong-password',
        })
      ).rejects.toThrow(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
    });

    it('4.3. Đăng ký qua Mock Auth thành công với email mới', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH = 'true';

      const res = await registerApi({
        fullName: 'Người Dùng Mới',
        email: `newuser-${Date.now()}@brewlite.vn`,
        password: 'newpassword123',
      });

      expect(res.message).toBe(AUTH_ERROR_MESSAGES.REGISTRATION_SUCCESS);
      expect(res.user.fullName).toBe('Người Dùng Mới');
    });

    it('4.4. Đăng ký qua Mock Auth thất bại khi trùng email mẫu (ném 409)', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH = 'true';

      await expect(
        registerApi({
          fullName: 'Trùng Email',
          email: 'khachhang@brewlite.vn',
          password: 'password123',
        })
      ).rejects.toThrow(AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    });
  });
});
