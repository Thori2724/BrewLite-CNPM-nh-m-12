import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { OrderResponse, ORDER_STATUS_LABELS, OrderStatus } from '../../../services/order-contract';
import {
  AUTH_ACCOUNT_LOCKED_EVENT,
  AUTH_STORAGE_KEY,
  saveAuthSession,
} from '../../../utils/auth';
import { resetRedirectFlag } from '../../../services/auth';
import StaffOrdersPage from '../page';
import {
  getStaffOrderActionStates,
  getStaffOrderPaymentSummary,
} from '../services/staff-orders';
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

    // PAID: cả 3 nút đều hiện và bấm được
    expect(within(paidRow).getByRole('button', { name: 'Chi tiết' })).toBeEnabled();
    expect(
      within(paidRow).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeEnabled();
    expect(within(paidRow).getByRole('button', { name: 'Hủy đơn' })).toBeEnabled();

    // PREPARING: nút chuyển bước bấm được; nút Hủy đơn vẫn hiện nhưng bị xám + khóa + có chú thích
    const preparingRow = screen.getByTestId('staff-order-row-2006');
    expect(within(preparingRow).getByText('Đang pha chế')).toBeInTheDocument();
    expect(
      within(preparingRow).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeEnabled();
    const preparingCancelBtn = within(preparingRow).getByRole('button', { name: 'Hủy đơn' });
    expect(preparingCancelBtn).toBeDisabled();
    expect(preparingCancelBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn đã vào pha chế, không thể hủy'
    );

    // READY: nút chuyển bước bấm được; nút Hủy đơn vẫn hiện nhưng bị xám + khóa + có chú thích
    const readyRow = screen.getByTestId('staff-order-row-2005');
    expect(within(readyRow).getByText('Sẵn sàng nhận')).toBeInTheDocument();
    expect(
      within(readyRow).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeEnabled();
    const readyCancelBtn = within(readyRow).getByRole('button', { name: 'Hủy đơn' });
    expect(readyCancelBtn).toBeDisabled();
    expect(readyCancelBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn đã sẵn sàng nhận, không thể hủy'
    );

    // PENDING: nút chuyển bước vẫn hiện nhưng bị xám + khóa + có chú thích; nút Hủy đơn bấm được
    const pendingRow = screen.getByTestId('staff-order-row-2004');
    expect(within(pendingRow).getByText('Chờ thanh toán')).toBeInTheDocument();
    const pendingAdvanceBtn = within(pendingRow).getByRole('button', {
      name: 'Chuyển sang bước tiếp theo',
    });
    expect(pendingAdvanceBtn).toBeDisabled();
    expect(pendingAdvanceBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn chưa thanh toán, chưa thể chuyển bước'
    );
    expect(within(pendingRow).getByRole('button', { name: 'Hủy đơn' })).toBeEnabled();

    // PAYMENT_FAILED: nút chuyển bước vẫn hiện nhưng bị xám + khóa; nút Hủy đơn bấm được
    const failedRow = screen.getByTestId('staff-order-row-2003');
    expect(within(failedRow).getByText('Thanh toán lỗi')).toBeInTheDocument();
    const failedAdvanceBtn = within(failedRow).getByRole('button', {
      name: 'Chuyển sang bước tiếp theo',
    });
    expect(failedAdvanceBtn).toBeDisabled();
    expect(failedAdvanceBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn thanh toán lỗi, chưa thể chuyển bước'
    );
    expect(within(failedRow).getByRole('button', { name: 'Hủy đơn' })).toBeEnabled();

    // COMPLETED & CANCELLED: cả nút chuyển bước lẫn nút hủy đều hiện nhưng bị xám + khóa + có chú thích
    const completedRow = screen.getByTestId('staff-order-row-2002');
    expect(within(completedRow).getByText('Hoàn thành')).toBeInTheDocument();
    expect(within(completedRow).getByRole('button', { name: 'Chi tiết' })).toBeEnabled();
    const completedAdvanceBtn = within(completedRow).getByRole('button', {
      name: 'Chuyển sang bước tiếp theo',
    });
    const completedCancelBtn = within(completedRow).getByRole('button', { name: 'Hủy đơn' });
    expect(completedAdvanceBtn).toBeDisabled();
    expect(completedAdvanceBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn đã hoàn thành, không thể chuyển bước'
    );
    expect(completedCancelBtn).toBeDisabled();
    expect(completedCancelBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn đã hoàn thành, không thể hủy'
    );

    const cancelledRow = screen.getByTestId('staff-order-row-2001');
    expect(within(cancelledRow).getByText('Đã hủy')).toBeInTheDocument();
    expect(within(cancelledRow).getByRole('button', { name: 'Chi tiết' })).toBeEnabled();
    const cancelledAdvanceBtn = within(cancelledRow).getByRole('button', {
      name: 'Chuyển sang bước tiếp theo',
    });
    const cancelledCancelBtn = within(cancelledRow).getByRole('button', { name: 'Hủy đơn' });
    expect(cancelledAdvanceBtn).toBeDisabled();
    expect(cancelledAdvanceBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn đã hủy, không thể chuyển bước'
    );
    expect(cancelledCancelBtn).toBeDisabled();
    expect(cancelledCancelBtn.parentElement).toHaveAttribute(
      'title',
      'Đơn đã hủy, không thể hủy lại'
    );

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
    expect(within(row).getByRole('button', { name: 'Hủy đơn' })).toBeDisabled();

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
      within(row).getByRole('button', { name: 'Chuyển sang bước tiếp theo' })
    ).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Hủy đơn' })).toBeDisabled();

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
    expect(within(row).getByRole('button', { name: 'Hủy đơn' })).toBeDisabled();

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

  it('10. Dòng 25 - Cố định 3 cột nút đều kích thước ở mọi dòng và nút xám không bấm được', async () => {
    const orders = cloneSeedOrders();
    const fetchMock = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, orders));
    globalThis.fetch = fetchMock;

    renderStaffOrdersPage();

    const paidActions = await screen.findByTestId('staff-order-actions-2007');
    const cancelledActions = screen.getByTestId('staff-order-actions-2001');

    // Mọi dòng dùng cùng khung grid 3 cột bằng nhau với chiều rộng cố định
    for (const actionGroup of [paidActions, cancelledActions]) {
      expect(actionGroup).toHaveClass('grid', 'grid-cols-3', 'w-[360px]');
      const buttons = within(actionGroup).getAllByRole('button');
      expect(buttons).toHaveLength(3);
      for (const btn of buttons) {
        expect(btn).toHaveClass('h-10', 'w-full');
      }
    }

    // Nút xám trên đơn đã hủy thật sự không bấm được (không gọi API, không mở dialog)
    const cancelledAdvance = within(cancelledActions).getByRole('button', {
      name: 'Chuyển sang bước tiếp theo',
    });
    const cancelledCancel = within(cancelledActions).getByRole('button', {
      name: 'Hủy đơn',
    });
    expect(cancelledAdvance).toHaveClass('bg-neutral-200/80', 'text-neutral-500');
    expect(cancelledCancel).toHaveClass('bg-neutral-200/80', 'text-neutral-500');

    fireEvent.click(cancelledAdvance);
    fireEvent.click(cancelledCancel);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Dòng 25 - Hàm thuần getStaffOrderActionStates (mục 5.7 & 5.8 hợp đồng)', () => {
  const cases: Array<{
    status: OrderStatus;
    advanceEnabled: boolean;
    nextStatus: string | null;
    advanceReason: string;
    cancelEnabled: boolean;
    cancelReason: string;
  }> = [
    {
      status: 'PENDING',
      advanceEnabled: false,
      nextStatus: null,
      advanceReason: 'Đơn chưa thanh toán, chưa thể chuyển bước',
      cancelEnabled: true,
      cancelReason: 'Hủy đơn hàng',
    },
    {
      status: 'PAYMENT_FAILED',
      advanceEnabled: false,
      nextStatus: null,
      advanceReason: 'Đơn thanh toán lỗi, chưa thể chuyển bước',
      cancelEnabled: true,
      cancelReason: 'Hủy đơn hàng',
    },
    {
      status: 'PAID',
      advanceEnabled: true,
      nextStatus: 'PREPARING',
      advanceReason: `Chuyển sang: ${ORDER_STATUS_LABELS.PREPARING}`,
      cancelEnabled: true,
      cancelReason: 'Hủy đơn đã thanh toán (hoàn tiền mô phỏng)',
    },
    {
      status: 'PREPARING',
      advanceEnabled: true,
      nextStatus: 'READY',
      advanceReason: `Chuyển sang: ${ORDER_STATUS_LABELS.READY}`,
      cancelEnabled: false,
      cancelReason: 'Đơn đã vào pha chế, không thể hủy',
    },
    {
      status: 'READY',
      advanceEnabled: true,
      nextStatus: 'COMPLETED',
      advanceReason: `Chuyển sang: ${ORDER_STATUS_LABELS.COMPLETED}`,
      cancelEnabled: false,
      cancelReason: 'Đơn đã sẵn sàng nhận, không thể hủy',
    },
    {
      status: 'COMPLETED',
      advanceEnabled: false,
      nextStatus: null,
      advanceReason: 'Đơn đã hoàn thành, không thể chuyển bước',
      cancelEnabled: false,
      cancelReason: 'Đơn đã hoàn thành, không thể hủy',
    },
    {
      status: 'CANCELLED',
      advanceEnabled: false,
      nextStatus: null,
      advanceReason: 'Đơn đã hủy, không thể chuyển bước',
      cancelEnabled: false,
      cancelReason: 'Đơn đã hủy, không thể hủy lại',
    },
  ];

  it.each(cases)(
    'Trạng thái $status trả về đúng quy tắc bật/tắt và chú thích cho cả 3 nút',
    ({
      status,
      advanceEnabled,
      nextStatus,
      advanceReason,
      cancelEnabled,
      cancelReason,
    }) => {
      const result = getStaffOrderActionStates(status);

      expect(result.detail).toEqual({
        enabled: true,
        reason: 'Xem chi tiết đơn hàng',
      });
      expect(result.advance).toEqual({
        enabled: advanceEnabled,
        nextStatus,
        reason: advanceReason,
      });
      expect(result.cancel).toEqual({
        enabled: cancelEnabled,
        reason: cancelReason,
      });
    }
  );
});

describe('Dòng 26 - Chi tiết tóm tiền, mã giảm giá và điểm ở /staff', () => {
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
    setStaffAuthSession('STAFF');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('1. Hàm getStaffOrderPaymentSummary đọc thẳng số liệu từ đơn và quyết định ẩn/hiện đúng quy tắc', () => {
    const baseOrder = cloneSeedOrders()[0];

    const withPromoAndPoints = getStaffOrderPaymentSummary({
      ...baseOrder,
      status: 'PAID',
      subtotalAmount: 100000,
      promotionCode: '  GIAM15K  ',
      discountAmount: 15000,
      pointsUsed: 10,
      pointsEarned: 7,
      totalAmount: 75000,
    });
    expect(withPromoAndPoints).toEqual({
      subtotalAmount: 100000,
      promotionCode: 'GIAM15K',
      showPromotionCode: true,
      discountAmount: 15000,
      showDiscount: true,
      pointsUsed: 10,
      showPointsUsed: true,
      pointsDiscountAmount: 10000,
      pointsEarned: 7,
      pointsEarnedLabel: '+7 điểm',
      totalAmount: 75000,
    });

    const unpaidOrder = getStaffOrderPaymentSummary({
      ...baseOrder,
      status: 'PENDING',
      subtotalAmount: 29000,
      promotionCode: null,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 0,
      totalAmount: 29000,
    });
    expect(unpaidOrder).toEqual({
      subtotalAmount: 29000,
      promotionCode: null,
      showPromotionCode: false,
      discountAmount: 0,
      showDiscount: false,
      pointsUsed: 0,
      showPointsUsed: false,
      pointsDiscountAmount: 0,
      pointsEarned: 0,
      pointsEarnedLabel: 'Chưa cộng',
      totalAmount: 29000,
    });

    const paidZeroPoints = getStaffOrderPaymentSummary({
      ...baseOrder,
      status: 'PAID',
      subtotalAmount: 5000,
      promotionCode: null,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 0,
      totalAmount: 5000,
    });
    expect(paidZeroPoints.pointsEarnedLabel).toBe('0 điểm');

    // Dữ liệu cũ thiếu trường (undefined/null) không gây lỗi và fallback subtotalAmount = totalAmount
    const legacyOrder = getStaffOrderPaymentSummary({
      id: baseOrder.id,
      orderNumber: 1999,
      status: 'COMPLETED',
      receiveType: 'AT_COUNTER',
      totalAmount: 45000,
      createdAt: baseOrder.createdAt,
      items: baseOrder.items,
    } as Partial<OrderResponse>);
    expect(legacyOrder).toEqual({
      subtotalAmount: 45000,
      promotionCode: null,
      showPromotionCode: false,
      discountAmount: 0,
      showDiscount: false,
      pointsUsed: 0,
      showPointsUsed: false,
      pointsDiscountAmount: 0,
      pointsEarned: 0,
      pointsEarnedLabel: '0 điểm',
      totalAmount: 45000,
    });
  });

  it('2. Chi tiết đơn có mã giảm giá + dùng điểm hiển thị đủ khối tóm tiền chỉ-xem', async () => {
    const user = userEvent.setup();
    const baseOrder = cloneSeedOrders()[0];
    const discountedOrder: OrderResponse = {
      ...baseOrder,
      orderNumber: 2010,
      status: 'PAID',
      subtotalAmount: 100000,
      promotionCode: 'BREW15',
      discountAmount: 15000,
      pointsUsed: 10,
      pointsEarned: 7,
      totalAmount: 75000,
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, [discountedOrder]));

    renderStaffOrdersPage();
    const row = await screen.findByTestId('staff-order-row-2010');
    await user.click(row);

    const summaryBox = await screen.findByTestId('staff-order-summary-2010');
    expect(within(summaryBox).getByText('Tạm tính')).toBeInTheDocument();
    expect(within(summaryBox).getByText('100.000đ')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Mã giảm giá')).toBeInTheDocument();
    expect(within(summaryBox).getByText('BREW15')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Giảm giá')).toBeInTheDocument();
    expect(within(summaryBox).getByText('-15.000đ')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Điểm đã dùng')).toBeInTheDocument();
    expect(within(summaryBox).getByText('10 điểm (-10.000đ)')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Điểm đã cộng')).toBeInTheDocument();
    expect(within(summaryBox).getByText('+7 điểm')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Tổng thanh toán')).toBeInTheDocument();
    expect(within(summaryBox).getByText('75.000đ')).toBeInTheDocument();

    // Chỉ xem: không có nút hay ô nhập nào trong khối tóm tiền
    expect(within(summaryBox).queryAllByRole('button')).toHaveLength(0);
    expect(within(summaryBox).queryAllByRole('textbox')).toHaveLength(0);
  });

  it('3. Chi tiết đơn không dùng mã/điểm và đơn cũ thiếu trường xử lý ẩn dòng và hiển thị an toàn', async () => {
    const user = userEvent.setup();
    const seed = cloneSeedOrders();
    const pendingOrder: OrderResponse = {
      ...seed.find((o) => o.status === 'PENDING')!,
      orderNumber: 2011,
      subtotalAmount: 29000,
      promotionCode: null,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 0,
      totalAmount: 29000,
    };
    const legacyOrder = {
      ...seed.find((o) => o.status === 'COMPLETED')!,
      orderNumber: 2012,
      totalAmount: 60000,
      subtotalAmount: undefined,
      promotionCode: undefined,
      discountAmount: undefined,
      pointsUsed: undefined,
      pointsEarned: undefined,
    } as unknown as OrderResponse;

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, [pendingOrder, legacyOrder]));

    renderStaffOrdersPage();

    // Đơn PENDING chưa thanh toán
    await user.click(await screen.findByTestId('staff-order-row-2011'));
    const pendingSummary = await screen.findByTestId('staff-order-summary-2011');
    expect(within(pendingSummary).getByText('Tạm tính')).toBeInTheDocument();
    expect(within(pendingSummary).queryByText('Mã giảm giá')).not.toBeInTheDocument();
    expect(within(pendingSummary).queryByText('Giảm giá')).not.toBeInTheDocument();
    expect(within(pendingSummary).queryByText('Điểm đã dùng')).not.toBeInTheDocument();
    expect(within(pendingSummary).getByText('Chưa cộng')).toBeInTheDocument();
    expect(within(pendingSummary).getByText('Tổng thanh toán')).toBeInTheDocument();
    expect(within(pendingSummary).getAllByText('29.000đ')).toHaveLength(2);

    // Đơn cũ thiếu trường
    await user.click(screen.getByTestId('staff-order-row-2012'));
    const legacySummary = await screen.findByTestId('staff-order-summary-2012');
    expect(within(legacySummary).queryByText('Mã giảm giá')).not.toBeInTheDocument();
    expect(within(legacySummary).queryByText('Giảm giá')).not.toBeInTheDocument();
    expect(within(legacySummary).queryByText('Điểm đã dùng')).not.toBeInTheDocument();
    expect(within(legacySummary).getByText('0 điểm')).toBeInTheDocument();
    expect(within(legacySummary).getAllByText('60.000đ')).toHaveLength(2);
  });
});

