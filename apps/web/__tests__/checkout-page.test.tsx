import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    fullName: 'Nguyễn Văn A',
    role: 'CUSTOMER' as const,
  },
};

describe('Giao diện và luồng xử lý trang Checkout (/checkout)', () => {
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
      new Error('No mock order by id')
    );
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
    // Không lưu token trong localStorage
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

  // 3. Hiển thị thông tin đặt hàng & Validate số điện thoại
  it('3. Đã đăng nhập và có món: Hiển thị tóm tắt đơn, họ tên từ tài khoản và validate số điện thoại', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    renderCheckout();

    // Chờ nạp trang
    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Nguyễn Văn A')).toBeInTheDocument();
    });

    // Bấm Đặt đơn khi chưa nhập số điện thoại -> Báo lỗi validate
    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    expect(screen.getByText(/vui lòng nhập số điện thoại nhận hàng/i)).toBeInTheDocument();
    expect(ordersService.createOrderApi).not.toHaveBeenCalled();

    // Nhập số điện thoại sai định dạng (chỉ 4 số)
    const phoneInput = screen.getByLabelText(/số điện thoại nhận hàng/i);
    await user.type(phoneInput, '1234');
    await user.click(submitBtn);

    expect(
      screen.getByText(/số điện thoại không hợp lệ \(cần 10 chữ số/i)
    ).toBeInTheDocument();
    expect(ordersService.createOrderApi).not.toHaveBeenCalled();
  });

  // 4. Tạo đơn thành công -> Lưu đơn chờ và chuyển sang bước thanh toán
  it('4. Đặt đơn thành công: Gọi API tạo đơn, lưu đơn chờ và chuyển sang bước Thanh toán', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    // Giả lập server tạo đơn thành công
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce({
      id: 'order-mock-888',
      orderNumber: '#BL-8888',
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      subtotal: 90000,
      discountAmount: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      items: [],
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    // Nhập số điện thoại hợp lệ
    const phoneInput = screen.getByLabelText(/số điện thoại nhận hàng/i);
    await user.type(phoneInput, '0901234567');

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    // Chờ chuyển sang bước 2 (Thanh toán)
    await waitFor(() => {
      expect(screen.getByText('#BL-8888')).toBeInTheDocument();
      expect(screen.getByText(/chọn phương thức thanh toán/i)).toBeInTheDocument();
    });

    // Kiểm tra đơn chờ đã được lưu vào localStorage (và không chứa số tài khoản)
    const storedPending = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    expect(storedPending).not.toBeNull();
    const parsed = JSON.parse(storedPending!);
    expect(parsed.orderId).toBe('order-mock-888');
    expect(parsed.orderNumber).toBe('#BL-8888');
    expect(parsed.idempotencyKey).toBeDefined();
  });

  // 5. Tạo đơn thất bại do hết hàng 409
  it('5. Hết hàng (409): Hiển thị danh sách món hết hàng, giữ nguyên giỏ hàng và không tạo đơn chờ sai', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    // Giả lập server báo lỗi 409
    const outOfStockErr = new ordersService.OrderApiError(
      409,
      'Một số món trong giỏ hàng hiện đã hết hàng hoặc không đủ số lượng',
      { outOfStockItems: ['Cà phê muối'] }
    );
    vi.mocked(ordersService.createOrderApi).mockRejectedValueOnce(outOfStockErr);

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
    });

    const phoneInput = screen.getByLabelText(/số điện thoại nhận hàng/i);
    await user.type(phoneInput, '0901234567');

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/một số món trong giỏ hàng hiện đã hết hàng/i)).toBeInTheDocument();
      expect(screen.getByText(/về giỏ hàng để chỉnh sửa món/i)).toBeInTheDocument();
    });

    // Giỏ hàng vẫn còn nguyên vẹn trong storage
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    // Không lưu bản ghi đơn chờ sai vào storage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 6. Thanh toán thành công: Xóa sạch input nhạy cảm, xóa giỏ hàng và đơn chờ
  it('6. Thanh toán thành công: Xóa ô số ví, dọn sạch giỏ hàng và đơn chờ, hiện màn hình thành công', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    // Lưu sẵn một đơn chờ để component vào thẳng bước thanh toán khi bấm Tiếp tục
    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-pending-1',
      orderNumber: '#BL-9999',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-test-6',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock API thanh toán thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-1',
      orderId: 'order-pending-1',
      amount: 90000,
      method: 'E_WALLET',
      status: 'SUCCESS',
      orderStatus: 'PAID',
      idempotencyKey: 'idemp-key-test-6',
      gatewayRef: 'GW-MOCK-999',
      createdAt: new Date().toISOString(),
    });

    renderCheckout();

    // Thấy banner đơn chờ và bấm Tiếp tục thanh toán
    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #BL-9999/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // Vào bước thanh toán
    await waitFor(() => {
      expect(screen.getByText(/số ví điện tử/i)).toBeInTheDocument();
    });

    // Nhập số ví điện tử hợp lệ (10 số)
    const accInput = screen.getByPlaceholderText(/nhập số điện thoại ví điện tử/i);
    await user.type(accInput, '0901234567');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Hiện màn hình chúc mừng thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('GW-MOCK-999')).toBeInTheDocument();
    });

    // Đơn chờ và giỏ hàng đã bị xóa sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 7. Thanh toán thất bại rõ ràng (đuôi 0) -> Thử lại với số khác thì BẮT BUỘC DÙNG KEY MỚI
  it('7. Thanh toán bị từ chối rõ ràng: Nhập số khác thử lại thì sinh Idempotency-Key MỚI và thành công', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-pending-2',
      orderNumber: '#BL-7777',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-test-7-initial',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Lần 1: Giả lập bị từ chối
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(
        402,
        'Giao dịch bị từ chối bởi cổng thanh toán. Vui lòng kiểm tra lại tài khoản.'
      )
    );

    // Lần 2: Thử lại với số khác thì thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-retry-2',
      orderId: 'order-pending-2',
      amount: 90000,
      method: 'E_WALLET',
      status: 'SUCCESS',
      orderStatus: 'PAID',
      idempotencyKey: 'key-will-be-checked-later',
      gatewayRef: 'GW-MOCK-RETRY-7777',
      createdAt: new Date().toISOString(),
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #BL-7777/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // LẦN 1: Nhập số ví kết thúc bằng chữ số 0 (bị từ chối)
    const accInput = await screen.findByPlaceholderText(/nhập số điện thoại ví điện tử/i);
    await user.type(accInput, '0901234560');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Hiện thông báo lỗi lần 1
    await waitFor(() => {
      expect(screen.getByText(/lỗi thanh toán:/i)).toBeInTheDocument();
      expect(
        screen.getByText(/giao dịch bị từ chối bởi cổng thanh toán/i)
      ).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const firstCallKey = vi.mocked(ordersService.payOrderApi).mock.calls[0][2];

    // LẦN 2: Nhập số ví khác hợp lệ và bấm Xác nhận thanh toán
    await user.type(accInput, '0901234567');
    await user.click(payBtn);

    // Chờ thanh toán thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('GW-MOCK-RETRY-7777')).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const secondCallKey = vi.mocked(ordersService.payOrderApi).mock.calls[1][2];

    // KIỂM TRA QUY TẮC IDEMPOTENCY: Request thứ hai BẮT BUỘC có key KHÁC request đầu
    expect(secondCallKey).not.toBe(firstCallKey);
    expect(secondCallKey).toBeDefined();
    expect(secondCallKey.length).toBeGreaterThan(10);
  });

  // 8. Đơn chờ quá hạn khi mở trang
  it('8. Đơn chờ trước đó đã hết hạn (> 15 phút): Tự động dọn dẹp và hiển thị thông báo quá hạn', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    // Lưu đơn đã quá hạn 10 phút trước
    const expiredOrder: PendingOrderRecord = {
      orderId: 'order-old-1',
      orderNumber: '#BL-1111',
      totalAmount: 50000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-expired',
      expiresAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      itemCount: 1,
    };
    savePendingOrder(expiredOrder);

    renderCheckout();

    await waitFor(() => {
      expect(
        screen.getByText(/đơn hàng trước đó của bạn đã quá thời hạn 15 phút và đã tự động bị hủy/i)
      ).toBeInTheDocument();
    });

    // Đơn cũ đã bị xóa sạch khỏi storage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 9. Lỗi mạng / timeout -> Thử lại với cùng số thì BẮT BUỘC DÙNG CÙNG KEY
  it('9. Lỗi mạng / timeout: Thử lại với cùng số tài khoản thì BẮT BUỘC DÙNG CÙNG KEY', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-pending-9',
      orderNumber: '#BL-9990',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-key-network-retry-test',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Lần 1: Ném lỗi mạng (status 0)
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(0, 'Không thể kết nối đến máy chủ. Vui lòng thử lại.')
    );

    // Lần 2: Thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-same-key',
      orderId: 'order-pending-9',
      amount: 90000,
      method: 'E_WALLET',
      status: 'SUCCESS',
      orderStatus: 'PAID',
      idempotencyKey: 'idemp-key-network-retry-test',
      gatewayRef: 'GW-NETWORK-SUCCESS-999',
      createdAt: new Date().toISOString(),
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #BL-9990/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // LẦN 1: Nhập số ví hợp lệ
    const accInput = await screen.findByPlaceholderText(/nhập số điện thoại ví điện tử/i);
    await user.type(accInput, '0901234567');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Báo lỗi mạng
    await waitFor(() => {
      expect(screen.getByText(/không thể kết nối đến máy chủ/i)).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const call1Key = vi.mocked(ordersService.payOrderApi).mock.calls[0][2];

    // LẦN 2: Nhập lại CÙNG số ví đó và bấm Thử lại
    await user.type(accInput, '0901234567');
    await user.click(payBtn);

    // Thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('GW-NETWORK-SUCCESS-999')).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const call2Key = vi.mocked(ordersService.payOrderApi).mock.calls[1][2];

    // KIỂM TRA QUY TẮC IDEMPOTENCY: Sau lỗi mạng thử lại cùng số -> BẮT BUỘC DÙNG CÙNG KEY
    expect(call2Key).toBe(call1Key);
  });

  // 10. Chống bấm đúp (Debounce / Khóa submit)
  it('10. Chống bấm đúp: Bấm liên tiếp nút Đặt đơn chỉ gửi đúng 1 request API tạo đơn', async () => {
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

    const phoneInput = screen.getByLabelText(/số điện thoại nhận hàng/i);
    await user.type(phoneInput, '0901234567');

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
      orderNumber: '#BL-1234',
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      subtotal: 90000,
      discountAmount: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      items: [],
    });

    await waitFor(() => {
      expect(screen.getByText('#BL-1234')).toBeInTheDocument();
    });
  });

  // 11. Đơn chờ đã hoàn tất thanh toán từ trước (PAID)
  it('11. Đơn chờ đã hoàn tất thanh toán từ trước (PAID): Mở lại trang tự động dọn dẹp đơn chờ, giỏ hàng và chuyển sang màn hình thành công', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-already-paid',
      orderNumber: '#BL-PAID-999',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-paid-test',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock getOrderByIdApi trả về đơn hàng có trạng thái PAID
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-already-paid',
      orderNumber: '#BL-PAID-999',
      status: 'PAID',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      subtotal: 90000,
      discountAmount: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      items: [],
    });

    renderCheckout();

    // Tự động chuyển sang màn hình thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#BL-PAID-999')).toBeInTheDocument();
    });

    // Đơn chờ và giỏ hàng đã được xóa sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  // 12. Gặp lỗi 401 giữa chừng
  it('12. Gặp lỗi 401 giữa chừng khi tạo đơn: Tự động chuyển hướng về /login kèm expired=true', async () => {
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

    const phoneInput = screen.getByLabelText(/số điện thoại nhận hàng/i);
    await user.type(phoneInput, '0901234567');

    const submitBtn = screen.getByRole('button', { name: /đặt đơn hàng/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?redirect=%2Fcheckout&expired=true');
    });
  });

  // 13. Thanh toán gặp lỗi 404 (Không tìm thấy đơn): Xóa đơn chờ, quay về bước đặt đơn, hiện thông báo rõ ràng và giữ nguyên giỏ hàng
  it('13. Thanh toán gặp 404: Xóa bản ghi đơn chờ, quay về bước đặt đơn, báo lỗi rõ ràng và giữ nguyên giỏ hàng', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-not-found-404',
      orderNumber: '#BL-4044',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-404-test',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock API thanh toán trả về lỗi 404
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Không tìm thấy thông tin đơn hàng')
    );

    renderCheckout();

    // Thấy banner đơn chờ và bấm Tiếp tục thanh toán
    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #BL-4044/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // Nhập số ví và bấm Xác nhận thanh toán
    const accInput = await screen.findByPlaceholderText(/nhập số điện thoại ví điện tử/i);
    await user.type(accInput, '0901234567');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // KẾT QUẢ KỲ VỌNG:
    // 1. Quay về bước 1 (đặt đơn hàng), hiện nút "Đặt đơn hàng"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /đặt đơn hàng/i })).toBeInTheDocument();
      expect(
        screen.getByText(/đơn hàng trước đó không còn tồn tại trên hệ thống. vui lòng tiến hành đặt lại/i)
      ).toBeInTheDocument();
    });

    // 2. Bản ghi đơn chờ đã bị xóa sạch khỏi localStorage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();

    // 3. Giỏ hàng VẪN NGUYÊN VẸN, không bị xóa
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
  });

  // 14. Mở lại trang và đơn chờ bị 404 qua tra cứu: Tự động xóa đơn chờ, báo lỗi và giữ nguyên giỏ hàng
  it('14. Mở lại trang và đơn chờ bị 404 khi tra cứu: Tự động xóa đơn chờ, ở lại bước đặt đơn và giữ nguyên giỏ hàng', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-check-404',
      orderNumber: '#BL-CHECK-404',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-check-404',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
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

  // 15. Gặp lỗi 500 khi thanh toán: BẮT BUỘC GIỮ NGUYÊN đơn chờ và Idempotency-Key
  it('15. Lỗi máy chủ 500: BẮT BUỘC GIỮ NGUYÊN đơn chờ và Idempotency-Key để khách thử lại', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const pendingOrder: PendingOrderRecord = {
      orderId: 'order-server-500',
      orderNumber: '#BL-500',
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-server-500-key',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock payOrderApi trả về lỗi 500
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(500, 'Internal Server Error')
    );

    renderCheckout();

    const resumeBtn = await screen.findByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    const accInput = await screen.findByPlaceholderText(/nhập số điện thoại ví điện tử/i);
    await user.type(accInput, '0901234567');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText(/máy chủ đang gặp sự cố tạm thời/i)).toBeInTheDocument();
    });

    // Đơn chờ VẪN CÒN NGUYÊN trong storage với đúng key cũ
    const stored = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.orderId).toBe('order-server-500');
    expect(parsed.idempotencyKey).toBe('idemp-server-500-key');
  });

  // 16. Kịch bản F5 rồi thanh toán tiếp thành công với CÙNG id đơn
  it('16. Kịch bản F5: Mở lại trang và thanh toán tiếp thành công với CÙNG id đơn', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const targetOrderId = 'order-f5-success-888';
    const targetOrderNumber = '#BL-F5-888';

    const pendingOrder: PendingOrderRecord = {
      orderId: targetOrderId,
      orderNumber: targetOrderNumber,
      totalAmount: 90000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'idemp-f5-success-key',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      itemCount: 1,
    };
    savePendingOrder(pendingOrder);

    // Mock getOrderByIdApi trả về đơn PENDING
    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: targetOrderId,
      orderNumber: targetOrderNumber,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      totalAmount: 90000,
      subtotal: 90000,
      discountAmount: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      items: [],
    });

    // Mock payOrderApi thành công
    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-f5-success',
      orderId: targetOrderId,
      amount: 90000,
      method: 'E_WALLET',
      status: 'SUCCESS',
      orderStatus: 'PAID',
      idempotencyKey: 'idemp-f5-success-key',
      gatewayRef: 'GW-F5-SUCCESS-888',
      createdAt: new Date().toISOString(),
    });

    renderCheckout();

    // Thấy banner đơn chờ sau khi F5
    const resumeBtn = await screen.findByRole('button', { name: /tiếp tục thanh toán/i });
    expect(screen.getByText(new RegExp(targetOrderNumber, 'i'))).toBeInTheDocument();
    await user.click(resumeBtn);

    // Nhập số ví và bấm Xác nhận thanh toán
    const accInput = await screen.findByPlaceholderText(/nhập số điện thoại ví điện tử/i);
    await user.type(accInput, '0901234567');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Chờ màn hình thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText(targetOrderNumber)).toBeInTheDocument();
      expect(screen.getByText('GW-F5-SUCCESS-888')).toBeInTheDocument();
    });

    // Đảm bảo API thanh toán được gọi với ĐÚNG CÙNG id đơn
    expect(ordersService.payOrderApi).toHaveBeenCalledWith(
      targetOrderId,
      expect.objectContaining({ method: 'E_WALLET' }),
      'idemp-f5-success-key'
    );

    // Đơn chờ và giỏ hàng được dọn sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });
});
