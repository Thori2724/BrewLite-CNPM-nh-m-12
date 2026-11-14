import React from 'react';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckoutPage from '../app/checkout/page';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import { CART_STORAGE_KEY, CartItem } from '../utils/cart';
import {
  PendingOrderRecord,
  PENDING_ORDER_STORAGE_KEY,
  savePendingOrder,
} from '../utils/checkout';
import { OrderResponse } from '../services/order-contract';
import * as ordersService from '../services/orders';
import * as navigation from 'next/navigation';

// Mock next/navigation
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

// Mock services/orders
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
  id: 'cart-1',
  productId: 'prod-1',
  name: 'Cà phê muối',
  imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500',
  size: 'M',
  sugarLevel: 'P50',
  iceLevel: 'NORMAL',
  toppings: [{ id: 'top-1', name: 'Kem mặn', price: 10000 }],
  note: 'uống liền',
  unitPrice: 45000,
  quantity: 2, // 45.000 x 2 = 90.000đ
};

const mockLoggedInUser = {
  token: 'mock-jwt-token-123',
  user: {
    id: 'user-001',
    email: 'nguyenvana@example.com',
    displayName: 'Nguyễn Văn A',
    role: 'CUSTOMER' as const,
  },
};

describe('Giao diện và luồng xử lý trang Checkout (/checkout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      new Error('No mock order by id')
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const renderCheckout = () => {
    return render(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
  };

  // 1. Kiểm tra trạng thái xác thực
  it('1. Chưa đăng nhập: Tự động chuyển hướng về trang /login kèm redirect', async () => {
    renderCheckout();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining('/login?redirect=')
      );
    });
  });

  // 2. Giỏ hàng rỗng
  it('2. Đã đăng nhập nhưng giỏ hàng rỗng: Hiển thị thông báo giỏ hàng trống', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText(/giỏ hàng của bạn đang trống/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /xem menu chọn món/i })).toBeInTheDocument();
    });
  });

  // 3. Hiển thị thông tin đặt hàng (BỎ HẲN họ tên và số điện thoại)
  it('3. Đã đăng nhập và có món: Hiển thị tóm tắt đơn, hình thức nhận hàng và ghi chú (không có ô họ tên hay SĐT)', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
      expect(screen.getByText(/hình thức nhận hàng/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tại quầy/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/mang đi/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ghi chú đơn hàng/i)).toBeInTheDocument();
    });

    // BỎ HẲN họ tên và số điện thoại
    expect(screen.queryByLabelText(/họ và tên/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/số điện thoại/i)).not.toBeInTheDocument();
  });

  // 4. Tạo đơn thành công -> Lưu đơn chờ và chuyển sang bước thanh toán
  // 4. Đặt đơn thành công: Gọi API tạo đơn, lưu đơn chờ và chuyển sang màn QR
  it('4. Đặt đơn thành công: Gọi API tạo đơn, lưu đơn chờ và chuyển sang bước Thanh toán QR', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce({
      id: 'order-mock-888',
      orderNumber: 1001,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    // Chờ chuyển sang bước 2 (Thanh toán QR) — không còn thẻ ngân hàng hay ô nhập số tài khoản
    await waitFor(() => {
      expect(screen.getByText('#1001')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /mã qr ZaloPay cho đơn hàng #1001/i })).toBeInTheDocument();
      expect(screen.getByTestId('qr-countdown')).toBeInTheDocument();
      expect(screen.queryByText(/thẻ ngân hàng/i)).not.toBeInTheDocument();
    });

    // Kiểm tra đơn chờ đã được lưu vào localStorage
    const storedPending = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    expect(storedPending).not.toBeNull();
    const parsed = JSON.parse(storedPending!);
    expect(parsed.orderId).toBe('order-mock-888');
    expect(parsed.orderNumber).toBe(1001);
    expect(parsed.idempotencyKey).toBeDefined();
  });

  // 5. Tạo đơn thất bại do hết hàng 409
  it('5. Hết hàng (409): Hiển thị chi tiết món hết hàng từ details, giữ nguyên giỏ hàng', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const outOfStockErr = new ordersService.OrderApiError(
      409,
      'Một số món trong giỏ hàng hiện đã hết hàng hoặc không đủ số lượng',
      { details: [{ productId: 'prod-1', name: 'Cà phê muối', available: 0 }] }
    );
    vi.mocked(ordersService.createOrderApi).mockRejectedValueOnce(outOfStockErr);

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/một số món trong giỏ hàng hiện đã hết hàng/i)).toBeInTheDocument();
      expect(screen.getByText('Cà phê muối: còn 0')).toBeInTheDocument();
      expect(screen.getByText('Thiếu hàng (còn 0)')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /chỉnh số lượng \/ xóa/i })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /quay lại giỏ hàng/i }).length).toBeGreaterThanOrEqual(1);
    });

    // Giỏ hàng vẫn còn nguyên vẹn trong storage
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    // Không lưu bản ghi đơn chờ vào storage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 6. Thanh toán QR thành công: Dọn sạch đơn chờ, giữ nguyên giỏ khi không có cờ createdFromCart và hiện màn hình thành công
  it('6. Thanh toán QR thành công: Dọn sạch đơn chờ, hiện màn hình thành công và ẩn 4 số cuối tài khoản', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-pending-1',
      orderNumber: 1005,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-test-6',
      createdAt: new Date().toISOString(),
      itemCount: 1,
      createdFromCart: true,
    };
    savePendingOrder(pendingOrder);

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValue({
      id: 'order-pending-1',
      orderNumber: 1005,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-1',
      orderId: 'order-pending-1',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-1',
        orderNumber: 1005,
        status: 'PAID',
      },
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Thấy banner đơn chờ và bấm Tiếp tục thanh toán (Cách A)
    expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1005/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tiếp tục thanh toán/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Ở bước chọn ví (Cách A), bấm "Thanh toán bằng QR" rồi chờ đủ 5 giây
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    expect(screen.getByTestId('qr-countdown').textContent).toBe('5');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Hiện màn hình chúc mừng thành công (không hiện 4 số cuối tài khoản)
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1005').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/•••• 0001/i)).not.toBeInTheDocument();

    // Đơn chờ và giỏ hàng đã bị xóa sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  // 7. Hủy màn QR (status FAILED) -> Bấm Thử lại thanh toán vào thẳng QR với Idempotency-Key MỚI và thành công
  it('7. Thanh toán bị từ chối khi hủy QR (status FAILED): Giữ orderId, bấm Thử lại thanh toán vào thẳng QR với Idempotency-Key MỚI và thành công', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-pending-2',
      orderNumber: 1007,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-test-7-initial',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValue({
      id: 'order-pending-2',
      orderNumber: 1007,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Lần 1: Hủy QR -> server trả status FAILED
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-fail-1',
      orderId: 'order-pending-2',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0000',
      status: 'FAILED',
      failureReason: 'Giao dịch bị từ chối (mô phỏng)',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-2',
        orderNumber: 1007,
        status: 'PAYMENT_FAILED',
      },
    });

    // Lần 2: Thử lại thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-retry-2',
      orderId: 'order-pending-2',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-2',
        orderNumber: 1007,
        status: 'PAID',
      },
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tiếp tục thanh toán/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Mở QR lần 1 rồi bấm Hủy thanh toán (gửi 0900000000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Hiện thông báo thất bại lần 1 và nút "Thử lại thanh toán"
    expect(screen.getByText(/bạn đã hủy thanh toán qr/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thử lại thanh toán/i })).toBeInTheDocument();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const firstCallKey = vi.mocked(ordersService.payOrderApi).mock.calls[0][1];

    // LẦN 2: Bấm "Thử lại thanh toán" -> mở thẳng màn QR của ĐÚNG orderId, đếm đủ 5 giây -> thành công
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thử lại thanh toán/i }));
    });
    expect(screen.getByTestId('qr-countdown').textContent).toBe('5');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Chờ thành công
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1007').length).toBeGreaterThanOrEqual(1);

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const [secondDto, secondCallKey] = vi.mocked(ordersService.payOrderApi).mock.calls[1];
    expect((secondDto as { orderId: string }).orderId).toBe('order-pending-2');

    // KIỂM TRA QUY TẮC IDEMPOTENCY: Request thứ hai BẮT BUỘC có key KHÁC request đầu
    expect(secondCallKey).not.toBe(firstCallKey);
    expect(secondCallKey).toBeDefined();
  });

  // 8. Lỗi mạng / timeout -> Thử lại giao dịch bị gián đoạn thì BẮT BUỘC DÙNG CÙNG KEY
  it('8. Lỗi mạng / timeout: Thử lại giao dịch bị gián đoạn thì BẮT BUỘC DÙNG CÙNG KEY', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-pending-9',
      orderNumber: 1009,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-network-retry-test',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValue({
      id: 'order-pending-9',
      orderNumber: 1009,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Lần 1: Ném lỗi mạng (status 0)
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(0, 'Không thể kết nối đến máy chủ. Vui lòng thử lại.')
    );

    // Lần 2: Thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-same-key',
      orderId: 'order-pending-9',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-9',
        orderNumber: 1009,
        status: 'PAID',
      },
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tiếp tục thanh toán/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Mở QR và chờ 5 giây -> gặp lỗi mạng
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Báo lỗi mạng
    expect(screen.getByText(/không thể kết nối đến máy chủ/i)).toBeInTheDocument();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const call1Key = vi.mocked(ordersService.payOrderApi).mock.calls[0][1];

    // LẦN 2: Bấm Thử lại giao dịch bị gián đoạn -> dùng CÙNG KEY
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^thử lại$/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Thành công
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1009').length).toBeGreaterThanOrEqual(1);

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const call2Key = vi.mocked(ordersService.payOrderApi).mock.calls[1][1];

    // Sau lỗi mạng thử lại đúng giao dịch vừa gửi -> BẮT BUỘC DÙNG CÙNG KEY
    expect(call2Key).toBe(call1Key);
  });

  // 9. Chống bấm đúp (Debounce / Khóa submit)
  it('9. Chống bấm đúp: Bấm liên tiếp nút Đặt đơn chỉ gửi đúng 1 request API tạo đơn', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    let resolvePromise!: (value: OrderResponse) => void;
    const pendingPromise = new Promise<OrderResponse>((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(ordersService.createOrderApi).mockImplementationOnce(() => pendingPromise);

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });

    // Bấm liên tiếp nhiều lần khi đang xử lý
    await user.click(submitBtn);
    await user.click(submitBtn);
    await user.click(submitBtn);

    // API chỉ được gọi 1 lần duy nhất
    expect(ordersService.createOrderApi).toHaveBeenCalledTimes(1);

    // Giải phóng promise
    resolvePromise({
      id: 'order-double-click',
      orderNumber: 1012,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    await waitFor(() => {
      expect(screen.getByText('#1012')).toBeInTheDocument();
    });
  });

  // 10. Đơn chờ đã hoàn tất thanh toán từ trước (PAID) khi mở /checkout không có ?orderId
  it('10. Đơn chờ đã PAID khi mở /checkout (không có ?orderId): Xóa pendingOrder, giữ nguyên giỏ và ở lại Bước 1 (nếu có createdFromCart: true thì xóa giỏ và chuyển sang /orders/<id>)', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    const initialCartJson = JSON.stringify([mockCartItem]);
    localStorage.setItem(CART_STORAGE_KEY, initialCartJson);

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-already-paid',
      orderNumber: 1020,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-paid-test',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock getOrderByIdApi trả về đơn hàng có trạng thái PAID
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-already-paid',
      orderNumber: 1020,
      status: 'PAID',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    const { unmount } = renderCheckout();

    await waitFor(() => {
      expect(ordersService.getOrderByIdApi).toHaveBeenCalledWith('order-already-paid');
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });

    // Giữ nguyên giỏ hàng, ở lại Bước 1, KHÔNG hiện màn thành công lúc mount
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(initialCartJson);
    expect(screen.getByText('Bước 1/2: Đặt đơn')).toBeInTheDocument();
    expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    expect(screen.queryByText(/thanh toán thành công!/i)).not.toBeInTheDocument();

    unmount();

    // Trường hợp đặc biệt: nếu pendingOrder có cờ createdFromCart: true thì xóa giỏ và chuyển sang /orders/<id>
    savePendingOrder({
      ...pendingOrder,
      createdFromCart: true,
    });
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-already-paid',
      orderNumber: 1020,
      status: 'PAID',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    renderCheckout();

    await waitFor(() => {
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
      expect(mockReplace).toHaveBeenCalledWith('/orders/order-already-paid');
    });
  });

  // 11. Gặp lỗi 401 giữa chừng
  it('11. Gặp lỗi 401 giữa chừng khi tạo đơn: Tự động chuyển hướng về /login', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(ordersService.createOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(401, 'Unauthorized')
    );

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?redirect=%2Fcheckout&expired=true');
    });
  });

  // 12. Thanh toán gặp lỗi 404 (Không tìm thấy đơn): Xóa đơn chờ, hiện thông báo rõ ràng và giữ nguyên giỏ hàng
  it('12. Thanh toán gặp 404: Xóa bản ghi đơn chờ, báo lỗi rõ ràng kèm link lịch sử đơn và giữ nguyên giỏ hàng', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-not-found-404',
      orderNumber: 1044,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-404-test',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValue({
      id: 'order-not-found-404',
      orderNumber: 1044,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Mock API thanh toán trả về lỗi 404
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Không tìm thấy đơn hàng')
    );

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1044/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tiếp tục thanh toán/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Hiện message tiếng Việt rõ ràng và link Xem lịch sử đơn
    expect(screen.getByText(/không tìm thấy đơn hàng/i)).toBeInTheDocument();
    expect(
      screen.getByText(/đơn hàng trước đó không còn tồn tại trên hệ thống/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /xem lịch sử đơn/i })).toBeInTheDocument();

    // Bản ghi đơn chờ đã bị xóa sạch khỏi localStorage, giỏ hàng vẫn còn nguyên
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
  });

  // 13. Mở lại trang và đơn chờ bị 404 qua tra cứu: Tự động xóa đơn chờ, báo lỗi và giữ nguyên giỏ hàng
  it('13. Mở lại trang và đơn chờ bị 404 khi tra cứu: Tự động xóa đơn chờ, ở lại bước đặt đơn và giữ nguyên giỏ hàng', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-check-404',
      orderNumber: 1045,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-check-404',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock getOrderByIdApi trả về 404
    vi.mocked(ordersService.getOrderByIdApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Không tìm thấy đơn hàng')
    );

    renderCheckout();

    await waitFor(() => {
      expect(
        screen.getByText(/đơn hàng trước đó không còn tồn tại trên hệ thống. vui lòng tiến hành đặt lại/i)
      ).toBeInTheDocument();
    });

    // Đơn chờ bị dọn dẹp, giỏ hàng giữ nguyên
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
  });

  // 14. Gặp lỗi 500 khi thanh toán: BẮT BUỘC GIỮ NGUYÊN đơn chờ và Idempotency-Key
  it('14. Lỗi máy chủ 500: BẮT BUỘC GIỮ NGUYÊN đơn chờ và Idempotency-Key để khách thử lại', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-server-500',
      orderNumber: 1500,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-server-500-key',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValue({
      id: 'order-server-500',
      orderNumber: 1500,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(500, 'Internal Server Error')
    );

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tiếp tục thanh toán/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/máy chủ đang gặp sự cố tạm thời/i)).toBeInTheDocument();
    expect(screen.queryByText(/Internal Server Error/i)).not.toBeInTheDocument();

    const sentKey = vi.mocked(ordersService.payOrderApi).mock.calls[0][1];

    // Đơn chờ VẪN CÒN NGUYÊN trong storage với đúng key đã gửi
    const stored = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.orderId).toBe('order-server-500');
    expect(parsed.idempotencyKey).toBe(sentKey);
  });

  // 15. Kịch bản F5 rồi thanh toán tiếp thành công với CÙNG id đơn
  it('15. Kịch bản F5: Mở lại trang (?orderId=...) hiện bước chọn ví và thanh toán tiếp thành công với CÙNG id đơn', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const targetOrderId = 'order-f5-success-888';
    const targetOrderNumber = 1888;

    const pendingOrder: PendingOrderRecord = {
      orderId: targetOrderId,
      orderNumber: targetOrderNumber,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-f5-success-key',
      createdAt: new Date().toISOString(),
      itemCount: 1,
      createdFromCart: true,
    };
    savePendingOrder(pendingOrder);
    mockSearchParams = new URLSearchParams(`orderId=${targetOrderId}`);

    // Mock getOrderByIdApi trả về đơn PENDING
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: targetOrderId,
      orderNumber: targetOrderNumber,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Mock payOrderApi thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-f5-success',
      orderId: targetOrderId,
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: targetOrderId,
        orderNumber: targetOrderNumber,
        status: 'PAID',
      },
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // F5 vào Cách A (chọn ví + nút Thanh toán bằng QR)
    expect(screen.getByText('#1888')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thanh toán bằng qr/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Chờ màn hình thành công
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1888').length).toBeGreaterThanOrEqual(1);

    expect(ordersService.payOrderApi).toHaveBeenCalledWith(
      { orderId: targetOrderId, method: 'WALLET', accountNumber: '0900000001' },
      expect.any(String)
    );

    // Đơn chờ và giỏ hàng được dọn sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  // 16. Xử lý lỗi 409 khi thanh toán: kiểm tra lại đơn qua getOrderByIdApi
  it('16. Thanh toán gặp 409: Nếu đơn đã PAID qua tra cứu thì tự động chuyển sang màn hình thành công', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-409-paid',
      orderNumber: 1409,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-409-key',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);
    mockSearchParams = new URLSearchParams('orderId=order-409-paid');

    // Lần 1: Trên mount tra cứu thấy đơn PENDING -> vào bước thanh toán
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-409-paid',
      orderNumber: 1409,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // payOrderApi trả về 409
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(409, 'Đơn hàng không ở trạng thái cho phép thanh toán')
    );

    // Lần 2: Sau 409, tra cứu lại thấy đơn đã PAID
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-409-paid',
      orderNumber: 1409,
      status: 'PAID',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('#1409')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1409').length).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 17. POST /payments trả 400: Giao diện hiển thị câu tiếng Việt, KHÔNG hiển thị chuỗi tiếng Anh của server
  it('17. POST /payments trả 400: Giao diện hiển thị thông báo tiếng Việt, KHÔNG hiển thị chuỗi tiếng Anh của server', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-400-test',
      orderNumber: 1400,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-400-key',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);
    mockSearchParams = new URLSearchParams('orderId=order-400-test');

    // Mock getOrderByIdApi lần 1 trên mount: trả về PENDING
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-400-test',
      orderNumber: 1400,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Mock payOrderApi trả về lỗi 400 với message tiếng Anh từ server
    const serverEnglishMessage =
      'accountNumber must be a valid numeric string between 8 and 19 characters';
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(400, serverEnglishMessage, {
        errorData: {
          statusCode: 400,
          message: [serverEnglishMessage],
          error: 'Bad Request',
        },
      })
    );

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('#1400')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // KẾT QUẢ KỲ VỌNG:
    // 1. Giao diện hiển thị câu thông báo tiếng Việt
    expect(screen.getByText(/yêu cầu thanh toán không hợp lệ\. vui lòng thử lại\./i)).toBeInTheDocument();

    // 2. KHÔNG hiển thị chuỗi tiếng Anh của server trên màn hình
    expect(screen.queryByText(new RegExp(serverEnglishMessage, 'i'))).not.toBeInTheDocument();
    expect(screen.queryByText(/accountNumber/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bad Request/i)).not.toBeInTheDocument();
  });

  // 18. Mở lại trang khi đơn chờ thuộc người dùng khác (GET /orders/:id trả 404): Xóa đơn chờ, về bước đặt đơn, giữ giỏ
  it('18. Mở lại trang khi đơn chờ thuộc người dùng khác (GET /orders/:id trả 404): Xóa đơn chờ, về bước đặt đơn, giữ giỏ', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const otherUserPendingOrder: PendingOrderRecord = {
      orderId: 'order-belonging-to-other-user-404',
      orderNumber: 1999,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-other-user-key',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(otherUserPendingOrder);

    // Mock getOrderByIdApi trả về 404 (đơn của người khác hoặc không tìm thấy)
    vi.mocked(ordersService.getOrderByIdApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Không tìm thấy đơn hàng')
    );

    renderCheckout();

    // KẾT QUẢ KỲ VỌNG:
    // 1. Hiển thị thông báo tiếng Việt rõ ràng
    await waitFor(() => {
      expect(
        screen.getByText(/đơn hàng trước đó không còn tồn tại trên hệ thống. vui lòng tiến hành đặt lại/i)
      ).toBeInTheDocument();
    });

    // 2. Đã chuyển về bước 1 (đặt đơn hàng), có nút "Đặt đơn hàng"
    expect(screen.getByRole('button', { name: /đặt đơn hàng/i })).toBeInTheDocument();

    // 3. Đơn chờ không hợp lệ đã bị xóa sạch khỏi localStorage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();

    // 4. Giỏ hàng VẪN NGUYÊN VẸN, món vẫn còn trên giao diện
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
  });

  // 19. Giỏ có nhiều món + đang có pendingOrder cũ (GET /orders/:id trả về PENDING) -> /checkout hiện Bước 1 với đủ các món, không tự nhảy sang Bước 2
  it('19. Giỏ có nhiều món + đang có pendingOrder cũ: /checkout hiện Bước 1 với đủ các món và banner nhắc đơn chờ, KHÔNG tự động nhảy sang Bước 2', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));

    const threeCartItems: CartItem[] = [
      {
        id: 'cart-item-1',
        productId: 'prod-1',
        name: 'Trà đào cam sả',
        imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
        size: 'S',
        sugarLevel: 'P100',
        iceLevel: 'NORMAL',
        toppings: [],
        note: '',
        unitPrice: 39000,
        quantity: 1,
      },
      {
        id: 'cart-item-2',
        productId: 'prod-2',
        name: 'Cà phê sữa đá',
        imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
        size: 'M',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        toppings: [],
        note: '',
        unitPrice: 35000,
        quantity: 1,
      },
      {
        id: 'cart-item-3',
        productId: 'prod-3',
        name: 'Bánh Croissant',
        imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
        toppings: [],
        note: '',
        unitPrice: 30000,
        quantity: 1,
      },
    ];
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(threeCartItems));

    // Có đơn chờ cũ #1008 chỉ 1 món 39.000đ trong localStorage
    const oldPendingOrder: PendingOrderRecord = {
      orderId: 'order-old-1008',
      orderNumber: 1008,
      totalAmount: 39000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-old-1008',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(oldPendingOrder);

    // Server trả về đơn #1008 vẫn đang PENDING
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-old-1008',
      orderNumber: 1008,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 39000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Vào /checkout từ giỏ hàng (KHÔNG có ?orderId= trên URL)
    renderCheckout();

    await waitFor(() => {
      expect(ordersService.getOrderByIdApi).toHaveBeenCalledWith('order-old-1008');
    });

    // Vẫn ở Bước 1/2: Đặt đơn với đầy đủ 3 món trong giỏ (tổng 104.000 đ)
    expect(screen.getByText('Bước 1/2: Đặt đơn')).toBeInTheDocument();
    expect(screen.getByText('Trà đào cam sả')).toBeInTheDocument();
    expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    expect(screen.getByText('Bánh Croissant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đặt đơn hàng \(104\.000\s*đ\)/i })).toBeInTheDocument();

    // Đồng thời hiện banner nhắc đơn chờ #1008 kèm nút "Tiếp tục thanh toán"
    expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1008/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tiếp tục thanh toán/i })).toBeInTheDocument();

    // Không tự động nhảy sang Bước 2
    expect(screen.queryByText('Bước 2/2: Thanh toán')).not.toBeInTheDocument();
  });

  // 20. F5 ở Bước 2 (URL có ?orderId=) hoặc đổi trình duyệt (không có pendingOrder trong localStorage) vẫn giữ nguyên Bước 2 và tự sinh Idempotency-Key mới nếu thiếu
  // 20. Mở /checkout?orderId=... khi không có pendingOrder vẫn vào Bước 2 (Cách A: chọn ví + Thanh toán bằng QR) và sinh Idempotency-Key mới
  it('20. Mở /checkout?orderId=... khi không có pendingOrder trong localStorage vẫn vào thẳng Bước 2 và tự sinh Idempotency-Key mới', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    // Giỏ có món nhưng URL có ?orderId=order-url-2020 và localStorage KHÔNG có pendingOrder
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));
    mockSearchParams = new URLSearchParams('orderId=order-url-2020');

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-url-2020',
      orderNumber: 2020,
      status: 'PENDING',
      receiveType: 'TAKE_AWAY',
      totalAmount: 55000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-2020',
      orderId: 'order-url-2020',
      amount: 55000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-url-2020',
        orderNumber: 2020,
        status: 'PAID',
      },
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Nhảy thẳng vào Bước 2 của đơn #2020 (Cách A)
    expect(screen.getByText('Bước 2/2: Thanh toán')).toBeInTheDocument();
    expect(screen.getByText('#2020')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const generatedKey = vi.mocked(ordersService.payOrderApi).mock.calls[0][1];
    expect(typeof generatedKey).toBe('string');
    expect((generatedKey as string).length).toBeGreaterThanOrEqual(8);
  });

  // 21. Thanh toán thành công đơn cũ (vào bằng /checkout?orderId=... từ /orders/[id]) khi giỏ đang có món khác -> GIỮ NGUYÊN giỏ hàng, không xóa giỏ
  it('21. Thanh toán thành công đơn cũ qua /checkout?orderId=...: Giữ nguyên các món đang có trong giỏ hàng, chỉ xóa pendingOrder', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    const currentCartJson = JSON.stringify([mockCartItem]);
    localStorage.setItem(CART_STORAGE_KEY, currentCartJson);

    // Giả lập người dùng bấm "Thanh toán" từ /orders/[id] cho đơn cũ #1002
    const oldOrderRecord: PendingOrderRecord = {
      orderId: 'old-order-from-history-1002',
      orderNumber: 1002,
      totalAmount: 29000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-retry-old-1002',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(oldOrderRecord);
    mockSearchParams = new URLSearchParams('orderId=old-order-from-history-1002');

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'old-order-from-history-1002',
      orderNumber: 1002,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 29000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-old-1002',
      orderId: 'old-order-from-history-1002',
      amount: 29000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'old-order-from-history-1002',
        orderNumber: 1002,
        status: 'PAID',
      },
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Bước 2/2: Thanh toán')).toBeInTheDocument();
    expect(screen.getByText('#1002')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1002').length).toBeGreaterThanOrEqual(1);

    // pendingOrder đã được dọn sạch nhưng GIỎ HÀNG HIỆN TẠI VẪN CÒN NGUYÊN
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(currentCartJson);
  });

  // 22. Thanh toán đơn cũ #1015 qua ?orderId, sau đó điều hướng lại /checkout (không ?orderId) với giỏ 2 món -> Reset về Bước 1 đủ 2 món, giỏ không bị xóa
  it('22. Thanh toán đơn cũ qua ?orderId rồi vào lại /checkout (không ?orderId) khi giỏ có 2 món: Reset về Bước 1 với đủ 2 món và KHÔNG xóa giỏ hàng', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));

    const twoCartItems: CartItem[] = [
      {
        id: 'cart-22-1',
        productId: 'prod-22-1',
        name: 'Trà đào cam sả',
        imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
        size: 'S',
        sugarLevel: 'P100',
        iceLevel: 'NORMAL',
        toppings: [],
        note: '',
        unitPrice: 39000,
        quantity: 1,
      },
      {
        id: 'cart-22-2',
        productId: 'prod-22-2',
        name: 'Cà phê đen đá',
        imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
        size: 'S',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        toppings: [],
        note: '',
        unitPrice: 29000,
        quantity: 1,
      },
    ];
    const twoItemsJson = JSON.stringify(twoCartItems);
    localStorage.setItem(CART_STORAGE_KEY, twoItemsJson);

    // Bước (4): Mở từ /orders/[id] để thanh toán đơn cũ #1015 (30.000đ) qua ?orderId=order-1015
    savePendingOrder({
      orderId: 'order-1015',
      orderNumber: 1015,
      totalAmount: 30000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-order-1015',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    });
    mockSearchParams = new URLSearchParams('orderId=order-1015');

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-1015',
      orderNumber: 1015,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 30000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-1015',
      orderId: 'order-1015',
      amount: 30000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-1015',
        orderNumber: 1015,
        status: 'PAID',
      },
    });

    const { rerender } = renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Bước 2/2: Thanh toán')).toBeInTheDocument();
    expect(screen.getByText('#1015')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Đã hiện màn thành công của đơn #1015, pendingOrder bị xóa, giỏ 2 món vẫn còn
    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1015').length).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(twoItemsJson);

    // Bước (5): Điều hướng client-side quay lại /checkout (không có ?orderId), component giữ state cũ trước khi effect chạy
    mockSearchParams = new URLSearchParams();
    rerender(
      <AuthProvider>
        <CartProvider>
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Phải tự động reset về Bước 1/2: Đặt đơn với đủ 2 món (68.000đ), KHÔNG hiện màn thành công cũ và KHÔNG xóa giỏ
    expect(screen.getByText('Bước 1/2: Đặt đơn')).toBeInTheDocument();
    expect(screen.queryByText(/thanh toán thành công!/i)).not.toBeInTheDocument();

    expect(screen.getByText('Trà đào cam sả')).toBeInTheDocument();
    expect(screen.getByText('Cà phê đen đá')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đặt đơn hàng \(68\.000\s*đ\)/i })).toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(twoItemsJson);
  });

  // 23. Tạo đơn từ giỏ ở Bước 1, F5 ở Bước 2 (mất state sessionCreatedOrderId nhưng còn cờ createdFromCart: true trong localStorage), thanh toán xong thì giỏ được xóa
  it('23. Tạo đơn từ giỏ, F5 ở Bước 2 (?orderId=...), thanh toán xong thì giỏ hàng được xóa nhờ cờ createdFromCart: true', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce({
      id: 'order-from-cart-f5',
      orderNumber: 1025,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Phiên 1: Tạo đơn ở Bước 1 -> mở màn QR
    const { unmount } = renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Cà phê muối')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /đặt đơn hàng/i }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Bước 2/2: Thanh toán')).toBeInTheDocument();
    expect(screen.getAllByText('#1025').length).toBeGreaterThanOrEqual(1);

    // Kiểm tra localStorage đã lưu cờ createdFromCart: true
    const storedAfterCreate = JSON.parse(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)!);
    expect(storedAfterCreate.orderId).toBe('order-from-cart-f5');
    expect(storedAfterCreate.createdFromCart).toBe(true);

    // Giả lập F5 tại Bước 2: unmount hoàn toàn để xóa sạch state và dọn timer (không tự thanh toán)
    unmount();
    expect(ordersService.payOrderApi).not.toHaveBeenCalled();

    mockSearchParams = new URLSearchParams('orderId=order-from-cart-f5');
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-from-cart-f5',
      orderNumber: 1025,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-from-cart-f5',
      orderId: 'order-from-cart-f5',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '0001',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-from-cart-f5',
        orderNumber: 1025,
        status: 'PAID',
      },
    });

    // Phiên 2 (sau khi F5 tại /checkout?orderId=order-from-cart-f5) -> vào Cách A
    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Bước 2/2: Thanh toán')).toBeInTheDocument();
    expect(screen.getByText('#1025')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
    expect(screen.getAllByText('#1025').length).toBeGreaterThanOrEqual(1);

    // Cả pendingOrder và giỏ hàng đều được xóa sạch nhờ cờ createdFromCart: true được bảo toàn qua F5
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  // 24. Tạo đơn gặp lỗi mạng / 5xx: Hiển thị "Không kết nối được máy chủ, vui lòng thử lại" kèm nút "Thử lại"
  it('24. Đặt đơn gặp lỗi mạng / 5xx: Hiện thông báo "Không kết nối được máy chủ, vui lòng thử lại" kèm nút "Thử lại"', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(ordersService.createOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(0, '')
    );

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(createBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Không kết nối được máy chủ, vui lòng thử lại')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^thử lại$/i })).toBeInTheDocument();
    });
  });

  // 25. Thanh toán gặp 409 khi đơn không còn thanh toán được (ví dụ đã CANCELLED): Xóa pendingOrder và hiện message tiếng Việt của server kèm nút Xem lịch sử đơn
  it('25. Thanh toán gặp 409 khi đơn không phải PAID: Xóa pendingOrder, hiện message tiếng Việt của server kèm liên kết Xem lịch sử đơn', async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-409-cancelled',
      orderNumber: 1410,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-409-cancelled-key',
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);
    mockSearchParams = new URLSearchParams('orderId=order-409-cancelled');

    // Lần 1 trên mount: đơn đang PENDING
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-409-cancelled',
      orderNumber: 1410,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    // payOrderApi trả 409 với message tiếng Việt của server
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(409, 'Đơn hàng không ở trạng thái cho phép thanh toán')
    );

    // Lần 2 tra cứu lại: đơn đã CANCELLED (không phải PAID)
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-409-cancelled',
      orderNumber: 1410,
      status: 'CANCELLED',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    renderCheckout();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('#1410')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(/đơn hàng không ở trạng thái cho phép thanh toán/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /xem lịch sử đơn/i })).toBeInTheDocument();

    // pendingOrder đã được xóa để khách không bị kẹt ở đơn cũ
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });
});
