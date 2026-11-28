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
  updateMockStaffProductAvailability,
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

describe('Dòng 21 & 23 - Trang /staff/products (Quản lý món & Tồn kho)', () => {
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

  it('1. STAFF: hiển thị loading, cột "Còn lại" (tô đỏ khi stock <= 5 kể cả 0), nút "Sửa số lượng" cho món đang bán và ẩn phần của ADMIN', async () => {
    const products = cloneSeedProducts();
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = vi.fn().mockReturnValueOnce(pendingFetch);

    renderStaffProductsPage();

    expect(await screen.findByTestId('staff-products-loading')).toBeInTheDocument();

    resolveFetch(mockJsonResponse(200, products));

    // Có tiêu đề cột "Còn lại"
    expect(await screen.findByRole('columnheader', { name: 'Còn lại' })).toBeInTheDocument();

    // Món stock > 5 (Cà phê sữa đá: 50) -> không tô đỏ, có nút Sửa số lượng
    const coffeeRow = screen.getByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000001'
    );
    expect(within(coffeeRow).getByText('Cà phê sữa đá')).toBeInTheDocument();
    expect(within(coffeeRow).getByText('Cà phê')).toBeInTheDocument();
    expect(within(coffeeRow).getByText('29.000đ')).toBeInTheDocument();
    expect(within(coffeeRow).getByText('Đang bán')).toBeInTheDocument();
    const coffeeStock = within(coffeeRow).getByTestId(
      'staff-product-stock-11111111-0000-0000-0000-000000000001'
    );
    expect(coffeeStock).toHaveTextContent('50');
    expect(coffeeStock.className).not.toContain('text-error');
    expect(within(coffeeRow).getByRole('button', { name: 'Sửa số lượng' })).toBeInTheDocument();
    expect(within(coffeeRow).getByRole('img', { name: 'Cà phê sữa đá' })).toHaveAttribute(
      'src',
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500'
    );
    expect(within(coffeeRow).getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    // Món stock <= 5 nhưng > 0 (Bánh Croissant: 3, Trà sữa truyền thống: 5) -> tô đỏ (text-error)
    const lowCakeRow = screen.getByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000010'
    );
    const lowCakeStock = within(lowCakeRow).getByTestId(
      'staff-product-stock-11111111-0000-0000-0000-000000000010'
    );
    expect(lowCakeStock).toHaveTextContent('3');
    expect(lowCakeStock.className).toContain('text-error');
    expect(within(lowCakeRow).getByRole('button', { name: 'Sửa số lượng' })).toBeInTheDocument();

    const boundaryRow = screen.getByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000007'
    );
    const boundaryStock = within(boundaryRow).getByTestId(
      'staff-product-stock-11111111-0000-0000-0000-000000000007'
    );
    expect(boundaryStock).toHaveTextContent('5');
    expect(boundaryStock.className).toContain('text-error');

    // Món stock = 0 (Bạc xỉu) -> tô đỏ, Tạm hết, không có nút Sửa số lượng
    const outOfStockRow = screen.getByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000003'
    );
    expect(within(outOfStockRow).getByText('Bạc xỉu')).toBeInTheDocument();
    expect(within(outOfStockRow).getByText('Tạm hết')).toBeInTheDocument();
    const outStockValue = within(outOfStockRow).getByTestId(
      'staff-product-stock-11111111-0000-0000-0000-000000000003'
    );
    expect(outStockValue).toHaveTextContent('0');
    expect(outStockValue.className).toContain('text-error');
    expect(within(outOfStockRow).queryByRole('button', { name: 'Sửa số lượng' })).not.toBeInTheDocument();
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

  it('2. ADMIN: thấy cột Còn lại, nút Sửa số lượng, Thêm món, Sửa, Ẩn/Hiện và món ẩn có nhãn "Đã ẩn"', async () => {
    setStaffAuthSession('ADMIN');
    const products = cloneSeedProducts();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, products));

    renderStaffProductsPage();

    expect(await screen.findByRole('button', { name: 'Thêm món' })).toBeInTheDocument();

    const visibleRow = await screen.findByTestId(
      'staff-product-row-11111111-0000-0000-0000-000000000001'
    );
    expect(within(visibleRow).getByRole('switch')).toBeInTheDocument();
    expect(within(visibleRow).getByRole('button', { name: 'Sửa số lượng' })).toBeInTheDocument();
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
    expect(
      within(hiddenRow).getByTestId('staff-product-stock-11111111-0000-0000-0000-000000000012')
    ).toHaveTextContent('999');
    expect(within(hiddenRow).getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(within(hiddenRow).getByRole('button', { name: 'Hiện' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xóa/i })).not.toBeInTheDocument();
  });

  it('3. Gạt từ Đang bán sang Tạm hết: mở ConfirmDialog (Đóng giữ nguyên; Đồng ý khóa nút, gọi PATCH isAvailable=false không gửi stock, cập nhật từ response)', async () => {
    const user = userEvent.setup();
    const target = cloneSeedProducts().find(
      (item) => item.id === '11111111-0000-0000-0000-000000000001'
    )!;
    const outOfStockRes: ProductManage = { ...target, stock: 0 };

    let resolveDisable!: (res: Response) => void;
    const pendingDisable = new Promise<Response>((resolve) => {
      resolveDisable = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [target]))
      .mockReturnValueOnce(pendingDisable);
    globalThis.fetch = fetchMock;

    renderStaffProductsPage();

    const row = await screen.findByTestId(`staff-product-row-${target.id}`);
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Gạt sang Tạm hết -> mở hộp xác nhận ConfirmDialog
    await user.click(toggle);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`Chuyển "${target.name}" sang Tạm hết?`)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Bấm Đóng -> không gọi API
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mở lại và bấm Xác nhận tạm hết
    await user.click(toggle);
    const dialogAgain = await screen.findByRole('dialog');
    await user.click(within(dialogAgain).getByRole('button', { name: 'Xác nhận tạm hết' }));

    // Đang gửi -> khóa nút tránh bấm 2 lần
    const savingBtn = within(dialogAgain).getByRole('button', { name: 'Đang lưu...' });
    expect(savingBtn).toBeDisabled();
    expect(within(dialogAgain).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    expect(toggle).toBeDisabled();

    resolveDisable(mockJsonResponse(200, outOfStockRes));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(within(row).getByText('Tạm hết')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    const stockBadge = within(row).getByTestId(`staff-product-stock-${target.id}`);
    expect(stockBadge).toHaveTextContent('0');
    expect(stockBadge.className).toContain('text-error');
    expect(within(row).queryByRole('button', { name: 'Sửa số lượng' })).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-products-action-success')).toHaveTextContent(
      'Đã chuyển "Cà phê sữa đá" sang trạng thái Tạm hết.'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/products/${target.id}/availability`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    const sentBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(sentBody).toEqual({ isAvailable: false });
    expect('stock' in sentBody).toBe(false);
  });

  it('4. Gạt từ Tạm hết sang Đang bán: mở hộp nhập số lượng (báo lỗi tiếng Việt nếu sai 1-9999; hợp lệ gửi isAvailable=true + stock, cập nhật từ response)', async () => {
    const user = userEvent.setup();
    const target = cloneSeedProducts().find(
      (item) => item.id === '11111111-0000-0000-0000-000000000003'
    )!; // Bạc xỉu (stock: 0)
    // Trả từ server số lượng 26 để kiểm chứng cập nhật đúng theo response của server
    const serverUpdated: ProductManage = { ...target, stock: 26 };

    let resolveEnable!: (res: Response) => void;
    const pendingEnable = new Promise<Response>((resolve) => {
      resolveEnable = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [target]))
      .mockReturnValueOnce(pendingEnable);
    globalThis.fetch = fetchMock;

    renderStaffProductsPage();

    const row = await screen.findByTestId(`staff-product-row-${target.id}`);
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    const dialog = await screen.findByTestId('product-stock-dialog');
    const input = within(dialog).getByLabelText(/Số lượng còn lại/i) as HTMLInputElement;
    expect(input.value).toBe('');

    const submitBtn = within(dialog).getByRole('button', { name: 'Xác nhận mở bán' });

    // Bỏ trống -> báo lỗi tiếng Việt ngay trong hộp, không gọi API
    await user.click(submitBtn);
    expect(within(dialog).getByTestId('product-stock-error')).toHaveTextContent(
      'Vui lòng nhập số lượng còn lại'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Kiểm tra các giá trị sai: 0, 10000, -5, 12.5, abc
    for (const invalidVal of ['0', '10000', '-5', '12.5', 'abc']) {
      await user.clear(input);
      await user.type(input, invalidVal);
      await user.click(submitBtn);
      expect(within(dialog).getByTestId('product-stock-error')).toHaveTextContent(
        'Số lượng phải là số nguyên từ 1 đến 9999.'
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }

    // Nhập hợp lệ 25 -> khóa nút khi gửi -> gửi { isAvailable: true, stock: 25 }
    await user.clear(input);
    await user.type(input, '25');
    await user.click(submitBtn);

    expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    expect(input).toBeDisabled();
    expect(toggle).toBeDisabled();

    resolveEnable(mockJsonResponse(200, serverUpdated));

    await waitFor(() => {
      expect(screen.queryByTestId('product-stock-dialog')).not.toBeInTheDocument();
    });

    expect(within(row).getByText('Đang bán')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    const stockBadge = within(row).getByTestId(`staff-product-stock-${target.id}`);
    expect(stockBadge).toHaveTextContent('26');
    expect(stockBadge.className).not.toContain('text-error');
    expect(within(row).getByRole('button', { name: 'Sửa số lượng' })).toBeInTheDocument();
    expect(screen.getByTestId('staff-products-action-success')).toHaveTextContent(
      'Đã mở bán lại "Bạc xỉu" với số lượng còn lại 26.'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isAvailable: true,
      stock: 25,
    });
  });

  it('5. Món đang bán bấm "Sửa số lượng" dùng cùng hộp nhập, gửi isAvailable=true kèm số mới (đặt lại, không cộng dồn)', async () => {
    const user = userEvent.setup();
    const target = cloneSeedProducts().find(
      (item) => item.id === '11111111-0000-0000-0000-000000000010'
    )!; // Bánh Croissant (stock: 3 -> đang tô đỏ)
    const updatedRes: ProductManage = { ...target, stock: 12 };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [target]))
      .mockResolvedValueOnce(mockJsonResponse(200, updatedRes));
    globalThis.fetch = fetchMock;

    renderStaffProductsPage();

    const row = await screen.findByTestId(`staff-product-row-${target.id}`);
    const initialStock = within(row).getByTestId(`staff-product-stock-${target.id}`);
    expect(initialStock).toHaveTextContent('3');
    expect(initialStock.className).toContain('text-error');

    await user.click(within(row).getByRole('button', { name: 'Sửa số lượng' }));
    const dialog = await screen.findByTestId('product-stock-dialog');
    const input = within(dialog).getByLabelText(/Số lượng còn lại/i) as HTMLInputElement;
    expect(input.value).toBe('3');

    await user.clear(input);
    await user.type(input, '12');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu số lượng' }));

    await waitFor(() => {
      expect(screen.queryByTestId('product-stock-dialog')).not.toBeInTheDocument();
    });

    const updatedStock = within(row).getByTestId(`staff-product-stock-${target.id}`);
    expect(updatedStock).toHaveTextContent('12');
    expect(updatedStock.className).not.toContain('text-error');
    expect(screen.getByTestId('staff-products-action-success')).toHaveTextContent(
      'Đã cập nhật số lượng còn lại của "Bánh Croissant" thành 12.'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isAvailable: true,
      stock: 12,
    });
  });

  it('6. ADMIN bấm Ẩn mở ConfirmDialog; Đóng giữ nguyên, Xác nhận gọi PATCH /products/:id với { isVisible: false } rồi Hiện gọi { isVisible: true }', async () => {
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

  it('7. Xử lý 400 trong hộp số lượng, 401 (về đăng nhập), 403 "Tài khoản đã bị khóa" và 403/404/lỗi khác thành toast lỗi tiếng Việt', async () => {
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

    // 7a. 403 Tài khoản đã bị khóa
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

    // 7b. 403 sai vai trò khi xác nhận Tạm hết -> toast lỗi
    setStaffAuthSession('ADMIN');
    const availableTarget = cloneSeedProducts().find((item) => item.stock > 0)!;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [availableTarget]))
      .mockResolvedValueOnce(
        mockJsonResponse(403, {
          statusCode: 403,
          message: 'Bạn không có quyền thực hiện thao tác này',
          error: 'Forbidden',
        })
      );

    const { unmount: unmountActionErr } = renderStaffProductsPage();
    const row = await screen.findByTestId(`staff-product-row-${availableTarget.id}`);
    await user.click(within(row).getByRole('switch'));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Xác nhận tạm hết' }));

    const actionErr = await screen.findByTestId('staff-products-action-error');
    expect(actionErr).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    unmountActionErr();

    // 7c. 400 từ server khi mở bán -> hiện lỗi tiếng Việt trong hộp; 404 -> đóng hộp, toast lỗi và tải lại
    const outTarget = cloneSeedProducts().find((item) => item.stock === 0)!;
    const fetchMockStockErr = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [outTarget]))
      .mockResolvedValueOnce(
        mockJsonResponse(400, {
          statusCode: 400,
          message: ['stock must be an integer between 1 and 9999'],
          error: 'Bad Request',
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse(404, {
          statusCode: 404,
          message: 'Không tìm thấy sản phẩm',
          error: 'Not Found',
        })
      )
      .mockResolvedValueOnce(mockJsonResponse(200, []));
    globalThis.fetch = fetchMockStockErr;

    const { unmount: unmountStockErr } = renderStaffProductsPage();
    const outRow = await screen.findByTestId(`staff-product-row-${outTarget.id}`);
    await user.click(within(outRow).getByRole('switch'));
    const stockDialog = await screen.findByTestId('product-stock-dialog');
    await user.type(within(stockDialog).getByLabelText(/Số lượng còn lại/i), '10');
    await user.click(within(stockDialog).getByRole('button', { name: 'Xác nhận mở bán' }));

    expect(await within(stockDialog).findByTestId('product-stock-error')).toHaveTextContent(
      'Số lượng phải là số nguyên từ 1 đến 9999.'
    );

    await user.click(within(stockDialog).getByRole('button', { name: 'Xác nhận mở bán' }));
    await waitFor(() => {
      expect(screen.queryByTestId('product-stock-dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId('staff-products-action-error')).toHaveTextContent(
      'Không tìm thấy sản phẩm'
    );
    expect(await screen.findByTestId('staff-products-empty')).toBeInTheDocument();
    unmountStockErr();

    // 7d. 401 hết phiên -> chuyển về /login
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

  it('8. Hiển thị đúng trạng thái Error kèm nút Thử lại và trạng thái Empty (kể cả khi STAFF chỉ nhận món ẩn)', async () => {
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

  it('9. Dữ liệu giả (NEXT_PUBLIC_USE_MOCK=true): kiểm tra hàm mock availability (400/0), seed có stock <= 5 và stock = 0, luồng UI chạy hoàn toàn không gọi fetch', async () => {
    // 9a. Kiểm tra trực tiếp hàm mock theo hợp đồng mục 3.7
    await expect(
      updateMockStaffProductAvailability('11111111-0000-0000-0000-000000000003', true)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      updateMockStaffProductAvailability('11111111-0000-0000-0000-000000000003', true, 0)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      updateMockStaffProductAvailability('11111111-0000-0000-0000-000000000003', true, 10000)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      updateMockStaffProductAvailability('11111111-0000-0000-0000-000000000003', true, 2.5)
    ).rejects.toMatchObject({ statusCode: 400 });

    const disabledMock = await updateMockStaffProductAvailability(
      '11111111-0000-0000-0000-000000000001',
      false,
      55
    );
    expect(disabledMock.stock).toBe(0);

    const enabledMock = await updateMockStaffProductAvailability(
      '11111111-0000-0000-0000-000000000001',
      true,
      4
    );
    expect(enabledMock.stock).toBe(4);

    // 9b. Reset seed và kiểm tra giao diện với NEXT_PUBLIC_USE_MOCK=true
    resetMockStaffProducts();
    expect(MOCK_STAFF_PRODUCTS_SEED.some((p) => p.stock > 0 && p.stock <= 5)).toBe(true);
    expect(MOCK_STAFF_PRODUCTS_SEED.some((p) => p.stock === 0)).toBe(true);

    const user = userEvent.setup();
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
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

    // Gạt sang Tạm hết qua ConfirmDialog
    const toggle = within(hiddenRow).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Xác nhận tạm hết' }));
    await waitFor(() => {
      expect(within(hiddenRow).getByText('Tạm hết')).toBeInTheDocument();
    });
    expect(
      within(hiddenRow).getByTestId('staff-product-stock-11111111-0000-0000-0000-000000000012')
    ).toHaveTextContent('0');

    // Gạt lại sang Đang bán với số lượng 15
    await user.click(toggle);
    const stockDialog = await screen.findByTestId('product-stock-dialog');
    await user.type(within(stockDialog).getByLabelText(/Số lượng còn lại/i), '15');
    await user.click(within(stockDialog).getByRole('button', { name: 'Xác nhận mở bán' }));
    await waitFor(() => {
      expect(within(hiddenRow).getByText('Đang bán')).toBeInTheDocument();
    });
    const restoredStock = within(hiddenRow).getByTestId(
      'staff-product-stock-11111111-0000-0000-0000-000000000012'
    );
    expect(restoredStock).toHaveTextContent('15');
    expect(restoredStock.className).not.toContain('text-error');

    // Sửa số lượng thành 4 -> tô đỏ
    await user.click(within(hiddenRow).getByRole('button', { name: 'Sửa số lượng' }));
    const editStockDialog = await screen.findByTestId('product-stock-dialog');
    const editInput = within(editStockDialog).getByLabelText(/Số lượng còn lại/i);
    await user.clear(editInput);
    await user.type(editInput, '4');
    await user.click(within(editStockDialog).getByRole('button', { name: 'Lưu số lượng' }));

    await waitFor(() => {
      expect(restoredStock).toHaveTextContent('4');
    });
    expect(restoredStock.className).toContain('text-error');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
