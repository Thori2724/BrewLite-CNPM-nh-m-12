import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckoutPage from '../app/checkout/page';
import QrPaymentScreen from '../app/components/QrPaymentScreen';
import AccountLockedNotice from '../app/components/AccountLockedNotice';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { AUTH_STORAGE_KEY, loadAuthSession } from '../utils/auth';
import { CART_STORAGE_KEY, CartItem } from '../utils/cart';
import {
  PENDING_ORDER_STORAGE_KEY,
  savePendingOrder,
} from '../utils/checkout';
import {
  QR_BANK_OPTIONS,
  QR_PAYMENT_FAILURE_ACCOUNT,
  QR_PAYMENT_SUCCESS_ACCOUNT,
  buildQrPayload,
} from '../constants/payment';
import { OrderResponse, OrderStatus, PAYMENT_METHOD_LABELS } from '../services/order-contract';
import { AUTH_ERROR_MESSAGES } from '../services/auth-contract';
import * as loyaltyService from '../services/loyalty';
import * as ordersService from '../services/orders';
import * as navigation from 'next/navigation';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

vi.mock('../services/loyalty', async () => {
  const actual = await vi.importActual<typeof import('../services/loyalty')>('../services/loyalty');
  return {
    ...actual,
    getMyLoyaltyApi: vi.fn(),
  };
});

vi.mock('../services/orders', async () => {
  const actual = await vi.importActual<typeof import('../services/orders')>('../services/orders');
  return {
    ...actual,
    createOrderApi: vi.fn(),
    payOrderApi: vi.fn(),
    getOrderByIdApi: vi.fn(),
  };
});

const mockCartItem: CartItem = {
  id: 'cart-qr-1',
  productId: 'prod-1',
  name: 'Cà phê muối',
  imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500',
  size: 'M',
  sugarLevel: 'P50',
  iceLevel: 'NORMAL',
  toppings: [{ id: 'top-1', name: 'Kem mặn', price: 10000 }],
  note: '',
  unitPrice: 45000,
  quantity: 2,
};

const mockLoggedInUser = {
  token: 'mock-jwt-token-qr',
  user: {
    id: 'user-qr-1',
    email: 'qr@example.com',
    displayName: 'Khách QR',
    role: 'CUSTOMER' as const,
  },
};

function makeOrder(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: 'order-qr-001',
    orderNumber: 2045,
    status: 'PENDING',
    receiveType: 'AT_COUNTER',
    subtotalAmount: 90000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 90000,
    createdAt: '2026-11-15T00:00:00.000Z',
    items: [
      {
        id: 'oi-1',
        productId: 'prod-1',
        productName: 'Cà phê muối',
        quantity: 2,
        size: 'M',
        unitPrice: 45000,
        lineTotal: 90000,
      },
    ],
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Task 12 - Màn thanh toán QR giả (ZaloPay / MoMo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockReset();
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockResolvedValue({
      loyaltyPoints: 0,
      transactions: [],
    });
    vi.mocked(ordersService.createOrderApi).mockReset();
    vi.mocked(ordersService.payOrderApi).mockReset();
    vi.mocked(ordersService.getOrderByIdApi).mockReset();
    localStorage.clear();
    mockSearchParams = new URLSearchParams();

    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    vi.mocked(navigation.useSearchParams).mockImplementation(
      () => mockSearchParams as unknown as ReturnType<typeof navigation.useSearchParams>
    );

    vi.mocked(ordersService.getOrderByIdApi).mockRejectedValue(
      new ordersService.OrderApiError(404, 'Not Found')
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('1. Checkout Bước 1 chỉ cho chọn ZaloPay / MoMo, bỏ thẻ ngân hàng và ô nhập số tài khoản; việc chọn ví không gửi lên server', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(makeOrder());

    render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await flushAsync();

    // Không có thẻ ngân hàng hay ô nhập số tài khoản trên giao diện
    expect(screen.queryByText(/thẻ ngân hàng/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/nhập số/i)).not.toBeInTheDocument();

    // Có đúng nhãn ZaloPay và MoMo
    expect(screen.getByRole('button', { name: /ZaloPay/i })).toBeInTheDocument();
    const momoBtn = screen.getByRole('button', { name: /MoMo/i });
    expect(momoBtn).toBeInTheDocument();

    // Chọn MoMo trước khi bấm xác nhận đặt đơn
    await act(async () => {
      fireEvent.click(momoBtn);
    });
    expect(momoBtn).toHaveAttribute('aria-pressed', 'true');

    const submitBtn = screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    await flushAsync();

    // POST /orders chỉ chứa receiveType, items (tùy chọn note) — KHÔNG gửi tên ví MoMo/ZaloPay
    expect(ordersService.createOrderApi).toHaveBeenCalledTimes(1);
    const createPayload = JSON.stringify(vi.mocked(ordersService.createOrderApi).mock.calls[0][0]);
    expect(createPayload).not.toMatch(/momo|zalopay/i);

    // Mở ngay màn QR với giao diện ví MoMo và mã QR tạo từ mã đơn
    expect(screen.getByText(/ví điện tử MoMo/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /mã qr MoMo cho đơn hàng #2045/i })).toBeInTheDocument();
    expect(screen.getByTestId('qr-countdown').textContent).toBe('5');
  });

  it('2. Màn QR đếm ngược đủ 5 giây tự gọi POST /payments với WALLET + 0900000001, xóa giỏ hàng và hiện màn xác nhận không có 4 số cuối', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const created = makeOrder({ id: 'ord-qr-countdown', orderNumber: 3001 });
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(created);
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-qr-success',
      orderId: created.id,
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: '2026-11-15T00:00:05.000Z',
      order: { id: created.id, orderNumber: 3001, status: 'PAID', pointsEarned: 9 },
    });

    render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await flushAsync();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
    });
    await flushAsync();

    expect(screen.getByTestId('qr-countdown').textContent).toBe('5');

    // Không tự gọi trước 5 giây
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId('qr-countdown').textContent).toBe('4');
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByTestId('qr-countdown').textContent).toBe('1');
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();

    // Đến giây thứ 5 -> gọi POST /payments với WALLET và 0900000001
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const [dto, idempKey] = vi.mocked(ordersService.payOrderApi).mock.calls[0];
    expect(dto).toEqual({
      orderId: 'ord-qr-countdown',
      method: 'WALLET',
      accountNumber: QR_PAYMENT_SUCCESS_ACCOUNT,
    });
    expect(typeof idempKey).toBe('string');
    expect((idempKey as string).length).toBeGreaterThanOrEqual(8);
    expect((idempKey as string).length).toBeLessThanOrEqual(100);

    // Hiển thị màn xác nhận thành công, ẩn số tài khoản / 4 số cuối, và đã xóa giỏ hàng
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#3001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /xem chi tiết đơn hàng/i })).toHaveAttribute(
      'href',
      '/orders/ord-qr-countdown'
    );
    expect(screen.queryByText(/số tài khoản/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/•••• 0001/)).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  it('3. Bấm thoát khỏi QR (Hủy thanh toán / nút đóng) gọi với 0900000000, giữ giỏ hàng và cho phép Thử lại thanh toán vào thẳng QR với cùng orderId & Idempotency-Key MỚI', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    const initialCartJson = JSON.stringify([mockCartItem]);
    localStorage.setItem(CART_STORAGE_KEY, initialCartJson);

    const created = makeOrder({ id: 'ord-qr-retry-same', orderNumber: 3002 });
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(created);
    vi.mocked(ordersService.payOrderApi)
      .mockResolvedValueOnce({
        id: 'pay-qr-fail-1',
        orderId: created.id,
        amount: 90000,
        method: 'WALLET',
        accountLast4: '0000',
        status: 'FAILED',
        failureReason: 'Số tài khoản bị từ chối bởi hệ thống thanh toán mô phỏng',
        createdAt: '2026-11-15T00:00:02.000Z',
        order: {
          id: created.id,
          orderNumber: 3002,
          status: 'PAYMENT_FAILED',
          pointsEarned: 0,
        },
      })
      .mockResolvedValueOnce({
        id: 'pay-qr-success-2',
        orderId: created.id,
        amount: 90000,
        method: 'WALLET',
        accountLast4: '0001',
        status: 'SUCCESS',
        createdAt: '2026-11-15T00:00:10.000Z',
        order: { id: created.id, orderNumber: 3002, status: 'PAID', pointsEarned: 9 },
      });

    render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await flushAsync();

    // Tạo đơn ở Bước 1
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
    });
    await flushAsync();

    // Bấm nút đóng màn QR ở giây thứ 4
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId('qr-countdown').textContent).toBe('4');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /đóng màn thanh toán qr/i }));
    });
    await flushAsync();

    // Lần 1 gọi với 0900000000 -> PAYMENT_FAILED, giữ giỏ, giữ orderId, hiện nút Thử lại thanh toán
    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const [dto1, key1] = vi.mocked(ordersService.payOrderApi).mock.calls[0];
    expect(dto1).toEqual({
      orderId: 'ord-qr-retry-same',
      method: 'WALLET',
      accountNumber: QR_PAYMENT_FAILURE_ACCOUNT,
    });
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(initialCartJson);
    expect(JSON.parse(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)!).orderId).toBe(
      'ord-qr-retry-same'
    );
    expect(screen.getByText(/bạn đã hủy thanh toán qr/i)).toBeInTheDocument();

    // Đổi sang MoMo rồi bấm "Thử lại thanh toán" -> vào thẳng lại màn QR của ĐÚNG orderId đó, không gọi POST /orders lần 2
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MoMo/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thử lại thanh toán/i }));
    });

    expect(ordersService.createOrderApi).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: /mã qr MoMo cho đơn hàng #3002/i })).toBeInTheDocument();
    expect(screen.getByTestId('qr-countdown').textContent).toBe('5');

    // Hết 5 giây -> gọi POST /payments với 0900000001 và Idempotency-Key MỚI
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(ordersService.createOrderApi).toHaveBeenCalledTimes(1);
    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const [dto2, key2] = vi.mocked(ordersService.payOrderApi).mock.calls[1];
    expect(dto2).toEqual({
      orderId: 'ord-qr-retry-same',
      method: 'WALLET',
      accountNumber: QR_PAYMENT_SUCCESS_ACCOUNT,
    });
    expect(key2).not.toBe(key1);
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  it('4. Chống gọi trùng & khóa nút trong lúc Đang xử lý...; dọn timer sạch khi unmount / StrictMode', async () => {
    vi.useFakeTimers();

    let resolvePendingPay!: (val: ordersService.OrderApiError | ReturnType<typeof makePaymentSuccess>) => void;
    function makePaymentSuccess() {
      return {
        id: 'pay-lock-1',
        orderId: 'order-qr-001',
        amount: 90000,
        method: 'WALLET' as const,
        accountLast4: '0001',
        status: 'SUCCESS' as const,
        createdAt: '2026-11-15T00:00:05.000Z',
        order: {
          id: 'order-qr-001',
          orderNumber: 2045,
          status: 'PAID' as const,
          pointsEarned: 9,
        },
      };
    }

    vi.mocked(ordersService.payOrderApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePendingPay = resolve as typeof resolvePendingPay;
        })
    );

    const onClearCart = vi.fn();
    const { unmount } = render(
      <React.StrictMode>
        <QrPaymentScreen
          orderId="order-qr-001"
          initialOrder={makeOrder()}
          autoStartQr={true}
          createdFromCart={true}
          onClearCart={onClearCart}
        />
      </React.StrictMode>
    );

    // Trong StrictMode, ở giây 0->4 vẫn KHÔNG gọi API sớm
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();

    // Hết giây thứ 5 -> chỉ gọi ĐÚNG 1 lần dù chạy trong StrictMode
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);

    // Trong khi đang chờ response: hiện "Đang xử lý..." và khóa cả nút Hủy thanh toán lẫn nút đóng
    expect(screen.getAllByText(/đang xử lý\.\.\./i).length).toBeGreaterThanOrEqual(1);
    const cancelBtn = screen.getByRole('button', { name: /đang xử lý\.\.\./i });
    const closeBtn = screen.getByRole('button', { name: /đóng màn thanh toán qr/i });
    expect(cancelBtn).toBeDisabled();
    expect(closeBtn).toBeDisabled();

    // Bấm nút hủy lúc đang xử lý không kích hoạt thêm request thứ 2
    fireEvent.click(cancelBtn);
    fireEvent.click(closeBtn);
    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);

    // Hoàn tất promise
    await act(async () => {
      resolvePendingPay(makePaymentSuccess());
    });
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(onClearCart).toHaveBeenCalledTimes(1);

    unmount();

    // Kiểm tra thêm ca rời trang / unmount trước khi hết 5s -> tuyệt đối KHÔNG gọi POST /payments
    vi.mocked(ordersService.payOrderApi).mockClear();
    const { unmount: unmountEarly } = render(
      <QrPaymentScreen
        orderId="order-qr-early-unmount"
        initialOrder={makeOrder({ id: 'order-qr-early-unmount' })}
        autoStartQr={true}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    unmountEarly();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();
  });

  it('5. Mở trực tiếp chỉ với orderId (Cách A): xử lý empty, loading, error + thử lại, đơn không hợp lệ (PAID/CANCELLED) và giữ nguyên giỏ khi không từ giỏ', async () => {
    vi.useFakeTimers();

    // 5a. Empty orderId
    const { unmount: unmountEmpty } = render(<QrPaymentScreen orderId="" />);
    expect(screen.getByText(/chưa có thông tin đơn hàng/i)).toBeInTheDocument();
    unmountEmpty();

    // 5b. Loading -> Error khi GET /orders/:id lỗi mạng -> Thử lại thành công ra Cách A (chưa tự đếm ngược)
    let rejectFirstLoad!: (err: Error) => void;
    vi.mocked(ordersService.getOrderByIdApi)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirstLoad = reject;
          })
      )
      .mockResolvedValueOnce(makeOrder({ id: 'ord-direct-a', orderNumber: 4001, status: 'PENDING' }));

    const onClearCart = vi.fn();
    const { unmount: unmountDirect } = render(
      <QrPaymentScreen orderId="ord-direct-a" onClearCart={onClearCart} />
    );

    expect(screen.getByText(/đang tải thông tin đơn hàng\.\.\./i)).toBeInTheDocument();

    await act(async () => {
      rejectFirstLoad(new ordersService.OrderApiError(0, 'Mất kết nối mạng'));
    });
    expect(screen.getByText(/mất kết nối mạng/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^thử lại$/i }));
    });
    await flushAsync();

    // Hiện bước chọn ví (Cách A) — không tự mở QR nếu chưa bấm
    expect(screen.getByText('#4001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thanh toán bằng qr/i })).toBeInTheDocument();
    expect(screen.queryByTestId('qr-countdown')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();

    // Bấm "Thanh toán bằng QR" mới mở QR và đếm 5 giây
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-direct-ok',
      orderId: 'ord-direct-a',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: '2026-11-15T00:00:05.000Z',
      order: { id: 'ord-direct-a', orderNumber: 4001, status: 'PAID', pointsEarned: 9 },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    expect(screen.getByTestId('qr-countdown').textContent).toBe('5');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    expect(onClearCart).not.toHaveBeenCalled();
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    unmountDirect();

    // 5c. Đơn không phải PENDING / PAYMENT_FAILED -> không cho thanh toán và báo rõ
    const nonPayableStatuses: OrderStatus[] = [
      'PAID',
      'PREPARING',
      'READY',
      'COMPLETED',
      'CANCELLED',
    ];
    for (const st of nonPayableStatuses) {
      const { unmount } = render(
        <QrPaymentScreen
          orderId={`ord-${st}`}
          initialOrder={makeOrder({ id: `ord-${st}`, orderNumber: 5000, status: st })}
        />
      );
      expect(screen.getByText(/đơn hàng #5000 không thể thanh toán/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /thanh toán bằng qr/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('qr-countdown')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('6. Lỗi mạng khi đang gửi POST /payments: nút Thử lại gửi lại ĐÚNG accountNumber và CÙNG Idempotency-Key', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));

    vi.mocked(ordersService.payOrderApi)
      .mockRejectedValueOnce(
        new ordersService.OrderApiError(0, 'Không thể kết nối đến máy chủ. Vui lòng thử lại.')
      )
      .mockResolvedValueOnce({
        id: 'pay-net-recover',
        orderId: 'order-qr-001',
        amount: 90000,
        method: 'WALLET',
        accountLast4: '0001',
        status: 'SUCCESS',
        createdAt: '2026-11-15T00:00:08.000Z',
        order: { id: 'order-qr-001', orderNumber: 2045, status: 'PAID', pointsEarned: 9 },
      });

    savePendingOrder({
      orderId: 'order-qr-001',
      orderNumber: 2045,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'old-pending-key',
      createdAt: '2026-11-15T00:00:00.000Z',
      itemCount: 1,
    });

    render(
      <QrPaymentScreen
        orderId="order-qr-001"
        initialOrder={makeOrder()}
        autoStartQr={true}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const [dto1, key1] = vi.mocked(ordersService.payOrderApi).mock.calls[0];
    expect(screen.getByText(/không thể kết nối đến máy chủ/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /^thử lại$/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const [dto2, key2] = vi.mocked(ordersService.payOrderApi).mock.calls[1];
    expect(dto2).toEqual(dto1);
    expect(key2).toBe(key1);
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
  });

  it('7. buildQrPayload tạo đúng định dạng BREWLITE|<orderNumber>|<totalAmount>|<uuid> và đổi mỗi lần mở màn QR', async () => {
    vi.useFakeTimers();

    const payload1 = buildQrPayload({ orderNumber: 1001, totalAmount: 136000 });
    const payload2 = buildQrPayload({ orderNumber: 1001, totalAmount: 136000 });

    const qrRegex =
      /^BREWLITE\|1001\|136000\|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(payload1).toMatch(qrRegex);
    expect(payload2).toMatch(qrRegex);
    expect(payload1).not.toBe(payload2);

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-qr-fail-format',
      orderId: 'order-qr-001',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0000',
      status: 'FAILED',
      failureReason: 'Giao dịch bị từ chối (mô phỏng)',
      createdAt: '2026-11-15T00:00:02.000Z',
      order: { id: 'order-qr-001', orderNumber: 2045, status: 'PAYMENT_FAILED', pointsEarned: 0 },
    });

    const { container } = render(
      <QrPaymentScreen
        orderId="order-qr-001"
        initialOrder={makeOrder()}
        autoStartQr={true}
      />
    );

    const qrRoot1 = container.querySelector('[data-qr-payload]');
    const firstRenderedPayload = qrRoot1?.getAttribute('data-qr-payload') || '';
    expect(firstRenderedPayload).toMatch(
      /^BREWLITE\|2045\|90000\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Qua 2 giây đếm ngược, mã QR trong cùng một lần mở vẫn ổn định
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(container.querySelector('[data-qr-payload]')?.getAttribute('data-qr-payload')).toBe(
      firstRenderedPayload
    );

    // Thoát QR -> thất bại -> Thử lại thanh toán mở lần QR thứ 2 với mã QR MỚI
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
    });
    await flushAsync();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thử lại thanh toán/i }));
    });

    const secondRenderedPayload =
      container.querySelector('[data-qr-payload]')?.getAttribute('data-qr-payload') || '';
    expect(secondRenderedPayload).toMatch(
      /^BREWLITE\|2045\|90000\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(secondRenderedPayload).not.toBe(firstRenderedPayload);
  });

  it('8. Chuyển khoản ngân hàng (CARD): chọn ngân hàng cố định, không gửi tên ngân hàng, gọi POST /payments với method CARD và không hiện +N điểm', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const created = makeOrder({ id: 'ord-bank-card', orderNumber: 4501, totalAmount: 90000 });
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(created);
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-bank-success',
      orderId: created.id,
      amount: 90000,
      method: 'CARD',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: '2026-11-15T00:00:05.000Z',
      order: { id: created.id, orderNumber: 4501, status: 'PAID', pointsEarned: 9 },
    });

    render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await flushAsync();

    // Có đúng 2 tab theo nhãn bảng 9.3
    const walletTab = screen.getByRole('tab', {
      name: new RegExp(`^${PAYMENT_METHOD_LABELS.WALLET.replace(/[()]/g, '\\$&')}`, 'i'),
    });
    const bankTab = screen.getByRole('tab', {
      name: new RegExp(`^${PAYMENT_METHOD_LABELS.CARD}`, 'i'),
    });
    expect(walletTab).toBeInTheDocument();
    expect(bankTab).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(bankTab);
    });

    // Hiển thị đủ danh sách ngân hàng cố định, không có ô nhập số/thẻ
    for (const bank of QR_BANK_OPTIONS) {
      expect(screen.getByRole('button', { name: new RegExp(bank.name, 'i') })).toBeInTheDocument();
    }
    expect(screen.queryByPlaceholderText(/nhập số/i)).not.toBeInTheDocument();

    const mbBtn = screen.getByRole('button', { name: /MB Bank/i });
    await act(async () => {
      fireEvent.click(mbBtn);
    });
    expect(mbBtn).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
    });
    await flushAsync();

    // POST /orders không chứa tên ngân hàng
    const orderPayloadStr = JSON.stringify(vi.mocked(ordersService.createOrderApi).mock.calls[0][0]);
    expect(orderPayloadStr).not.toMatch(/mb bank|vietcombank|card/i);

    // Màn QR hiển thị đúng ngân hàng và số tiền từ server
    expect(screen.getByText(/Chuyển khoản ngân hàng • MB Bank/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /mã qr MB Bank cho đơn hàng #4501/i })).toBeInTheDocument();
    expect(screen.getByText('90.000đ')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const [payDto, idempKey] = vi.mocked(ordersService.payOrderApi).mock.calls[0];
    expect(payDto).toEqual({
      orderId: 'ord-bank-card',
      method: 'CARD',
      accountNumber: QR_PAYMENT_SUCCESS_ACCOUNT,
    });
    expect(JSON.stringify(payDto)).not.toMatch(/mb bank/i);
    expect((idempKey as string).length).toBeGreaterThanOrEqual(8);

    // Thành công: xóa giỏ, hiện mã đơn + "Đã thanh toán", KHÔNG hiện "+N điểm"
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#4501').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();
    expect(screen.getByText(/\+9 điểm/i)).toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  it('9. Thoát màn QR với CARD gửi 0900000000, thử lại dùng key mới, và bấm thoát đúng lúc hết 5s chỉ gửi đúng 1 request', async () => {
    vi.useFakeTimers();

    vi.mocked(ordersService.payOrderApi)
      .mockResolvedValueOnce({
        id: 'pay-card-fail',
        orderId: 'order-qr-001',
        amount: 90000,
        method: 'CARD',
        accountLast4: '0000',
        status: 'FAILED',
        failureReason: 'Giao dịch bị từ chối (mô phỏng)',
        createdAt: '2026-11-15T00:00:02.000Z',
        order: { id: 'order-qr-001', orderNumber: 2045, status: 'PAYMENT_FAILED', pointsEarned: 0 },
      })
      .mockResolvedValueOnce({
        id: 'pay-card-race-ok',
        orderId: 'order-qr-001',
        amount: 90000,
        method: 'CARD',
        accountLast4: '0001',
        status: 'SUCCESS',
        createdAt: '2026-11-15T00:00:10.000Z',
        order: { id: 'order-qr-001', orderNumber: 2045, status: 'PAID', pointsEarned: 9 },
      });

    render(
      <QrPaymentScreen
        orderId="order-qr-001"
        initialOrder={makeOrder()}
        initialMethod="CARD"
        initialBank="TCB"
        autoStartQr={true}
      />
    );

    // Thoát ngay ở lần 1 -> gửi method CARD + 0900000000
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const [dto1, key1] = vi.mocked(ordersService.payOrderApi).mock.calls[0];
    expect(dto1).toEqual({
      orderId: 'order-qr-001',
      method: 'CARD',
      accountNumber: QR_PAYMENT_FAILURE_ACCOUNT,
    });

    // Thử lại thanh toán -> mở QR lần 2 -> tiến đủ 5s rồi bấm đóng trong cùng tick cũng chỉ gọi ĐÚNG 1 lần (không gửi cả 2)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thử lại thanh toán/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      fireEvent.click(screen.getByRole('button', { name: /đóng màn thanh toán qr/i }));
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const [dto2, key2] = vi.mocked(ordersService.payOrderApi).mock.calls[1];
    expect(dto2).toEqual({
      orderId: 'order-qr-001',
      method: 'CARD',
      accountNumber: QR_PAYMENT_FAILURE_ACCOUNT,
    });
    expect(key2).not.toBe(key1);
  });

  it('10. Nhận 403 "Tài khoản đã bị khóa" khi thanh toán: hiện thông báo và tự đăng xuất', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));

    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(403, AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED)
    );

    render(
      <>
        <AccountLockedNotice />
        <QrPaymentScreen
          orderId="order-qr-001"
          initialOrder={makeOrder()}
          autoStartQr={true}
        />
      </>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(screen.getByTestId('account-locked-notice')).toHaveTextContent(
      AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED
    );
    expect(screen.getAllByText(AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED).length).toBeGreaterThanOrEqual(1);
    expect(loadAuthSession()).toBeNull();
    // Không coi 403 bị khóa là lỗi mạng (không có nút Thử lại giao dịch bị gián đoạn)
    expect(screen.queryByText(/giao dịch bị gián đoạn/i)).not.toBeInTheDocument();
  });

  it('11. Ví điện tử (WALLET) thành công sau 5 giây hiển thị "+N điểm" khi order.pointsEarned > 0', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const created = makeOrder({ id: 'ord-wallet-points', orderNumber: 4601, totalAmount: 90000 });
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(created);
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-wallet-points',
      orderId: created.id,
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: '2026-11-15T00:00:05.000Z',
      order: { id: created.id, orderNumber: 4601, status: 'PAID', pointsEarned: 9 },
    });

    render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await flushAsync();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
    });
    await flushAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledWith(
      {
        orderId: 'ord-wallet-points',
        method: 'WALLET',
        accountNumber: QR_PAYMENT_SUCCESS_ACCOUNT,
      },
      expect.any(String)
    );
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getByTestId('payment-points-earned')).toHaveTextContent('+9 điểm');
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  it('12. Chuyển khoản ngân hàng (CARD) thoát QR giữ giỏ và orderId, bấm Thử lại thanh toán thành công sau 5 giây với Idempotency-Key mới, xóa giỏ và hiện "+N điểm"', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    const initialCartJson = JSON.stringify([mockCartItem]);
    localStorage.setItem(CART_STORAGE_KEY, initialCartJson);

    const created = makeOrder({ id: 'ord-card-retry-flow', orderNumber: 4602, totalAmount: 90000 });
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(created);
    vi.mocked(ordersService.payOrderApi)
      .mockResolvedValueOnce({
        id: 'pay-card-fail-1',
        orderId: created.id,
        amount: 90000,
        method: 'CARD',
        accountLast4: '0000',
        status: 'FAILED',
        failureReason: 'Giao dịch bị từ chối (mô phỏng)',
        createdAt: '2026-11-15T00:00:02.000Z',
        order: { id: created.id, orderNumber: 4602, status: 'PAYMENT_FAILED', pointsEarned: 0 },
      })
      .mockResolvedValueOnce({
        id: 'pay-card-success-2',
        orderId: created.id,
        amount: 90000,
        method: 'CARD',
        accountLast4: '0001',
        status: 'SUCCESS',
        createdAt: '2026-11-15T00:00:10.000Z',
        order: { id: created.id, orderNumber: 4602, status: 'PAID', pointsEarned: 9 },
      });

    render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await flushAsync();

    // Chọn tab Chuyển khoản ngân hàng (CARD) và ngân hàng MB Bank
    await act(async () => {
      fireEvent.click(
        screen.getByRole('tab', {
          name: new RegExp(`^${PAYMENT_METHOD_LABELS.CARD}`, 'i'),
        })
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MB Bank/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
    });
    await flushAsync();

    // Thoát khỏi QR -> gọi CARD với 0900000000, giữ giỏ và giữ orderId
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
    });
    await flushAsync();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const [dto1, key1] = vi.mocked(ordersService.payOrderApi).mock.calls[0];
    expect(dto1).toEqual({
      orderId: 'ord-card-retry-flow',
      method: 'CARD',
      accountNumber: QR_PAYMENT_FAILURE_ACCOUNT,
    });
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(initialCartJson);
    expect(JSON.parse(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)!).orderId).toBe(
      'ord-card-retry-flow'
    );

    // Bấm Thử lại thanh toán -> đếm đủ 5 giây -> gọi CARD với 0900000001 và key mới
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thử lại thanh toán/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushAsync();

    expect(ordersService.createOrderApi).toHaveBeenCalledTimes(1);
    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const [dto2, key2] = vi.mocked(ordersService.payOrderApi).mock.calls[1];
    expect(dto2).toEqual({
      orderId: 'ord-card-retry-flow',
      method: 'CARD',
      accountNumber: QR_PAYMENT_SUCCESS_ACCOUNT,
    });
    expect(key2).not.toBe(key1);
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getByTestId('payment-points-earned')).toHaveTextContent('+9 điểm');
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  it('13. Mở ?orderId=... khi GET /orders/:id trả 500 "Internal Server Error" báo tiếng Việt, không lộ chữ tiếng Anh', async () => {
    vi.mocked(ordersService.getOrderByIdApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(500, 'Internal Server Error')
    );

    render(<QrPaymentScreen orderId="ord-err-500" />);

    expect(
      await screen.findByText('Máy chủ đang gặp sự cố tạm thời. Vui lòng thử lại.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Internal Server Error/i)).not.toBeInTheDocument();
  });
});
