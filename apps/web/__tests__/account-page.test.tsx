import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountPage from '../app/account/page';
import RoleRouteGuard from '../app/components/RoleRouteGuard';
import { AuthProvider } from '../context/AuthContext';
import { UserRole } from '../services/auth-contract';
import { AUTH_STORAGE_KEY, saveAuthSession } from '../utils/auth';
import { CART_STORAGE_KEY } from '../utils/cart';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  }),
  usePathname: () => '/account',
}));

function setAccountSession(role: UserRole, overrides?: { displayName?: string; email?: string }) {
  const defaults: Record<UserRole, { displayName: string; email: string }> = {
    CUSTOMER: { displayName: 'Khách demo', email: 'khach@example.com' },
    STAFF: { displayName: 'Nhân viên 1', email: 'nhanvien1@example.com' },
    ADMIN: { displayName: 'Quản lý', email: 'quanly@example.com' },
  };

  saveAuthSession({
    token: `jwt-${role.toLowerCase()}`,
    user: {
      id: `id-${role.toLowerCase()}`,
      email: overrides?.email ?? defaults[role].email,
      displayName: overrides?.displayName ?? defaults[role].displayName,
      role,
    },
  });
}

function renderAccountPage(withRoleGuard = false) {
  return render(
    <AuthProvider>
      {withRoleGuard ? (
        <RoleRouteGuard>
          <AccountPage />
        </RoleRouteGuard>
      ) : (
        <AccountPage />
      )}
    </AuthProvider>
  );
}

describe('Task 18 - Trang Thông tin tài khoản (/account)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/account');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. Hiển thị trạng thái loading khi đang đọc phiên đăng nhập và chưa chuyển hướng vội', async () => {
    setAccountSession('CUSTOMER');
    renderAccountPage();

    expect(screen.getByTestId('account-loading')).toBeInTheDocument();
    expect(screen.getByText('Đang kiểm tra trạng thái đăng nhập...')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.queryByTestId('account-loading')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('2. Chưa đăng nhập: chuyển hướng về trang đăng nhập kèm redirect=/account', async () => {
    renderAccountPage(true);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Faccount');
    });
    expect(screen.queryByRole('heading', { name: 'Thông tin tài khoản' })).not.toBeInTheDocument();
  });

  it('3. Khách hàng (CUSTOMER): hiện tên, email, nhãn "Khách hàng", link "Lịch sử đơn", nút "Đăng xuất", không có form sửa hay gọi API', async () => {
    setAccountSession('CUSTOMER');
    renderAccountPage(true);

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Khách demo')).toBeInTheDocument();
    expect(screen.getByText('khach@example.com')).toBeInTheDocument();
    expect(screen.getByText('Khách hàng')).toBeInTheDocument();

    const ordersLink = screen.getByRole('link', { name: 'Lịch sử đơn' });
    expect(ordersLink).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();

    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('4. Nhân viên (STAFF): vào được /account, hiện nhãn "Nhân viên", không có link "Lịch sử đơn" và không bị đẩy về /staff', async () => {
    setAccountSession('STAFF');
    renderAccountPage(true);

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Nhân viên 1')).toBeInTheDocument();
    expect(screen.getByText('nhanvien1@example.com')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Lịch sử đơn' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('5. Quản lý (ADMIN): vào được /account, hiện nhãn "Quản lý", không có link "Lịch sử đơn" và không bị đẩy về /staff', async () => {
    setAccountSession('ADMIN', { displayName: 'Trần Quản Lý' });
    renderAccountPage(true);

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Trần Quản Lý')).toBeInTheDocument();
    expect(screen.getByText('quanly@example.com')).toBeInTheDocument();
    expect(screen.getByText('Quản lý')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Lịch sử đơn' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('6. Bấm "Đăng xuất": xóa phiên đăng nhập, giữ nguyên giỏ hàng, chuyển về trang chủ "/"', async () => {
    const user = userEvent.setup();
    const cartData = JSON.stringify([
      { id: 'c-1', productId: 'p-1', name: 'Trà đào cam sả', unitPrice: 45000, quantity: 1, toppings: [], note: '' },
    ]);
    setAccountSession('STAFF');
    localStorage.setItem(CART_STORAGE_KEY, cartData);

    renderAccountPage(true);

    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(cartData);
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
