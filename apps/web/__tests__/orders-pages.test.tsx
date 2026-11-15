import React from 'react';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OrderDetailPage from '../app/orders/[id]/page';
import OrdersHistoryPage from '../app/orders/page';
import { AuthProvider } from '../context/AuthContext';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import { CART_STORAGE_KEY } from '../utils/cart';
import { PENDING_ORDER_STORAGE_KEY } from '../utils/checkout';
import { ApiHttpError } from '../services/auth-contract';
import {
  ORDER_STATUS_LABELS,
  RECEIVE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatVietnamDateTime,
  getOrderStatusBadgeClass,
  summarizeOrderItems,
  type OrderResponse,
  type OrderStatus,
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
    cancelOrderApi: vi.fn(),
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

    // Đơn PAID không hiện nút thử lại thanh toán nhưng CÓ nút Hủy đơn (Task 14)
    expect(screen.queryByRole('button', { name: /thanh toán/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
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

describe('Task 14 - Hủy đơn hàng phía khách hàng (/orders và /orders/[id])', () => {
  const cloneOrder = (base: OrderResponse, overrides: Partial<OrderResponse> = {}): OrderResponse => ({
    ...base,
    items: (base.items ?? []).map((item) => ({
      ...item,
      toppings: item.toppings?.map((t) => ({ ...t })) ?? [],
    })),
    payments: base.payments?.map((p) => ({ ...p })) ?? [],
    ...overrides,
  });

  const sampleCartJson = JSON.stringify([
    {
      id: 'cart-keep-1',
      productId: 'prod-1',
      name: 'Cà phê sữa đá',
      unitPrice: 29000,
      quantity: 2,
      toppings: [],
      note: '',
    },
  ]);

  function renderOrdersListPage() {
    return render(
      <AuthProvider>
        <OrdersHistoryPage />
      </AuthProvider>
    );
  }

  function renderOrderDetailPage() {
    return render(
      <AuthProvider>
        <OrderDetailPage />
      </AuthProvider>
    );
  }

  const makePendingSnapshot = (order: OrderResponse) =>
    JSON.stringify({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      receiveType: order.receiveType,
      idempotencyKey: `idem-${order.id}`,
      method: 'WALLET',
      createdAt: '2026-11-10T10:00:00.000Z',
      itemCount: 1,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ordersService.createOrderApi).mockReset();
    vi.mocked(ordersService.payOrderApi).mockReset();
    vi.mocked(ordersService.getOrderByIdApi).mockReset();
    vi.mocked(ordersService.getMyOrdersApi).mockReset();
    vi.mocked(ordersService.cancelOrderApi).mockReset();
    localStorage.clear();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    mockParams = { id: MOCK_SEED_ORDERS[1].id };
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('12. Trên /orders, nút "Hủy đơn" chỉ hiện cho PENDING, PAYMENT_FAILED, PAID; không hiện cho 4 trạng thái còn lại và đơn CANCELLED vẫn xem chi tiết được', async () => {
    const allStatusOrders = [
      cloneOrder(MOCK_SEED_ORDERS[0]), // #1001 PAID
      cloneOrder(MOCK_SEED_ORDERS[1]), // #1002 PENDING
      cloneOrder(MOCK_SEED_ORDERS[2]), // #1003 PAYMENT_FAILED
      cloneOrder(MOCK_SEED_ORDERS[3]), // #1004 READY
      cloneOrder(MOCK_SEED_ORDERS[4]), // #1005 PREPARING
      cloneOrder(MOCK_SEED_ORDERS[5]), // #1006 COMPLETED
      cloneOrder(MOCK_SEED_ORDERS[6]), // #1007 CANCELLED
    ];
    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce(allStatusOrders);

    renderOrdersListPage();

    expect(await screen.findByText('#1001')).toBeInTheDocument();
    expect(screen.getByText('#1007')).toBeInTheDocument();

    // Chỉ đúng 3 đơn PENDING (#1002), PAYMENT_FAILED (#1003), PAID (#1001) có nút Hủy đơn
    const cancelButtons = screen.getAllByRole('button', { name: 'Hủy đơn' });
    expect(cancelButtons).toHaveLength(3);

    // Đơn CANCELLED vẫn nằm trong danh sách và có link Chi tiết tới đúng /orders/[id]
    const detailLinks = screen.getAllByRole('link', { name: /chi tiết/i });
    const cancelledLink = detailLinks.find(
      (link) => link.getAttribute('href') === `/orders/${MOCK_SEED_ORDERS[6].id}`
    );
    expect(cancelledLink).toBeDefined();
  });

  it.each<[OrderStatus, boolean]>([
    ['PENDING', true],
    ['PAYMENT_FAILED', true],
    ['PAID', true],
    ['PREPARING', false],
    ['READY', false],
    ['COMPLETED', false],
    ['CANCELLED', false],
  ])('13. Trên cả /orders và /orders/[id], trạng thái %s -> hiện nút Hủy đơn = %s', async (status, shouldShow) => {
    const order = cloneOrder(MOCK_SEED_ORDERS[1], {
      id: `order-status-${status}`,
      orderNumber: 2001,
      status,
      payments: status === 'PAID' ? cloneOrder(MOCK_SEED_ORDERS[0]).payments : [],
    });

    // Kiểm tra /orders với 1 đơn ở trạng thái tương ứng
    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce([order]);
    const listView = renderOrdersListPage();
    expect(await screen.findByText('#2001')).toBeInTheDocument();

    if (shouldShow) {
      expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    }
    listView.unmount();

    // Kiểm tra /orders/[id] với cùng đơn đó
    mockParams = { id: order.id };
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(order);
    renderOrderDetailPage();
    expect(await screen.findByTestId('order-number-heading')).toHaveTextContent('#2001');

    if (shouldShow) {
      expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    }
  });

  it('14. Bấm "Hủy đơn" chỉ mở hộp xác nhận (có thông tin hoàn tiền mô phỏng với đơn PAID), CHƯA gọi API; "Giữ đơn", phím Esc và bấm nền ngoài đóng hộp không gọi API', async () => {
    const user = userEvent.setup();
    const paidOrder = cloneOrder(MOCK_SEED_ORDERS[0]); // #1001 PAID
    mockParams = { id: paidOrder.id };
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(paidOrder);

    renderOrderDetailPage();

    const cancelPageBtn = await screen.findByRole('button', { name: 'Hủy đơn' });
    await user.click(cancelPageBtn);

    // Mở dialog đúng chuẩn a11y, chưa gọi cancelOrderApi
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Hủy đơn #1001?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/tiền sẽ được hoàn lại \(mô phỏng\)/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Giữ đơn' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Xác nhận hủy' })).toBeInTheDocument();
    expect(ordersService.cancelOrderApi).not.toHaveBeenCalled();

    // Bấm "Giữ đơn" -> đóng hộp, không gọi API
    await user.click(within(dialog).getByRole('button', { name: 'Giữ đơn' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ordersService.cancelOrderApi).not.toHaveBeenCalled();

    // Mở lại và bấm Esc -> đóng hộp, không gọi API
    await user.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ordersService.cancelOrderApi).not.toHaveBeenCalled();

    // Mở lại và bấm nền ngoài -> đóng hộp, không gọi API
    await user.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ordersService.cancelOrderApi).not.toHaveBeenCalled();
  });

  it('15. Bấm "Xác nhận hủy" gọi cancelOrderApi đúng 1 lần, khóa các nút và hiện "Đang hủy..." khi đang xử lý (chống bấm đúp)', async () => {
    const user = userEvent.setup();
    const pendingOrder = cloneOrder(MOCK_SEED_ORDERS[1]); // #1002 PENDING
    mockParams = { id: pendingOrder.id };

    let resolveCancel!: (value: OrderResponse) => void;
    const cancelDeferred = new Promise<OrderResponse>((resolve) => {
      resolveCancel = resolve;
    });

    const cancelledOrder = cloneOrder(pendingOrder, { status: 'CANCELLED' });
    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(pendingOrder)
      .mockResolvedValueOnce(cancelledOrder);
    vi.mocked(ordersService.cancelOrderApi).mockReturnValueOnce(cancelDeferred);

    renderOrderDetailPage();

    const pageCancelBtn = await screen.findByRole('button', { name: 'Hủy đơn' });
    await user.click(pageCancelBtn);

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Xác nhận hủy' });
    const keepBtn = within(dialog).getByRole('button', { name: 'Giữ đơn' });

    await user.click(confirmBtn);

    // Đang xử lý: gọi đúng 1 lần chỉ với orderId (không truyền body), khóa nút trong hộp & ngoài trang
    expect(ordersService.cancelOrderApi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ordersService.cancelOrderApi).mock.calls[0]).toEqual([pendingOrder.id]);
    const processingButtons = screen.getAllByRole('button', { name: 'Đang hủy...' });
    expect(processingButtons).toHaveLength(2);
    processingButtons.forEach((btn) => expect(btn).toBeDisabled());
    expect(keepBtn).toBeDisabled();

    // Bấm đúp hoặc bấm Esc/nền ngoài khi đang hủy cũng không gọi thêm hay đóng hộp
    await user.click(within(dialog).getByRole('button', { name: 'Đang hủy...' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(ordersService.cancelOrderApi).toHaveBeenCalledTimes(1);

    // Hoàn tất
    resolveCancel(cancelledOrder);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('16. Hủy đơn PENDING trên /orders thành công: cập nhật nhãn "Đã hủy" (huy hiệu xám), ẩn nút Thanh toán & Hủy đơn, xóa brewlite_pending_order_v2 khớp id và giữ nguyên giỏ hàng', async () => {
    const user = userEvent.setup();
    const pendingOrder = cloneOrder(MOCK_SEED_ORDERS[1]); // #1002 PENDING
    const cancelledFromPending = cloneOrder(pendingOrder, { status: 'CANCELLED' });

    localStorage.setItem(CART_STORAGE_KEY, sampleCartJson);
    localStorage.setItem(PENDING_ORDER_STORAGE_KEY, makePendingSnapshot(pendingOrder));

    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce([pendingOrder]);
    vi.mocked(ordersService.cancelOrderApi).mockResolvedValueOnce(cancelledFromPending);

    renderOrdersListPage();

    expect(await screen.findByText('#1002')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thanh toán' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const cancelledBadge = screen.getByText('Đã hủy');
    expect(cancelledBadge).toBeInTheDocument();
    expect(cancelledBadge.className).toContain(getOrderStatusBadgeClass('CANCELLED'));
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Thanh toán' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã hủy đơn #1002.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /chi tiết/i })).toHaveAttribute(
      'href',
      `/orders/${pendingOrder.id}`
    );

    // Trang danh sách KHÔNG hiện dòng hoàn tiền mô phỏng
    expect(screen.queryByText(/tiền sẽ được hoàn lại \(mô phỏng\)/i)).not.toBeInTheDocument();

    // Đã xóa pending order khớp id, NHƯNG giỏ hàng vẫn giữ nguyên hoàn toàn
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(sampleCartJson);
  });

  it('17. Trên /orders, hủy một đơn PAID khác với brewlite_pending_order_v2 thì KHÔNG xóa pending order của đơn kia và KHÔNG hiện dòng hoàn tiền', async () => {
    const user = userEvent.setup();
    const paidOrder = cloneOrder(MOCK_SEED_ORDERS[0]); // #1001 PAID
    const cancelledPaid = cloneOrder(paidOrder, { status: 'CANCELLED', payments: [] });
    const otherPendingSnapshot = makePendingSnapshot(MOCK_SEED_ORDERS[1]);

    localStorage.setItem(CART_STORAGE_KEY, sampleCartJson);
    localStorage.setItem(PENDING_ORDER_STORAGE_KEY, otherPendingSnapshot);

    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce([paidOrder]);
    vi.mocked(ordersService.cancelOrderApi).mockResolvedValueOnce(cancelledPaid);

    renderOrdersListPage();

    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.getByText('Đã hủy đơn #1001.')).toBeInTheDocument();
    });

    expect(screen.queryByText(/tiền sẽ được hoàn lại \(mô phỏng\)/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBe(otherPendingSnapshot);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(sampleCartJson);
  });

  it('18. Trang chi tiết /orders/[id]: hủy đơn PENDING và PAYMENT_FAILED thành công -> KHÔNG hiện dòng hoàn tiền mô phỏng, ẩn stepper & thanh toán', async () => {
    const user = userEvent.setup();

    // (a) PENDING -> CANCELLED (không có payment SUCCESS)
    const pendingOrder = cloneOrder(MOCK_SEED_ORDERS[1]);
    const cancelledPending = cloneOrder(pendingOrder, { status: 'CANCELLED', payments: [] });
    mockParams = { id: pendingOrder.id };
    localStorage.setItem(CART_STORAGE_KEY, sampleCartJson);
    localStorage.setItem(PENDING_ORDER_STORAGE_KEY, makePendingSnapshot(pendingOrder));

    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(pendingOrder)
      .mockResolvedValueOnce(cancelledPending);
    vi.mocked(ordersService.cancelOrderApi).mockResolvedValueOnce(cancelledPending);

    const view1 = renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    expect(await screen.findByText('Đã hủy đơn #1002.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thanh toán/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Tiến trình đơn hàng')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-refund-notice')).not.toBeInTheDocument();
    expect(screen.queryByText('Tiền sẽ được hoàn lại (mô phỏng)')).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(sampleCartJson);
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    view1.unmount();

    // (b) PAYMENT_FAILED -> CANCELLED (chỉ có payment FAILED)
    const failedOrder = cloneOrder(MOCK_SEED_ORDERS[2]); // #1003
    const cancelledFailed = cloneOrder(failedOrder, { status: 'CANCELLED' });
    mockParams = { id: failedOrder.id };

    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(failedOrder)
      .mockResolvedValueOnce(cancelledFailed);
    vi.mocked(ordersService.cancelOrderApi).mockResolvedValueOnce(cancelledFailed);

    renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    expect(await screen.findByText('Đã hủy đơn #1003.')).toBeInTheDocument();
    expect(screen.queryByTestId('order-refund-notice')).not.toBeInTheDocument();
    expect(screen.queryByText('Tiền sẽ được hoàn lại (mô phỏng)')).not.toBeInTheDocument();
  });

  it('19. Trang chi tiết /orders/[id]: hủy đơn PAID -> hiện dòng "Tiền sẽ được hoàn lại (mô phỏng)" khi tải lại có payment SUCCESS và ngay cả khi getOrderByIdApi tải lại sau hủy bị lỗi mạng/5xx', async () => {
    const user = userEvent.setup();
    const paidOrder = cloneOrder(MOCK_SEED_ORDERS[0]); // #1001 PAID với payment SUCCESS
    // Giả lập cancelOrderApi trả Order KHÔNG kèm mảng payments (hoặc mảng rỗng như một số response)
    const cancelApiResponseWithoutPayments = cloneOrder(paidOrder, { status: 'CANCELLED', payments: [] });
    const fullReloadedCancelled = cloneOrder(paidOrder, { status: 'CANCELLED' });

    mockParams = { id: paidOrder.id };
    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(paidOrder)
      .mockResolvedValueOnce(fullReloadedCancelled);
    vi.mocked(ordersService.cancelOrderApi).mockResolvedValueOnce(cancelApiResponseWithoutPayments);

    const view1 = renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    expect(await screen.findByText('Đã hủy đơn #1001.')).toBeInTheDocument();
    expect(await screen.findByTestId('order-refund-notice')).toHaveTextContent(
      'Tiền sẽ được hoàn lại (mô phỏng)'
    );
    view1.unmount();

    // Trường hợp getOrderByIdApi sau khi hủy bị lỗi mạng/5xx: KHÔNG báo lỗi và KHÔNG làm mất dòng hoàn tiền từ payments có sẵn
    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(paidOrder)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.mocked(ordersService.cancelOrderApi).mockResolvedValueOnce(cancelApiResponseWithoutPayments);

    renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    expect(await screen.findByText('Đã hủy đơn #1001.')).toBeInTheDocument();
    expect(await screen.findByTestId('order-refund-notice')).toHaveTextContent(
      'Tiền sẽ được hoàn lại (mô phỏng)'
    );
    expect(screen.queryByText(/không thể tải/i)).not.toBeInTheDocument();
  });

  it('20. Mở lại trang chi tiết (F5) của đơn đã hủy: hiện "Tiền sẽ được hoàn lại (mô phỏng)" nếu có payment SUCCESS (#1007), không hiện nếu chỉ có payment FAILED/trống', async () => {
    // Có payment SUCCESS (#1007)
    const cancelledWithRefund = cloneOrder(MOCK_SEED_ORDERS[6]);
    mockParams = { id: cancelledWithRefund.id };
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(cancelledWithRefund);

    const view1 = renderOrderDetailPage();
    expect(await screen.findByTestId('order-number-heading')).toHaveTextContent('#1007');
    expect(screen.getByTestId('order-refund-notice')).toHaveTextContent(
      'Tiền sẽ được hoàn lại (mô phỏng)'
    );
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    view1.unmount();

    // Không có payment SUCCESS
    const cancelledNoRefund = cloneOrder(MOCK_SEED_ORDERS[1], { status: 'CANCELLED', payments: [] });
    mockParams = { id: cancelledNoRefund.id };
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(cancelledNoRefund);

    renderOrderDetailPage();
    expect(await screen.findByTestId('order-number-heading')).toHaveTextContent('#1002');
    expect(screen.queryByTestId('order-refund-notice')).not.toBeInTheDocument();
    expect(screen.queryByText('Tiền sẽ được hoàn lại (mô phỏng)')).not.toBeInTheDocument();
  });

  it.each([
    'Không thể hủy đơn ở trạng thái hiện tại',
    'Trạng thái đơn đã thay đổi, vui lòng tải lại',
  ])('21. Lỗi 409 ("%s") trên /orders/[id] đóng hộp, hiện đúng thông báo server và TỰ tải lại trạng thái mới nhất', async (serverMsg) => {
    const user = userEvent.setup();
    const initialOrder = cloneOrder(MOCK_SEED_ORDERS[1]); // #1002 PENDING
    const refreshedOrder = cloneOrder(MOCK_SEED_ORDERS[1], { status: 'PREPARING' });

    mockParams = { id: initialOrder.id };
    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(initialOrder)
      .mockResolvedValueOnce(refreshedOrder);
    vi.mocked(ordersService.cancelOrderApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 409, message: serverMsg })
    );

    renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText(serverMsg)).toBeInTheDocument();
    expect(ordersService.getOrderByIdApi).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTestId('order-status-badge')).toHaveTextContent('Đang pha chế');
    });
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
  });

  it('22. Lỗi 409 trên /orders đóng hộp, hiện đúng thông báo server và tự tải lại danh sách đơn', async () => {
    const user = userEvent.setup();
    const initialOrder = cloneOrder(MOCK_SEED_ORDERS[1]); // PENDING
    const refreshedOrder = cloneOrder(MOCK_SEED_ORDERS[1], { status: 'PREPARING' });

    vi.mocked(ordersService.getMyOrdersApi)
      .mockResolvedValueOnce([initialOrder])
      .mockResolvedValueOnce([refreshedOrder]);
    vi.mocked(ordersService.cancelOrderApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 409,
        message: 'Trạng thái đơn đã thay đổi, vui lòng tải lại',
      })
    );

    renderOrdersListPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Trạng thái đơn đã thay đổi, vui lòng tải lại')).toBeInTheDocument();
    expect(ordersService.getMyOrdersApi).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Đang pha chế')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
  });

  it('23. Lỗi 404 "Không tìm thấy đơn hàng" trên /orders/[id] và /orders xử lý đúng thông báo server', async () => {
    const user = userEvent.setup();
    const pendingOrder = cloneOrder(MOCK_SEED_ORDERS[1]);
    mockParams = { id: pendingOrder.id };

    // Trên trang chi tiết /orders/[id]
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(pendingOrder);
    vi.mocked(ordersService.cancelOrderApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 404, message: 'Không tìm thấy đơn hàng' })
    );

    const detailView = renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Không tìm thấy đơn hàng')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lịch sử đơn/i })).toHaveAttribute('href', '/orders');
    detailView.unmount();

    // Trên trang danh sách /orders
    vi.mocked(ordersService.getMyOrdersApi)
      .mockResolvedValueOnce([pendingOrder])
      .mockResolvedValueOnce([]);
    vi.mocked(ordersService.cancelOrderApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 404, message: 'Không tìm thấy đơn hàng' })
    );

    renderOrdersListPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Không tìm thấy đơn hàng')).toBeInTheDocument();
    expect(ordersService.getMyOrdersApi).toHaveBeenCalledTimes(2);
  });

  it('24. Lỗi 401 khi gọi cancelOrderApi xóa phiên đăng nhập và chuyển về /login?redirect=...&expired=true (không bị useRequireAuth ghi đè)', async () => {
    const user = userEvent.setup();
    const pendingOrder = cloneOrder(MOCK_SEED_ORDERS[1]);
    mockParams = { id: pendingOrder.id };
    window.history.pushState({}, '', `/orders/${pendingOrder.id}`);

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce(pendingOrder);
    vi.mocked(ordersService.cancelOrderApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 401, message: 'Phiên đăng nhập đã hết hạn' })
    );

    const detailView = renderOrderDetailPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent(`/orders/${pendingOrder.id}`)}&expired=true`
      );
    });
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    detailView.unmount();

    // Tương tự trên /orders
    vi.clearAllMocks();
    window.history.pushState({}, '', '/orders');
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    vi.mocked(ordersService.getMyOrdersApi).mockResolvedValueOnce([pendingOrder]);
    vi.mocked(ordersService.cancelOrderApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 401, message: 'Phiên đăng nhập đã hết hạn' })
    );

    renderOrdersListPage();
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent('/orders')}&expired=true`
      );
    });
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('25. Lỗi mạng/5xx khi hủy đơn: đóng hộp, hiện thông báo dễ hiểu, giữ nguyên trạng thái cũ và cho phép thử lại', async () => {
    const user = userEvent.setup();
    const pendingOrder = cloneOrder(MOCK_SEED_ORDERS[1]); // #1002 PENDING
    const cancelledOrder = cloneOrder(pendingOrder, { status: 'CANCELLED' });
    mockParams = { id: pendingOrder.id };

    vi.mocked(ordersService.getOrderByIdApi)
      .mockResolvedValueOnce(pendingOrder)
      .mockResolvedValueOnce(cancelledOrder);
    vi.mocked(ordersService.cancelOrderApi)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(cancelledOrder);

    renderOrderDetailPage();

    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Giữ nguyên trạng thái Chờ thanh toán và nút Hủy đơn vẫn cho phép thử lại
    expect(screen.getByTestId('order-status-badge')).toHaveTextContent('Chờ thanh toán');
    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeEnabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Thử lại lần 2 thành công
    await user.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }));
    expect(await screen.findByText('Đã hủy đơn #1002.')).toBeInTheDocument();
  });
});

