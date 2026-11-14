import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckoutPage from '../app/checkout/page';
import QrPaymentScreen from '../app/components/QrPaymentScreen';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import { CART_STORAGE_KEY, CartItem } from '../utils/cart';
import {
  PENDING_ORDER_STORAGE_KEY,
  savePendingOrder,
} from '../utils/checkout';
import {
  QR_PAYMENT_FAILURE_ACCOUNT,
  QR_PAYMENT_SUCCESS_ACCOUNT,
} from '../constants/payment';
import { OrderResponse, OrderStatus } from '../services/order-contract';
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
      order: { id: created.id, orderNumber: 3001, status: 'PAID' },
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
        order: { id: created.id, orderNumber: 3002, status: 'PAYMENT_FAILED' },
      })
      .mockResolvedValueOnce({
        id: 'pay-qr-success-2',
        orderId: created.id,
        amount: 90000,
        method: 'WALLET',
        accountLast4: '0001',
        status: 'SUCCESS',
        createdAt: '2026-11-15T00:00:10.000Z',
        order: { id: created.id, orderNumber: 3002, status: 'PAID' },
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
        order: { id: 'order-qr-001', orderNumber: 2045, status: 'PAID' as const },
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
      order: { id: 'ord-direct-a', orderNumber: 4001, status: 'PAID' },
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
        order: { id: 'order-qr-001', orderNumber: 2045, status: 'PAID' },
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
});
