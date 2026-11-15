import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import LoginPage from '../app/login/page';
import RegisterPage from '../app/register/page';
import AccountLockedNotice from '../app/components/AccountLockedNotice';
import RoleRouteGuard from '../app/components/RoleRouteGuard';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useRequireAuth } from '../context/useRequireAuth';
import * as authService from '../services/auth';
import { AUTH_ERROR_MESSAGES, UserRole } from '../services/auth-contract';
import {
  AUTH_STORAGE_KEY,
  getPostLoginRedirectUrl,
  getRoleRouteRedirect,
  loadAuthSession,
  saveAuthSession,
} from '../utils/auth';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = '/';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => mockPathname),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

function setAuthSession(role: UserRole) {
  saveAuthSession({
    token: `jwt-${role.toLowerCase()}`,
    user: {
      id: `user-${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@example.com`,
      displayName: role,
      role,
    },
  });
}

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

function RoleGuardProbe() {
  const { isAuthenticated, user } = useAuth();
  return (
    <div data-testid="protected-content">
      Nội dung trang ({isAuthenticated ? user?.role : 'GUEST'})
    </div>
  );
}

function CustomerRequireAuthProbe() {
  const { isChecking, isReady, user } = useRequireAuth();
  if (isChecking) return <p>Đang kiểm tra...</p>;
  if (!isReady) return <p>Không có quyền hoặc chưa đăng nhập</p>;
  return <p>Khách hàng hợp lệ: {user?.displayName}</p>;
}

describe('Task 17 - Chuyển hướng theo vai trò, bảo vệ route, 401 & 403 khóa tài khoản', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    authService.resetRedirectFlag();
    mockPathname = '/';
    mockSearchParams = new URLSearchParams();

    vi.mocked(navigation.usePathname).mockImplementation(() => mockPathname);
    vi.mocked(navigation.useSearchParams).mockImplementation(
      () => mockSearchParams as unknown as ReturnType<typeof navigation.useSearchParams>
    );
    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('1. Quy tắc pure helper getPostLoginRedirectUrl & getRoleRouteRedirect', () => {
    it('1.1. Tính đúng đích sau đăng nhập cho CUSTOMER, STAFF, ADMIN', () => {
      expect(getPostLoginRedirectUrl('CUSTOMER')).toBe('/');
      expect(getPostLoginRedirectUrl('CUSTOMER', '/cart')).toBe('/cart');
      expect(getPostLoginRedirectUrl('CUSTOMER', '/staff')).toBe('/');
      expect(getPostLoginRedirectUrl('CUSTOMER', '/staff/employees')).toBe('/');
      expect(getPostLoginRedirectUrl('CUSTOMER', 'https://evil.com')).toBe('/');

      expect(getPostLoginRedirectUrl('STAFF')).toBe('/staff');
      expect(getPostLoginRedirectUrl('STAFF', '/')).toBe('/staff');
      expect(getPostLoginRedirectUrl('STAFF', '/cart')).toBe('/staff');
      expect(getPostLoginRedirectUrl('STAFF', '/orders')).toBe('/staff');
      expect(getPostLoginRedirectUrl('STAFF', '/staff/products')).toBe('/staff/products');
      expect(getPostLoginRedirectUrl('STAFF', '/staff/employees')).toBe('/staff');
      expect(getPostLoginRedirectUrl('STAFF', '/account')).toBe('/account');

      expect(getPostLoginRedirectUrl('ADMIN')).toBe('/staff');
      expect(getPostLoginRedirectUrl('ADMIN', '/checkout')).toBe('/staff');
      expect(getPostLoginRedirectUrl('ADMIN', '/staff/employees')).toBe('/staff/employees');
      expect(getPostLoginRedirectUrl('ADMIN', '/account')).toBe('/account');
    });

    it('1.2. Tính đúng chuyển hướng theo vai trò cho mọi route', () => {
      // Khách vãng lai
      expect(getRoleRouteRedirect('/', null)).toBeNull();
      expect(getRoleRouteRedirect('/menu/111', null)).toBeNull();
      expect(getRoleRouteRedirect('/cart', null)).toBeNull();
      expect(getRoleRouteRedirect('/staff', null)).toBe('/');
      expect(getRoleRouteRedirect('/staff/products', null)).toBe('/');
      expect(getRoleRouteRedirect('/staff/employees', null)).toBe('/');

      // CUSTOMER
      expect(getRoleRouteRedirect('/', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/menu/111', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/cart', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/checkout', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/orders', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/orders/123', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/account', 'CUSTOMER')).toBeNull();
      expect(getRoleRouteRedirect('/staff', 'CUSTOMER')).toBe('/');
      expect(getRoleRouteRedirect('/staff/products', 'CUSTOMER')).toBe('/');
      expect(getRoleRouteRedirect('/staff/employees', 'CUSTOMER')).toBe('/');

      // STAFF
      expect(getRoleRouteRedirect('/', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/menu/111', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/cart', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/checkout', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/orders', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/orders/123', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/staff', 'STAFF')).toBeNull();
      expect(getRoleRouteRedirect('/staff/products', 'STAFF')).toBeNull();
      expect(getRoleRouteRedirect('/staff/employees', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/staff/employees?tab=1', 'STAFF')).toBe('/staff');
      expect(getRoleRouteRedirect('/account', 'STAFF')).toBeNull();
      expect(getRoleRouteRedirect('/login', 'STAFF')).toBeNull();
      expect(getRoleRouteRedirect('/register', 'STAFF')).toBeNull();

      // ADMIN
      expect(getRoleRouteRedirect('/', 'ADMIN')).toBe('/staff');
      expect(getRoleRouteRedirect('/menu/111', 'ADMIN')).toBe('/staff');
      expect(getRoleRouteRedirect('/cart', 'ADMIN')).toBe('/staff');
      expect(getRoleRouteRedirect('/checkout', 'ADMIN')).toBe('/staff');
      expect(getRoleRouteRedirect('/orders', 'ADMIN')).toBe('/staff');
      expect(getRoleRouteRedirect('/staff', 'ADMIN')).toBeNull();
      expect(getRoleRouteRedirect('/staff/products', 'ADMIN')).toBeNull();
      expect(getRoleRouteRedirect('/staff/employees', 'ADMIN')).toBeNull();
      expect(getRoleRouteRedirect('/account', 'ADMIN')).toBeNull();
    });
  });

  describe('2. Trang đăng nhập (/login) & đăng ký (/register)', () => {
    it('2.1. STAFF đăng nhập từ /login?redirect=/cart vẫn chuyển về /staff', async () => {
      const user = userEvent.setup();
      mockSearchParams = new URLSearchParams('redirect=/cart');
      vi.spyOn(authService, 'loginApi').mockResolvedValue({
        accessToken: 'jwt-staff',
        user: {
          id: 'staff-1',
          email: 'nhanvien1@example.com',
          displayName: 'Nhân viên 1',
          role: 'STAFF',
        },
      });

      render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      await user.type(await screen.findByLabelText(/địa chỉ email/i), 'nhanvien1@example.com');
      await user.type(screen.getByLabelText(/^mật khẩu$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /^đăng nhập$/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/staff');
      });
    });

    it('2.2. ADMIN đăng nhập chung không có redirect chuyển về /staff', async () => {
      const user = userEvent.setup();
      vi.spyOn(authService, 'loginApi').mockResolvedValue({
        accessToken: 'jwt-admin',
        user: {
          id: 'admin-1',
          email: 'quanly@example.com',
          displayName: 'Quản lý',
          role: 'ADMIN',
        },
      });

      render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      await user.type(await screen.findByLabelText(/địa chỉ email/i), 'quanly@example.com');
      await user.type(screen.getByLabelText(/^mật khẩu$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /^đăng nhập$/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/staff');
      });
    });

    it('2.3. CUSTOMER đăng nhập với ?redirect=/staff bị chặn và chuyển về /', async () => {
      const user = userEvent.setup();
      mockSearchParams = new URLSearchParams('redirect=/staff');
      vi.spyOn(authService, 'loginApi').mockResolvedValue({
        accessToken: 'jwt-cus',
        user: {
          id: 'cus-1',
          email: 'khach@example.com',
          displayName: 'Khách demo',
          role: 'CUSTOMER',
        },
      });

      render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      await user.type(await screen.findByLabelText(/địa chỉ email/i), 'khach@example.com');
      await user.type(screen.getByLabelText(/^mật khẩu$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /^đăng nhập$/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('2.4. Đã đăng nhập STAFF mà vào /login hoặc /register thì tự chuyển về /staff', async () => {
      setAuthSession('STAFF');

      const loginView = render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/staff');
      });
      loginView.unmount();

      vi.clearAllMocks();
      render(
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/staff');
      });
    });

    it('2.5. Đăng nhập tài khoản bị khóa (403 "Tài khoản đã bị khóa") hiện thông báo và không giữ phiên', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        mockJsonResponse(403, {
          statusCode: 403,
          message: AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED,
          error: 'Forbidden',
        })
      );

      render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      await user.type(await screen.findByLabelText(/địa chỉ email/i), 'nhanvien3@example.com');
      await user.type(screen.getByLabelText(/^mật khẩu$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /^đăng nhập$/i }));

      expect(await screen.findByText(AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED)).toBeInTheDocument();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('3. Lớp bảo vệ route (RoleRouteGuard & useRequireAuth)', () => {
    it('3.1. Khách vãng lai xem được Menu (/), chi tiết món (/menu/1) và giỏ hàng (/cart)', async () => {
      for (const path of ['/', '/menu/11111111-0000-0000-0000-000000000001', '/cart']) {
        mockPathname = path;
        const { unmount } = render(
          <AuthProvider>
            <RoleRouteGuard>
              <RoleGuardProbe />
            </RoleRouteGuard>
          </AuthProvider>
        );
        expect(await screen.findByTestId('protected-content')).toHaveTextContent('GUEST');
        expect(mockReplace).not.toHaveBeenCalled();
        unmount();
      }
    });

    it('3.2. Khách chưa đăng nhập hoặc CUSTOMER gõ /staff... thì chuyển về /', async () => {
      mockPathname = '/staff';
      const guestView = render(
        <AuthProvider>
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      guestView.unmount();

      vi.clearAllMocks();
      setAuthSession('CUSTOMER');
      mockPathname = '/staff/products';
      render(
        <AuthProvider>
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('3.3. STAFF gõ /staff/employees thì chuyển về /staff, còn ADMIN được vào', async () => {
      setAuthSession('STAFF');
      mockPathname = '/staff/employees';
      const staffView = render(
        <AuthProvider>
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/staff');
      });
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      staffView.unmount();

      vi.clearAllMocks();
      setAuthSession('ADMIN');
      render(
        <AuthProvider>
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );
      expect(await screen.findByTestId('protected-content')).toHaveTextContent('ADMIN');
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('3.4. STAFF/ADMIN mở các trang khách (/, /menu/1, /cart, /checkout, /orders) thì chuyển về /staff', async () => {
      setAuthSession('STAFF');
      for (const path of ['/', '/menu/1', '/cart', '/checkout', '/orders']) {
        vi.clearAllMocks();
        mockPathname = path;
        const { unmount } = render(
          <AuthProvider>
            <RoleRouteGuard>
              <RoleGuardProbe />
            </RoleRouteGuard>
          </AuthProvider>
        );
        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalledWith('/staff');
        });
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        unmount();
      }
    });

    it('3.5. STAFF/ADMIN mở /account không bị chuyển hướng', async () => {
      setAuthSession('STAFF');
      mockPathname = '/account';
      render(
        <AuthProvider>
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );
      expect(await screen.findByTestId('protected-content')).toHaveTextContent('STAFF');
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('3.6. useRequireAuth() từ chối STAFF/ADMIN trên trang khách và chuyển về /staff', async () => {
      setAuthSession('ADMIN');
      render(
        <AuthProvider>
          <CustomerRequireAuthProbe />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/staff');
      });
      expect(screen.queryByText(/khách hàng hợp lệ/i)).not.toBeInTheDocument();
    });
  });

  describe('4. Xử lý 403 "Tài khoản đã bị khóa" khi đang dùng API', () => {
    it('4.1. Gặp 403 "Tài khoản đã bị khóa" ở apiFetch/apiRequest: hiện thông báo, tự đăng xuất và đẩy khỏi /staff', async () => {
      setAuthSession('STAFF');
      mockPathname = '/staff';

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        mockJsonResponse(403, {
          statusCode: 403,
          message: AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED,
          error: 'Forbidden',
        })
      );

      render(
        <AuthProvider>
          <AccountLockedNotice />
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );

      expect(await screen.findByTestId('protected-content')).toHaveTextContent('STAFF');

      await act(async () => {
        await expect(authService.apiFetch('/orders/me')).rejects.toThrow(
          AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED
        );
      });

      expect(await screen.findByTestId('account-locked-notice')).toHaveTextContent(
        AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED
      );
      expect(loadAuthSession()).toBeNull();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });

    it('4.2. Gặp 403 sai vai trò ("Bạn không có quyền thực hiện thao tác này") KHÔNG tự đăng xuất', async () => {
      setAuthSession('STAFF');
      mockPathname = '/staff';

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        mockJsonResponse(403, {
          statusCode: 403,
          message: AUTH_ERROR_MESSAGES.FORBIDDEN,
          error: 'Forbidden',
        })
      );

      render(
        <AuthProvider>
          <AccountLockedNotice />
          <RoleRouteGuard>
            <RoleGuardProbe />
          </RoleRouteGuard>
        </AuthProvider>
      );

      expect(await screen.findByTestId('protected-content')).toHaveTextContent('STAFF');

      await act(async () => {
        await expect(authService.apiRequest('/staff')).rejects.toMatchObject({
          statusCode: 403,
          message: AUTH_ERROR_MESSAGES.FORBIDDEN,
        });
      });

      expect(screen.queryByTestId('account-locked-notice')).not.toBeInTheDocument();
      expect(loadAuthSession()).not.toBeNull();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});

