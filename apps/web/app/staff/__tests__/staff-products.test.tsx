import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { ProductManage } from '../../../services/api';
import { resetRedirectFlag } from '../../../services/auth';
import {
  AUTH_ACCOUNT_LOCKED_EVENT,
  AUTH_STORAGE_KEY,
  saveAuthSession,
} from '../../../utils/auth';
import {
  MOCK_STAFF_PRODUCTS_SEED,
  resetMockStaffProducts,
} from '../mocks/staff-products-mock';
import StaffProductsPage from '../products/page';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => '/staff/products'),
}));

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

function cloneSeedProducts(): ProductManage[] {
  return MOCK_STAFF_PRODUCTS_SEED.map((item) => ({ ...item }));
}

function setStaffAuthSession(role: 'STAFF' | 'ADMIN' = 'STAFF') {
  saveAuthSession({
    token: `jwt-${role.toLowerCase()}-token-test`,
    user: {
      id:
        role === 'ADMIN'
          ? '66666666-0000-0000-0000-000000000001'
          : '55555555-0000-0000-0000-000000000001',
      email: role === 'ADMIN' ? 'quanly@example.com' : 'nhanvien1@example.com',
      displayName: role === 'ADMIN' ? 'Quản lý' : 'Nhân viên 1',
      role,
    },
  });
}

function renderStaffProductsPage() {
  return render(
    <AuthProvider>
      <StaffProductsPage />
    </AuthProvider>
  );
}

describe('Dòng 21 - Trang /staff/products (Quản lý món)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockStaffProducts();

    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    delete process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS;
    delete process.env.NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    setStaffAuthSession('STAFF');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('1. STAFF: hiển thị loading, danh sách món đang hiện (ảnh, tên, danh mục tiếng Việt, giá, trạng thái), ẩn món đã ẩn và ẩn các nút của ADMIN', async () => {
    const products = cloneSeedProducts();
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = vi.fn().mockReturnValueOnce(pendingFetch);

    renderStaffProductsPage();

    expect(await screen.findByTestId('staff-products-loading')).toBeInTheDocument();

    resolveFetch(mockJsonResponse(200, products));

    const coffeeRow = await screen.findByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000001'
    );
    expect(within(coffeeRow).getByText('Cà phê sữa đá')).toBeInTheDocument();
    expect(within(coffeeRow).getByText('Cà phê')).toBeInTheDocument();
    expect(within(coffeeRow).getByText('29.000đ')).toBeInTheDocument();
    expect(within(coffeeRow).getByText('Đang bán')).toBeInTheDocument();
    expect(within(coffeeRow).getByRole('img', { name: 'Cà phê sữa đá' })).toHaveAttribute(
      'src',
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500'
    );
    expect(within(coffeeRow).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    // Tuyệt đối không hiển thị số lượng tồn kho
    expect(within(coffeeRow).queryByText('50')).not.toBeInTheDocument();

    const outOfStockRow = screen.getByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000003'
    );
    expect(within(outOfStockRow).getByText('Bạc xỉu')).toBeInTheDocument();
    expect(within(outOfStockRow).getByText('Tạm hết')).toBeInTheDocument();
    expect(within(outOfStockRow).getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    // STAFF không thấy món ẩn (isVisible: false)
    expect(
      screen.queryByTestId('staff-product-row-11111111-0000-0000-0000-000000000012')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Hồng trà kem cheese')).not.toBeInTheDocument();
    expect(screen.queryByText('Đã ẩn')).not.toBeInTheDocument();

    // STAFF không thấy nút Thêm món, Sửa, Ẩn, Hiện, Xóa
    expect(screen.queryByRole('button', { name: 'Thêm món' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hiện' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xóa/i })).not.toBeInTheDocument();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(calledUrl)).toBe('http://localhost:3001/products/manage');
    expect(calledInit?.method).toBe('GET');
  });

  it('2. ADMIN: thấy thêm nút Thêm món, Sửa, Ẩn/Hiện và thấy cả món ẩn có nhãn "Đã ẩn"', async () => {
    setStaffAuthSession('ADMIN');
    const products = cloneSeedProducts();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, products));

    renderStaffProductsPage();

    expect(await screen.findByRole('button', { name: 'Thêm món' })).toBeInTheDocument();

    const visibleRow = await screen.findByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000001'
    );
    expect(within(visibleRow).getByRole('switch')).toBeInTheDocument();
    expect(within(visibleRow).getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(within(visibleRow).getByRole('button', { name: 'Ẩn' })).toBeInTheDocument();
    expect(within(visibleRow).queryByText('Đã ẩn')).not.toBeInTheDocument();

    const hiddenRow = screen.getByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000012'
    );
    expect(within(hiddenRow).getByText('Hồng trà kem cheese')).toBeInTheDocument();
    expect(within(hiddenRow).getByText('Trà')).toBeInTheDocument();
    expect(within(hiddenRow).getByText('45.000đ')).toBeInTheDocument();
    expect(within(hiddenRow).getByText('Đã ẩn')).toBeInTheDocument();
    expect(within(hiddenRow).getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(within(hiddenRow).getByRole('button', { name: 'Hiện' })).toBeInTheDocument();
    expect(within(hiddenRow).queryByText('999')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xóa/i })).not.toBeInTheDocument();
  });

  it('3. Công tắc đang bán/tạm hết gọi PATCH /products/:id/availability với đúng { isAvailable }', async () => {
    const user = userEvent.setup();
    const target = cloneSeedProducts().find(
      (item) => item.id === '11111111-0000-0000-0000-000000000001'
    )!;
    const outOfStockRes: ProductManage = { ...target, stock: 0 };
    const availableRes: ProductManage = { ...target, stock: 999 };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [target]))
      .mockResolvedValueOnce(mockJsonResponse(200, outOfStockRes))
      .mockResolvedValueOnce(mockJsonResponse(200, availableRes));
    globalThis.fetch = fetchMock;

    renderStaffProductsPage();

    const row = await screen.findByTestId(`staff-product-row-${target.id}`);
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Gạt sang Tạm hết
    await user.click(toggle);
    await waitFor(() => {
      expect(within(row).getByText('Tạm hết')).toBeInTheDocument();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('staff-products-action-success')).toHaveTextContent(
      'Đã chuyển "Cà phê sữa đá" sang trạng thái Tạm hết.'
    );

    // Gạt lại sang Đang bán
    await user.click(toggle);
    await waitFor(() => {
      expect(within(row).getByText('Đang bán')).toBeInTheDocument();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/products/${target.id}/availability`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isAvailable: false,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      isAvailable: true,
    });
  });

  it('4. ADMIN bấm Ẩn mở hộp xác nhận ConfirmDialog; Đóng giữ nguyên, Xác nhận gọi PATCH /products/:id với { isVisible: false } rồi Hiện gọi { isVisible: true }', async () => {
    const user = userEvent.setup();
    setStaffAuthSession('ADMIN');

    const target = cloneSeedProducts().find(
      (item) => item.id === '11111111-0000-0000-0000-000000000004'
    )!;
    const hiddenRes: ProductManage = { ...target, isVisible: false };
    const shownRes: ProductManage = { ...target, isVisible: true };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [target]))
      .mockResolvedValueOnce(mockJsonResponse(200, hiddenRes))
      .mockResolvedValueOnce(mockJsonResponse(200, shownRes));
    globalThis.fetch = fetchMock;

    renderStaffProductsPage();

    const row = await screen.findByTestId(`staff-product-row-${target.id}`);

    // Bấm Ẩn -> mở hộp xác nhận
    await user.click(within(row).getByRole('button', { name: 'Ẩn' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`Ẩn món "${target.name}"?`)).toBeInTheDocument();

    // Bấm Đóng -> không gọi API
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mở lại và bấm Xác nhận ẩn
    await user.click(within(row).getByRole('button', { name: 'Ẩn' }));
    const dialogAgain = await screen.findByRole('dialog');
    await user.click(within(dialogAgain).getByRole('button', { name: 'Xác nhận ẩn' }));

    await waitFor(() => {
      expect(within(row).getByText('Đã ẩn')).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Hiện' })).toBeInTheDocument();

    // Bấm Hiện -> hiện lại món
    await user.click(within(row).getByRole('button', { name: 'Hiện' }));
    await waitFor(() => {
      expect(within(row).queryByText('Đã ẩn')).not.toBeInTheDocument();
    });
    expect(within(row).getByRole('button', { name: 'Ẩn' })).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/products/${target.id}`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isVisible: false,
    });
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      `http://localhost:3001/products/${target.id}`
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      isVisible: true,
    });
  });

  it('5. Xử lý 401 (về đăng nhập), 403 "Tài khoản đã bị khóa" (thông báo + tự đăng xuất) và lỗi khác đúng message của server', async () => {
    const user = userEvent.setup();
    const originalLocation = window.location;
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = {
      pathname: '/staff/products',
      search: '',
      href: '/staff/products',
    };

    const lockedMessages: string[] = [];
    const handleLockedEvent = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string }>;
      lockedMessages.push(custom.detail?.message || '');
    };
    window.addEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);

    // 5a. 403 Tài khoản đã bị khóa
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse(403, {
        statusCode: 403,
        message: 'Tài khoản đã bị khóa',
        error: 'Forbidden',
      })
    );

    const { unmount } = renderStaffProductsPage();

    const lockedErrorBox = await screen.findByTestId('staff-products-error');
    expect(lockedErrorBox).toHaveTextContent('Tài khoản đã bị khóa');
    expect(lockedMessages).toEqual(['Tài khoản đã bị khóa']);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    unmount();

    // 5b. 403 sai vai trò / 404 lỗi server khi thao tác
    setStaffAuthSession('ADMIN');
    const target = cloneSeedProducts()[0];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [target]))
      .mockResolvedValueOnce(
        mockJsonResponse(403, {
          statusCode: 403,
          message: 'Bạn không có quyền thực hiện thao tác này',
          error: 'Forbidden',
        })
      );

    const { unmount: unmountActionErr } = renderStaffProductsPage();
    const row = await screen.findByTestId(`staff-product-row-${target.id}`);
    await user.click(within(row).getByRole('switch'));

    const actionErr = await screen.findByTestId('staff-products-action-error');
    expect(actionErr).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    unmountActionErr();

    // 5c. 401 hết phiên / chưa đăng nhập
    setStaffAuthSession('STAFF');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse(401, {
        statusCode: 401,
        message: 'Unauthorized',
      })
    );

    renderStaffProductsPage();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(window.location.href).toBe('/login?redirect=%2Fstaff%2Fproducts&expired=true');
    });

    window.removeEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);
    (window as unknown as Record<string, unknown>).location = originalLocation;
  });

  it('6. Hiển thị đúng trạng thái Error kèm nút Thử lại và trạng thái Empty (kể cả khi STAFF chỉ nhận món ẩn)', async () => {
    const user = userEvent.setup();
    const hiddenOnly: ProductManage[] = [
      {
        ...cloneSeedProducts().find((item) => !item.isVisible)!,
      },
    ];
    const visibleItem = cloneSeedProducts().find((item) => item.isVisible)!;

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network fail'))
      .mockResolvedValueOnce(mockJsonResponse(200, hiddenOnly))
      .mockResolvedValueOnce(mockJsonResponse(200, [visibleItem]));
    globalThis.fetch = fetchMock;

    renderStaffProductsPage();

    const errorBox = await screen.findByTestId('staff-products-error');
    expect(errorBox).toHaveTextContent('Không thể kết nối đến máy chủ');

    // Thử lại -> chỉ có món ẩn nên với STAFF vẫn Empty
    await user.click(within(errorBox).getByRole('button', { name: 'Thử lại' }));
    const emptyBox = await screen.findByTestId('staff-products-empty');
    expect(emptyBox).toHaveTextContent('Chưa có món nào');

    // Tải lại -> có món đang hiện
    await user.click(within(emptyBox).getByRole('button', { name: 'Tải lại' }));
    expect(await screen.findByTestId(`staff-product-row-${visibleItem.id}`)).toBeInTheDocument();
  });

  it('7. Khi bật dữ liệu giả riêng NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS=true thì chạy hoàn toàn bằng mock', async () => {
    const user = userEvent.setup();
    process.env.NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS = 'true';
    setStaffAuthSession('ADMIN');
    globalThis.fetch = vi.fn();

    renderStaffProductsPage();

    const hiddenRow = await screen.findByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000012'
    );
    expect(within(hiddenRow).getByText('Đã ẩn')).toBeInTheDocument();

    await user.click(within(hiddenRow).getByRole('button', { name: 'Hiện' }));
    await waitFor(() => {
      expect(within(hiddenRow).queryByText('Đã ẩn')).not.toBeInTheDocument();
    });

    const toggle = within(hiddenRow).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    await waitFor(() => {
      expect(within(hiddenRow).getByText('Tạm hết')).toBeInTheDocument();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
