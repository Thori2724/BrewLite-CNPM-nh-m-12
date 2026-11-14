import React from 'react';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OrderDetailPage from '../app/orders/[id]/page';
import OrdersHistoryPage from '../app/orders/page';
import { AuthProvider } from '../context/AuthContext';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import { PENDING_ORDER_STORAGE_KEY } from '../utils/checkout';
import {
  ORDER_STATUS_LABELS,
  RECEIVE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatVietnamDateTime,
  getOrderStatusBadgeClass,
  summarizeOrderItems,
} from '../services/order-contract';
import { MOCK_SEED_ORDERS } from '../mocks/mock-orders';
import * as ordersService from '../services/orders';
import * as navigation from 'next/navigation';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockParams: Record<string, string> = { id: '33333333-0000-0000-0000-000000000001' };

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  useParams: vi.fn(() => mockParams),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('../services/orders', async () => {
  const actual = await vi.importActual<typeof import('../services/orders')>('../services/orders');
  return {
    ...actual,
    createOrderApi: vi.fn(),
    payOrderApi: vi.fn(),
    getOrderByIdApi: vi.fn(),
    getMyOrdersApi: vi.fn(),
  };
});

const loggedInSession = {
  token: 'mock-jwt-token-orders',
  user: {
    id: '99999999-0000-0000-0000-000000000001',
    email: 'nguyenan@gmail.com',
    displayName: 'Nguyễn Văn An',
    role: 'CUSTOMER' as const,
  },
};

describe('Task 18 - Bảng nhãn tiếng Việt & Tiện ích định dạng đơn hàng', () => {
  it('1. Bảng ánh xạ nhãn đủ 7 trạng thái đơn, hình thức nhận, hình thức thanh toán và trạng thái thanh toán', () => {
    // 7 trạng thái đơn hàng (OrderStatus) theo mục 7 của hợp đồng
    expect(ORDER_STATUS_LABELS).toEqual({
      PENDING: 'Chờ thanh toán',
      PAID: 'Đã thanh toán',
      PREPARING: 'Đang pha chế',
      READY: 'Sẵn sàng nhận',
      COMPLETED: 'Hoàn thành',
      PAYMENT_FAILED: 'Thanh toán lỗi',
      CANCELLED: 'Đã hủy',
    });

    // 2 hình thức nhận hàng (ReceiveType)
    expect(RECEIVE_TYPE_LABELS).toEqual({
      AT_COUNTER: 'Tại quầy',
      TAKE_AWAY: 'Mang đi',
    });

    // 2 hình thức thanh toán (PaymentMethod)
    expect(PAYMENT_METHOD_LABELS).toEqual({
      WALLET: 'Ví điện tử (ZaloPay/Momo)',
      CARD: 'Thẻ ngân hàng',
    });

    // 3 trạng thái thanh toán (PaymentStatus)
    expect(PAYMENT_STATUS_LABELS).toEqual({
      SUCCESS: 'Thành công',
      FAILED: 'Thất bại',
      PENDING: 'Đang xử lý',
    });
  });

  it('2. Định dạng thời gian giờ Việt Nam (UTC+7) dd/MM/yyyy HH:mm và tóm tắt danh sách món', () => {
    // 2026-11-05T03:00:00.000Z (UTC) -> 10:00 ngày 05/11/2026 (UTC+7)
    expect(formatVietnamDateTime('2026-11-05T03:00:00.000Z')).toBe('05/11/2026 10:00');

    // Tóm tắt 2 món
    expect(
      summarizeOrderItems([
        {
          productId: 'p1',
          productName: 'Trà sữa truyền thống',
          quantity: 2,
          unitPrice: 53000,
          lineTotal: 106000,
        },
        {
          productId: 'p2',
          productName: 'Bánh Croissant',
          quantity: 1,
          unitPrice: 30000,
          lineTotal: 30000,
        },
      ])
    ).toBe('Trà sữa truyền thống x2, Bánh Croissant x1');

    // Tóm tắt > 2 món rút gọn "... và N món khác"
    expect(
      summarizeOrderItems([
        { productId: 'p1', productName: 'Món A', quantity: 1, unitPrice: 10000, lineTotal: 10000 },
        { productId: 'p2', productName: 'Món B', quantity: 2, unitPrice: 10000, lineTotal: 20000 },
        { productId: 'p3', productName: 'Món C', quantity: 1, unitPrice: 10000, lineTotal: 10000 },
        { productId: 'p4', productName: 'Món D', quantity: 1, unitPrice: 10000, lineTotal: 10000 },
      ])
    ).toBe('Món A x1, Món B x2 ... và 2 món khác');
  });
});

describe('Task 18 - Trang chi tiết & theo dõi đơn hàng (/orders/[id])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockParams = { id: '33333333-0000-0000-0000-000000000001' };

    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    vi.mocked(navigation.useParams).mockImplementation(() => mockParams);
  });

  afterEach(() => {
    cleanup();
  });

  const renderOrderDetail = () =>
    render(
      <AuthProvider>
        <OrderDetailPage />
      </AuthProvider>
    );

  it('3. Hiển thị đúng với đơn PAID: banner "Đặt hàng thành công", mã đơn #1001, stepper, món bánh ẩn size/đường/đá, tổng tiền 136.000đ, lịch sử thanh toán không hiện amount', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    const paidOrder = MOCK_SEED_ORDERS[0]; // Đơn #1001 PAID (Trà sữa truyền thống + Bánh Croissant)
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(paidOrder);

    renderOrderDetail();

    // Banner thành công & Mã đơn #1001 (không hiển thị UUID id)
    expect(await screen.findByText('Đặt hàng thành công')).toBeInTheDocument();
    expect(screen.getByTestId('order-number-heading')).toHaveTextContent('#1001');
    expect(screen.queryByText(paidOrder.id)).not.toBeInTheDocument();

    // Badge trạng thái & Stepper tiến trình hiển thị
    expect(screen.getByTestId('order-status-badge')).toHaveTextContent('Đã thanh toán');
    expect(screen.getByTestId('order-progress-stepper')).toBeInTheDocument();

    // Dòng 0 (Món nước Trà sữa truyền thống): hiện đầy đủ Size M, Đường 70%, Đá vừa, Topping
    const drinkRow = screen.getByTestId('order-item-row-0');
    expect(within(drinkRow).getByText('Trà sữa truyền thống')).toBeInTheDocument();
    expect(within(drinkRow).getByText(/Size M/i)).toBeInTheDocument();
    expect(within(drinkRow).getByText('70%')).toBeInTheDocument();
    expect(within(drinkRow).getByText('Đá vừa')).toBeInTheDocument();
    expect(within(drinkRow).getByText(/Trân châu đen/i)).toBeInTheDocument();

    // Dòng 1 (Món bánh Bánh Croissant có size/sugarLevel/iceLevel = null): ẩn hoàn toàn Size/Đường/Đá
    const cakeRow = screen.getByTestId('order-item-row-1');
    expect(within(cakeRow).getByText('Bánh Croissant')).toBeInTheDocument();
    expect(within(cakeRow).queryByText(/Kích cỡ:/i)).not.toBeInTheDocument();
    expect(within(cakeRow).queryByText(/Đường:/i)).not.toBeInTheDocument();
    expect(within(cakeRow).queryByText(/Đá:/i)).not.toBeInTheDocument();

    // Tổng tiền đơn hàng nguyên vẹn từ server: 136.000đ
    expect(screen.getByTestId('order-total-amount')).toHaveTextContent('136.000đ');

    // Lịch sử thanh toán: hiện Ví điện tử (ZaloPay/Momo), •••• 4321, Thành công
    const paymentItem = screen.getByTestId('payment-history-item');
    expect(within(paymentItem).getByText('Ví điện tử (ZaloPay/Momo)')).toBeInTheDocument();
    expect(within(paymentItem).getByText('•••• 4321')).toBeInTheDocument();
    expect(within(paymentItem).getByText('Thành công')).toBeInTheDocument();

    // Đơn PAID không hiện nút thử lại thanh toán và không có nút Hủy đơn
    expect(screen.queryByRole('button', { name: /thanh toán/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hủy đơn/i })).not.toBeInTheDocument();
  });

  it('4. Đơn PAYMENT_FAILED: ẩn stepper, hiện lý do lỗi, bấm "Thử lại thanh toán" lưu đúng orderId kèm Idempotency-Key MỚI và chuyển về /checkout', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    const failedOrder = MOCK_SEED_ORDERS[2]; // Đơn #1003 PAYMENT_FAILED
    mockParams = { id: failedOrder.id };
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(failedOrder);

    renderOrderDetail();

    expect(await screen.findByText('Thanh toán không thành công')).toBeInTheDocument();
    expect(screen.getByTestId('banner-failure-reason')).toHaveTextContent(
      'Giao dịch bị từ chối (mô phỏng)'
    );

    // Không vẽ stepper tiến trình khi PAYMENT_FAILED
    expect(screen.queryByTestId('order-progress-stepper')).not.toBeInTheDocument();

    // Bấm nút "Thử lại thanh toán"
    const retryBtn = screen.getByRole('button', { name: 'Thử lại thanh toán' });
    await user.click(retryBtn);

    // Đã lưu đúng orderId kèm Idempotency-Key mới vào localStorage và chuyển sang /checkout
    const storedPendingRaw = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    expect(storedPendingRaw).not.toBeNull();
    const storedPending = JSON.parse(storedPendingRaw!);
    expect(storedPending.orderId).toBe(failedOrder.id);
    expect(storedPending.orderNumber).toBe(1003);
    expect(storedPending.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(mockPush).toHaveBeenCalledWith(
      `/checkout?orderId=${encodeURIComponent(failedOrder.id)}`
    );
  });

  it('5. Trạng thái 404: Hiển thị màn hình "Không tìm thấy đơn hàng" và nút về lịch sử đơn', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    mockParams = { id: 'non-existent-id' };
    vi.mocked(ordersService.getOrderByIdApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Không tìm thấy đơn hàng.')
    );

    renderOrderDetail();

    expect(await screen.findByTestId('order-not-found')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy đơn hàng')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /về lịch sử đơn hàng/i })).toHaveAttribute(
      'href',
      '/orders'
    );
  });

  it('6. Chưa có token trong trình duyệt: chuyển về đăng nhập ngay, KHÔNG gọi API GET /orders/:id', async () => {
    window.history.pushState({}, '', '/orders/33333333-0000-0000-0000-000000000001');
    renderOrderDetail();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/login?redirect=%2Forders%2F33333333-0000-0000-0000-000000000001'
      );
    });
    expect(ordersService.getOrderByIdApi).not.toHaveBeenCalled();
  });
});

describe('Task 18 - Trang lịch sử đơn hàng (/orders)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

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
    cleanup();
  });

  const renderOrdersHistory = () =>
    render(
      <AuthProvider>
        <OrdersHistoryPage />
      </AuthProvider>
    );

  it('7. Trạng thái empty: Hiển thị "Bạn chưa có đơn hàng nào" và nút "Xem menu"', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce([]);

    renderOrdersHistory();

    expect(await screen.findByTestId('orders-history-empty')).toBeInTheDocument();
    expect(screen.getByText('Bạn chưa có đơn hàng nào')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem menu' })).toHaveAttribute('href', '/');
  });

  it('8. Danh sách có dữ liệu: Hiển thị đúng thứ tự server trả về, đủ #orderNumber, nhãn tiếng Việt, tóm tắt món và link tới /orders/[id]', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    // Giả lập server trả về [1004, 1003, 1002, 1001]
    const serverSortedOrders = [...MOCK_SEED_ORDERS].reverse();
    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce(serverSortedOrders);

    renderOrdersHistory();

    const card1001 = await screen.findByTestId('order-card-1001');
    const card1003 = screen.getByTestId('order-card-1003');
    const card1004 = screen.getByTestId('order-card-1004');

    expect(within(card1001).getByRole('link', { name: /chi tiết/i })).toHaveAttribute(
      'href',
      `/orders/${MOCK_SEED_ORDERS[0].id}`
    );
    expect(within(card1001).getByText('#1001')).toBeInTheDocument();
    expect(within(card1001).getByText('Đã thanh toán')).toBeInTheDocument();
    expect(within(card1001).getByText('Mang đi')).toBeInTheDocument();
    expect(
      within(card1001).getByText('Trà sữa truyền thống x2, Bánh Croissant x1')
    ).toBeInTheDocument();
    expect(within(card1001).getByText('136.000đ')).toBeInTheDocument();

    expect(within(card1003).getByText('Thanh toán lỗi')).toBeInTheDocument();
    expect(within(card1004).getByText('Sẵn sàng nhận')).toBeInTheDocument();
  });
});

describe('Task 13 - Nút Thanh toán cho PENDING/PAYMENT_FAILED & Nhãn Đã hủy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockParams = { id: '33333333-0000-0000-0000-000000000001' };

    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    vi.mocked(navigation.useParams).mockImplementation(() => mockParams);
  });

  afterEach(() => {
    cleanup();
  });

  it('9. Trang /orders phủ cả 7 trạng thái: nút Thanh toán CHỈ hiện cho PENDING và PAYMENT_FAILED với link /checkout?orderId=<id>, CANCELLED có nhãn Đã hủy, màu riêng và vẫn xem chi tiết được', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    const allSevenOrders = [...MOCK_SEED_ORDERS].reverse();
    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce(allSevenOrders);

    render(
      <AuthProvider>
        <OrdersHistoryPage />
      </AuthProvider>
    );

    const cancelledCard = await screen.findByTestId('order-card-1007');
    expect(cancelledCard).toBeInTheDocument();

    for (const order of allSevenOrders) {
      const card = screen.getByTestId(`order-card-${order.orderNumber}`);
      const expectedLabel = ORDER_STATUS_LABELS[order.status];
      const badge = within(card).getByText(expectedLabel);
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain(getOrderStatusBadgeClass(order.status));

      const detailLink = within(card).getByRole('link', { name: /chi tiết/i });
      expect(detailLink).toHaveAttribute('href', `/orders/${order.id}`);

      if (order.status === 'PENDING' || order.status === 'PAYMENT_FAILED') {
        const payLink = within(card).getByRole('link', { name: 'Thanh toán' });
        expect(payLink).toHaveAttribute(
          'href',
          `/checkout?orderId=${encodeURIComponent(order.id)}`
        );
      } else {
        expect(within(card).queryByRole('link', { name: 'Thanh toán' })).not.toBeInTheDocument();
        expect(within(card).queryByRole('button', { name: /thanh toán/i })).not.toBeInTheDocument();
        expect(
          within(card)
            .getAllByRole('link')
            .some((link) => link.getAttribute('href')?.startsWith('/checkout'))
        ).toBe(false);
      }
    }

    const cancelledBadge = within(cancelledCard).getByText('Đã hủy');
    const failedCard = screen.getByTestId('order-card-1003');
    const failedBadge = within(failedCard).getByText('Thanh toán lỗi');
    expect(getOrderStatusBadgeClass('CANCELLED')).not.toBe(
      getOrderStatusBadgeClass('PAYMENT_FAILED')
    );
    expect(cancelledBadge.className).not.toBe(failedBadge.className);

    // Nút Thanh toán ở /orders là <Link> thuần: không tự ghi localStorage hay gọi API đặt/thanh toán
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(ordersService.createOrderApi).not.toHaveBeenCalled();
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();
  });

  it('10. Trang /orders/[id] phủ cả 7 trạng thái: nút thanh toán CHỈ hiện cho PENDING và PAYMENT_FAILED, CANCELLED hiển thị Đã hủy với badge riêng và đầy đủ chi tiết', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));

    for (const order of MOCK_SEED_ORDERS) {
      mockParams = { id: order.id };
      vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(order);

      const { unmount } = render(
        <AuthProvider>
          <OrderDetailPage />
        </AuthProvider>
      );

      const heading = await screen.findByTestId('order-number-heading');
      expect(heading).toHaveTextContent(`#${order.orderNumber}`);

      const badge = screen.getByTestId('order-status-badge');
      expect(badge).toHaveTextContent(ORDER_STATUS_LABELS[order.status]);
      expect(badge.className).toContain(getOrderStatusBadgeClass(order.status));

      if (order.status === 'PENDING' || order.status === 'PAYMENT_FAILED') {
        const expectedBtnLabel =
          order.status === 'PAYMENT_FAILED' ? 'Thử lại thanh toán' : 'Thanh toán đơn hàng';
        const payBtn = screen.getByRole('button', { name: expectedBtnLabel });
        expect(payBtn).toBeInTheDocument();

        await user.click(payBtn);
        expect(mockPush).toHaveBeenCalledWith(
          `/checkout?orderId=${encodeURIComponent(order.id)}`
        );
      } else {
        expect(screen.queryByRole('button', { name: /thanh toán/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /thanh toán/i })).not.toBeInTheDocument();
      }

      if (order.status === 'CANCELLED') {
        expect(screen.queryByTestId('order-progress-stepper')).not.toBeInTheDocument();
        expect(screen.getByTestId('order-total-amount')).toHaveTextContent('30.000đ');
        expect(screen.getByRole('link', { name: 'Xem lịch sử đơn' })).toHaveAttribute(
          'href',
          '/orders'
        );
      }

      unmount();
      cleanup();
    }

    expect(ordersService.createOrderApi).not.toHaveBeenCalled();
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();
  });

  it('11. Trang /orders/[id]: handleRetryPayment chỉ giữ createdFromCart khi localStorage đang lưu pendingOrder trùng order.id', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));

    const pendingOrderData = MOCK_SEED_ORDERS[1]; // #1002 PENDING
    mockParams = { id: pendingOrderData.id };

    // Trường hợp 1: trùng order.id và có createdFromCart: true -> giữ lại createdFromCart: true kèm key mới
    localStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify({
        orderId: pendingOrderData.id,
        orderNumber: pendingOrderData.orderNumber,
        totalAmount: pendingOrderData.totalAmount,
        receiveType: pendingOrderData.receiveType,
        idempotencyKey: 'old-key-same-order',
        createdAt: pendingOrderData.createdAt,
        itemCount: 1,
        createdFromCart: true,
      })
    );
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(pendingOrderData);

    const firstRender = render(
      <AuthProvider>
        <OrderDetailPage />
      </AuthProvider>
    );

    const payBtn1 = await screen.findByRole('button', { name: 'Thanh toán đơn hàng' });
    await user.click(payBtn1);

    const savedSame = JSON.parse(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)!);
    expect(savedSame.orderId).toBe(pendingOrderData.id);
    expect(savedSame.idempotencyKey).not.toBe('old-key-same-order');
    expect(savedSame.createdFromCart).toBe(true);
    firstRender.unmount();
    cleanup();

    // Trường hợp 2: localStorage đang lưu pendingOrder KHÁC order.id -> KHÔNG đặt createdFromCart
    localStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify({
        orderId: 'another-order-id',
        orderNumber: 9999,
        totalAmount: 50000,
        receiveType: 'AT_COUNTER',
        idempotencyKey: 'other-order-key',
        createdAt: '2026-11-05T00:00:00.000Z',
        itemCount: 1,
        createdFromCart: true,
      })
    );
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(pendingOrderData);

    render(
      <AuthProvider>
        <OrderDetailPage />
      </AuthProvider>
    );

    const payBtn2 = await screen.findByRole('button', { name: 'Thanh toán đơn hàng' });
    await user.click(payBtn2);

    const savedDiff = JSON.parse(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)!);
    expect(savedDiff.orderId).toBe(pendingOrderData.id);
    expect(savedDiff.createdFromCart).toBeUndefined();
  });
});

