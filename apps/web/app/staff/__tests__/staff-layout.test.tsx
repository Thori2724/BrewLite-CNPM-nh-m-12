import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { UserRole } from '../../../services/auth-contract';
import { AUTH_STORAGE_KEY, saveAuthSession } from '../../../utils/auth';
import { CART_STORAGE_KEY } from '../../../utils/cart';
import AppShell from '../../components/AppShell';
import StaffLayout from '../layout';
import StaffProductsPage from '../products/page';
import StaffEmployeesPage from '../employees/page';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

let mockPathname = '/staff';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => mockPathname),
}));

function setAuthSession(role: UserRole, displayName: string) {
  saveAuthSession({
    token: `jwt-${role.toLowerCase()}`,
    user: {
      id: `id-${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@example.com`,
      displayName,
      role,
    },
  });
}

function renderStaffLayout(
  child: React.ReactNode = <div data-testid="staff-shell-placeholder">Nội dung trang nhân viên</div>
) {
  return render(
    <AuthProvider>
      <StaffLayout>{child}</StaffLayout>
    </AuthProvider>
  );
}

describe('Dòng 19 - Khung khu /staff', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPathname = '/staff';
    globalThis.fetch = vi.fn();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_USE_MOCK_STAFF_SHELL;

    vi.mocked(navigation.usePathname).mockImplementation(() => mockPathname);
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
    process.env = originalEnv;
  });

  it('1. Khi đăng nhập vai trò STAFF: hiện Đơn hàng, Món, ẨN Nhân viên; hiện tên + "Nhân viên" + nút Đăng xuất', async () => {
    setAuthSession('STAFF', 'Nhân viên 1');
    renderStaffLayout();

    expect(await screen.findByTestId('staff-user-name')).toHaveTextContent('Nhân viên 1');
    expect(screen.getByTestId('staff-user-role')).toHaveTextContent('Nhân viên');

    const nav = screen.getByRole('navigation', { name: 'Điều hướng khu nhân viên' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đơn hàng' })).toHaveAttribute('href', '/staff');
    expect(screen.getByRole('link', { name: 'Món' })).toHaveAttribute('href', '/staff/products');
    expect(screen.queryByRole('link', { name: 'Nhân viên' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.queryByTestId('staff-mock-role-switcher')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('2. Khi đăng nhập vai trò ADMIN: hiện đủ Đơn hàng, Món, Nhân viên; hiện tên + "Quản lý" + nút Đăng xuất', async () => {
    setAuthSession('ADMIN', 'Quản lý');
    mockPathname = '/staff/employees';
    renderStaffLayout(<StaffEmployeesPage />);

    expect(await screen.findByTestId('staff-user-name')).toHaveTextContent('Quản lý');
    expect(screen.getByTestId('staff-user-role')).toHaveTextContent('Quản lý');

    expect(screen.getByRole('link', { name: 'Đơn hàng' })).toHaveAttribute('href', '/staff');
    expect(screen.getByRole('link', { name: 'Món' })).toHaveAttribute('href', '/staff/products');
    const employeesLink = screen.getByRole('link', { name: 'Nhân viên' });
    expect(employeesLink).toHaveAttribute('href', '/staff/employees');
    expect(employeesLink).toHaveAttribute('aria-current', 'page');

    expect(screen.getByRole('heading', { name: 'Nhân viên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.queryByTestId('staff-mock-role-switcher')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('3. Khi chưa có trạng thái đăng nhập: dùng dữ liệu giả và cho phép đổi thử qua lại giữa STAFF và ADMIN', async () => {
    const user = userEvent.setup();
    renderStaffLayout(<StaffProductsPage />);

    expect(await screen.findByTestId('staff-mock-role-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('staff-user-name')).toHaveTextContent('Quản lý');
    expect(screen.getByTestId('staff-user-role')).toHaveTextContent('Quản lý');
    expect(screen.getByRole('link', { name: 'Nhân viên' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Món' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nhân viên' }));

    expect(screen.getByTestId('staff-user-name')).toHaveTextContent('Nhân viên 1');
    expect(screen.getByTestId('staff-user-role')).toHaveTextContent('Nhân viên');
    expect(screen.queryByRole('link', { name: 'Nhân viên' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quản lý' }));

    expect(screen.getByTestId('staff-user-name')).toHaveTextContent('Quản lý');
    expect(screen.getByRole('link', { name: 'Nhân viên' })).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('4. Bấm nút Đăng xuất: xóa phiên đăng nhập, giữ nguyên giỏ hàng và chuyển về trang chủ "/"', async () => {
    const user = userEvent.setup();
    const cartData = JSON.stringify([{ id: 'c1', productId: 'p1', quantity: 1 }]);
    setAuthSession('STAFF', 'Nhân viên 1');
    localStorage.setItem(CART_STORAGE_KEY, cartData);

    renderStaffLayout();

    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(cartData);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('5. AppShell ẩn header và footer của khách khi ở /staff, giữ nguyên khi ở trang khách', () => {
    mockPathname = '/staff';
    const { rerender } = render(
      <AppShell
        header={<header data-testid="customer-header">Header Khách</header>}
        notice={<div data-testid="locked-notice" />}
        footer={<footer data-testid="customer-footer">Footer Khách</footer>}
      >
        <div data-testid="page-body">Nội dung Staff</div>
      </AppShell>
    );

    expect(screen.queryByTestId('customer-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('customer-footer')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-body')).toBeInTheDocument();

    mockPathname = '/';
    rerender(
      <AppShell
        header={<header data-testid="customer-header">Header Khách</header>}
        notice={<div data-testid="locked-notice" />}
        footer={<footer data-testid="customer-footer">Footer Khách</footer>}
      >
        <div data-testid="page-body">Nội dung Khách</div>
      </AppShell>
    );

    expect(screen.getByTestId('customer-header')).toBeInTheDocument();
    expect(screen.getByTestId('customer-footer')).toBeInTheDocument();
  });
});

