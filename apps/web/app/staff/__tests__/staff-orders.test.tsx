import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { OrderResponse, ORDER_STATUS_LABELS } from '../../../services/order-contract';
import {
  AUTH_ACCOUNT_LOCKED_EVENT,
  AUTH_STORAGE_KEY,
  saveAuthSession,
} from '../../../utils/auth';
import { resetRedirectFlag } from '../../../services/auth';
import StaffOrdersPage from '../page';
import {
  MOCK_STAFF_ORDERS_SEED,
  resetMockStaffOrders,
} from '../mocks/staff-orders-mock';

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
  usePathname: vi.fn(() => '/staff'),
}));

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

function cloneSeedOrders(): OrderResponse[] {
  return JSON.parse(JSON.stringify(MOCK_STAFF_ORDERS_SEED)) as OrderResponse[];
}

function setStaffAuthSession(role: 'STAFF' | 'ADMIN' = 'STAFF') {
  saveAuthSession({
    token: 'jwt-staff-token-test',
    user: {
      id: '55555555-0000-0000-0000-000000000001',
      email: 'nhanvien1@example.com',
      displayName: 'Nhân viên 1',
      role,
    },
  });
}

function renderStaffOrdersPage() {
  return render(
    <AuthProvider>
      <StaffOrdersPage />
    </AuthProvider>
  );
}

describe('Dòng 20 - Trang /staff (Quản lý đơn hàng)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockStaffOrders();

    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    delete process.env.NEXT_PUBLIC_USE_MOCK_ORDERS;
    delete process.env.NEXT_PUBLIC_USE_MOCK_STAFF_ORDERS;
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

  it('1. Hiển thị loading rồi tải bảng đơn hàng với đủ cột và quy tắc nút theo từng trạng thái', async () => {
    const orders = cloneSeedOrders();
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = vi.fn().mockReturnValueOnce(pendingFetch);

    renderStaffOrdersPage();

    expect(await screen.findByTestId('staff-orders-loading')).toBeInTheDocument();

    resolveFetch(mockJsonResponse(200, orders));

    const paidRow = await screen.findByTestId('staff-order-row-2007');
    expect(within(paidRow).getByText('#2007')).toBeInTheDocument();
    expect(within(paidRow).getByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(within(paidRow).getByText('136.000đ')).toBeInTheDocument();
    expect(within(paidRow).getByText('Đã thanh toán')).toBeInTheDocument();
    expect(within(paidRow).getByText('15/11/2026 15:15')).toBeInTheDocument();

    // PAID: có cả nút chuyển bước và nút hủy đơn
    expect(
      within(paidRow).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeInTheDocument();
    expect(within(paidRow).getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();

    // PREPARING: chỉ có nút chuyển bước, không có nút hủy
    const preparingRow = screen.getByTestId('staff-order-row-2006');
    expect(within(preparingRow).getByText('Đang pha chế')).toBeInTheDocument();
    expect(
      within(preparingRow).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeInTheDocument();
    expect(within(preparingRow).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    // READY: chỉ có nút chuyển bước, không có nút hủy
    const readyRow = screen.getByTestId('staff-order-row-2005');
    expect(within(readyRow).getByText('Sẵn sàng nhận')).toBeInTheDocument();
    expect(
      within(readyRow).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeInTheDocument();
    expect(within(readyRow).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    // PENDING: chỉ có nút hủy, không có nút chuyển bước
    const pendingRow = screen.getByTestId('staff-order-row-2004');
    expect(within(pendingRow).getByText('Chờ thanh toán')).toBeInTheDocument();
    expect(
      within(pendingRow).queryByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).not.toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();

    // PAYMENT_FAILED: chỉ có nút hủy, không có nút chuyển bước
    const failedRow = screen.getByTestId('staff-order-row-2003');
    expect(within(failedRow).getByText('Thanh toán lỗi')).toBeInTheDocument();
    expect(
      within(failedRow).queryByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).not.toBeInTheDocument();
    expect(within(failedRow).getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();

    // COMPLETED & CANCELLED: không có nút chuyển bước lẫn nút hủy
    const completedRow = screen.getByTestId('staff-order-row-2002');
    expect(within(completedRow).getByText('Hoàn thành')).toBeInTheDocument();
    expect(
      within(completedRow).queryByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).not.toBeInTheDocument();
    expect(within(completedRow).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    const cancelledRow = screen.getByTestId('staff-order-row-2001');
    expect(within(cancelledRow).getByText('Đã hủy')).toBeInTheDocument();
    expect(
      within(cancelledRow).queryByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).not.toBeInTheDocument();
    expect(within(cancelledRow).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(calledUrl)).toBe('http://localhost:3001/orders');
    expect(calledInit?.method).toBe('GET');
  });

  it('2. Ô lọc trạng thái gọi GET /orders?status=... và hiển thị đúng đơn đã lọc', async () => {
    const user = userEvent.setup();
    const allOrders = cloneSeedOrders();
    const paidOnly = allOrders.filter((o) => o.status === 'PAID');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, allOrders))
      .mockResolvedValueOnce(mockJsonResponse(200, paidOnly))
      .mockResolvedValueOnce(mockJsonResponse(200, allOrders));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();
    await screen.findByTestId('staff-order-row-2007');

    const filterSelect = screen.getByLabelText('Lọc theo trạng thái');
    await user.selectOptions(filterSelect, 'PAID');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(String(fetchMock.mock.calls[1][0])).toBe('http://localhost:3001/orders?status=PAID');
    expect(screen.getByTestId('staff-order-row-2007')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-order-row-2006')).not.toBeInTheDocument();

    await user.selectOptions(filterSelect, 'ALL');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(String(fetchMock.mock.calls[2][0])).toBe('http://localhost:3001/orders');
    expect(await screen.findByTestId('staff-order-row-2006')).toBeInTheDocument();
  });

  it('3. Bấm vào dòng đơn để xem chi tiết món nước và món bánh mà không gọi thêm GET /orders/:id', async () => {
    const user = userEvent.setup();
    const orders = cloneSeedOrders();
    const fetchMock = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, orders));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();
    const paidRow = await screen.findByTestId('staff-order-row-2007');

    await user.click(paidRow);

    const detailPanel = await screen.findByTestId('staff-order-detail-2007');
    expect(within(detailPanel).getByText('Mang đi')).toBeInTheDocument();
    expect(within(detailPanel).getByText('nguyenan@gmail.com')).toBeInTheDocument();
    expect(within(detailPanel).getByText(/Cho xin thêm quai xách giấy/)).toBeInTheDocument();

    // Món nước có size/đường/đá & topping
    expect(within(detailPanel).getByText(/Trà sữa truyền thống/)).toBeInTheDocument();
    expect(
      within(detailPanel).getByText(/Size M \(\+6\.000đ\) • Đường 70% • Đá vừa/)
    ).toBeInTheDocument();
    expect(
      within(detailPanel).getByText(/Trân châu đen \(\+5\.000đ\), Pudding \(\+7\.000đ\)/)
    ).toBeInTheDocument();

    // Món bánh ẩn size/đường/đá
    expect(within(detailPanel).getByText(/Bánh Croissant/)).toBeInTheDocument();
    expect(within(detailPanel).getByText(/Hâm nóng giúp mình/)).toBeInTheDocument();

    // Không gọi thêm GET /orders/:id
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Bấm lại để thu gọn
    await user.click(within(paidRow).getByRole('button', { name: 'Thu gọn' }));
    expect(screen.queryByTestId('staff-order-detail-2007')).not.toBeInTheDocument();
  });

  it('4. Chuyển bước tiếp theo đi đúng thứ tự PAID -> PREPARING -> READY -> COMPLETED và chỉ gửi status', async () => {
    const user = userEvent.setup();
    const targetOrder = cloneSeedOrders()[0]; // PAID (#2007)

    const preparingRes: OrderResponse = { ...targetOrder, status: 'PREPARING' };
    const readyRes: OrderResponse = { ...targetOrder, status: 'READY' };
    const completedRes: OrderResponse = { ...targetOrder, status: 'COMPLETED' };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [targetOrder]))
      .mockResolvedValueOnce(mockJsonResponse(200, preparingRes))
      .mockResolvedValueOnce(mockJsonResponse(200, readyRes))
      .mockResolvedValueOnce(mockJsonResponse(200, completedRes));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();
    const row = await screen.findByTestId('staff-order-row-2007');

    // PAID -> PREPARING
    await user.click(within(row).getByRole('button', { name: 'Chuyển sang bước tiếp theo' }));
    await waitFor(() => {
      expect(within(row).getByText(ORDER_STATUS_LABELS.PREPARING)).toBeInTheDocument();
    });
    expect(within(row).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    // PREPARING -> READY
    await user.click(within(row).getByRole('button', { name: 'Chuyển sang bước tiếp theo' }));
    await waitFor(() => {
      expect(within(row).getByText(ORDER_STATUS_LABELS.READY)).toBeInTheDocument();
    });

    // READY -> COMPLETED
    await user.click(within(row).getByRole('button', { name: 'Chuyển sang bước tiếp theo' }));
    await waitFor(() => {
      expect(within(row).getByText(ORDER_STATUS_LABELS.COMPLETED)).toBeInTheDocument();
    });
    expect(
      within(row).queryByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    // Xác minh chỉ gửi đúng { status }
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/orders/${targetOrder.id}/status`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      status: 'PREPARING',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      status: 'READY',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      status: 'COMPLETED',
    });
  });

  it('5. Hủy đơn mở hộp xác nhận; đóng thì giữ nguyên, xác nhận thì chỉ gửi { status: CANCELLED }', async () => {
    const user = userEvent.setup();
    const pendingOrder = cloneSeedOrders().find((o) => o.status === 'PENDING')!;
    const cancelledRes: OrderResponse = { ...pendingOrder, status: 'CANCELLED' };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [pendingOrder]))
      .mockResolvedValueOnce(mockJsonResponse(200, cancelledRes));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();
    const row = await screen.findByTestId(`staff-order-row-${pendingOrder.orderNumber}`);

    await user.click(within(row).getByRole('button', { name: 'Hủy đơn' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`Hủy đơn #${pendingOrder.orderNumber}?`)).toBeInTheDocument();

    // Bấm Đóng -> không gọi API hủy
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mở lại và bấm Xác nhận hủy
    await user.click(within(row).getByRole('button', { name: 'Hủy đơn' }));
    const dialogAgain = await screen.findByRole('dialog');
    await user.click(within(dialogAgain).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(within(row).getByText('Đã hủy')).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/orders/${pendingOrder.id}/status`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      status: 'CANCELLED',
    });
  });

  it('6. Khi server trả lỗi 409 Conflict: hiện đúng message tiếng Việt và tự động tải lại danh sách', async () => {
    const user = userEvent.setup();
    const paidOrder = cloneSeedOrders()[0]; // #2007 PAID
    const refreshedOrder: OrderResponse = { ...paidOrder, status: 'CANCELLED' };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [paidOrder]))
      .mockResolvedValueOnce(
        mockJsonResponse(409, {
          statusCode: 409,
          message: 'Trạng thái đơn đã thay đổi, vui lòng tải lại',
          error: 'Conflict',
        })
      )
      .mockResolvedValueOnce(mockJsonResponse(200, [refreshedOrder]));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();
    const row = await screen.findByTestId('staff-order-row-2007');

    await user.click(within(row).getByRole('button', { name: 'Chuyển sang bước tiếp theo' }));

    const alert = await screen.findByTestId('staff-orders-action-error');
    expect(alert).toHaveTextContent('Trạng thái đơn đã thay đổi, vui lòng tải lại');

    await waitFor(() => {
      expect(within(row).getByText('Đã hủy')).toBeInTheDocument();
    });
    // Thông báo lỗi 409 vẫn giữ nguyên sau khi tải lại danh sách
    expect(screen.getByTestId('staff-orders-action-error')).toHaveTextContent(
      'Trạng thái đơn đã thay đổi, vui lòng tải lại'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('7. Xử lý 401 (về đăng nhập) và 403 "Tài khoản đã bị khóa" (thông báo + tự đăng xuất)', async () => {
    const originalLocation = window.location;
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = {
      pathname: '/staff',
      search: '',
      href: '/staff',
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

    const { unmount } = renderStaffOrdersPage();

    const lockedErrorBox = await screen.findByTestId('staff-orders-error');
    expect(lockedErrorBox).toHaveTextContent('Tài khoản đã bị khóa');
    expect(lockedMessages).toEqual(['Tài khoản đã bị khóa']);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();

    unmount();

    // 7b. 401 Chưa đăng nhập / hết phiên
    setStaffAuthSession('STAFF');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse(401, {
        statusCode: 401,
        message: 'Unauthorized',
      })
    );

    renderStaffOrdersPage();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(window.location.href).toBe('/login?redirect=%2Fstaff&expired=true');
    });

    window.removeEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);
    (window as unknown as Record<string, unknown>).location = originalLocation;
  });

  it('8. Hiển thị đúng trạng thái Empty (theo bộ lọc) và Error kèm nút Thử lại', async () => {
    const user = userEvent.setup();
    const orders = cloneSeedOrders();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network fail'))
      .mockResolvedValueOnce(mockJsonResponse(200, []))
      .mockResolvedValueOnce(mockJsonResponse(200, orders));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();

    // Error ban đầu
    const errorBox = await screen.findByTestId('staff-orders-error');
    expect(errorBox).toHaveTextContent('Không thể kết nối đến máy chủ');

    // Bấm Thử lại -> nhận [] -> Empty
    await user.click(within(errorBox).getByRole('button', { name: 'Thử lại' }));
    const emptyBox = await screen.findByTestId('staff-orders-empty');
    expect(emptyBox).toHaveTextContent('Chưa có đơn hàng nào');

    // Bấm Tải lại -> có dữ liệu
    await user.click(within(emptyBox).getByRole('button', { name: 'Tải lại' }));
    expect(await screen.findByTestId('staff-order-row-2007')).toBeInTheDocument();
  });

  it('9. Khi bật dữ liệu giả riêng NEXT_PUBLIC_USE_MOCK_STAFF_ORDERS=true thì chạy hoàn toàn bằng dữ liệu giả', async () => {
    const user = userEvent.setup();
    process.env.NEXT_PUBLIC_USE_MOCK_STAFF_ORDERS = 'true';
    globalThis.fetch = vi.fn();

    renderStaffOrdersPage();

    const row = await screen.findByTestId('staff-order-row-2007');
    expect(within(row).getByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(within(row).getByText('Đã thanh toán')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Chuyển sang bước tiếp theo' }));
    await waitFor(() => {
      expect(within(row).getByText('Đang pha chế')).toBeInTheDocument();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

