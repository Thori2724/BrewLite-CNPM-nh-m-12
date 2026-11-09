import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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
  it('4. Đặt đơn thành công: Gọi API tạo đơn, lưu đơn chờ và chuyển sang bước Thanh toán', async () => {
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

    // Chờ chuyển sang bước 2 (Thanh toán)
    await waitFor(() => {
      expect(screen.getByText('#1001')).toBeInTheDocument();
      expect(screen.getByText(/chọn phương thức thanh toán/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ví điện tử/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/thẻ ngân hàng/i)).toBeInTheDocument();
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
      expect(screen.getAllByRole('link', { name: /quay lại giỏ hàng/i }).length).toBeGreaterThanOrEqual(1);
    });

    // Giỏ hàng vẫn còn nguyên vẹn trong storage
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    // Không lưu bản ghi đơn chờ vào storage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 6. Thanh toán thành công: Xóa ô số ví, dọn sạch giỏ hàng và đơn chờ, hiện màn hình thành công
  it('6. Thanh toán thành công: Xóa ô số ví/thẻ ngay khi gửi, dọn sạch giỏ hàng và đơn chờ, hiện màn hình thành công', async () => {
    const user = userEvent.setup();
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
    };
    savePendingOrder(pendingOrder);

    vi.mocked(ordersService.payOrderApi).mockResolvedValueOnce({
      id: 'pay-success-1',
      orderId: 'order-pending-1',
      amount: 90000,
      method: 'WALLET',
      accountLast4: '5678',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-1',
        orderNumber: 1005,
        status: 'PAID',
      },
    });

    renderCheckout();

    // Thấy banner đơn chờ và bấm Tiếp tục thanh toán
    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1005/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // Vào bước thanh toán
    await waitFor(() => {
      expect(screen.getByText(/số ví điện tử/i)).toBeInTheDocument();
    });

    const accInput = screen.getByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Hiện màn hình chúc mừng thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#1005')).toBeInTheDocument();
      expect(screen.getByText(/•••• 5678/i)).toBeInTheDocument();
    });

    // Đơn chờ và giỏ hàng đã bị xóa sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 7. Thanh toán thất bại (status FAILED) -> Thử lại với số khác thì BẮT BUỘC DÙNG KEY MỚI
  it('7. Thanh toán bị từ chối (status FAILED): Giữ orderId, nhập số khác thử lại thì sinh Idempotency-Key MỚI và thành công', async () => {
    const user = userEvent.setup();
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

    // Lần 1: Giả lập server trả status FAILED
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
      accountLast4: '5678',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-2',
        orderNumber: 1007,
        status: 'PAID',
      },
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1007/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // LẦN 1: Nhập số kết thúc bằng 0000
    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12340000');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Hiện thông báo lỗi lần 1 và nút đổi thành "Thử lại thanh toán"
    await waitFor(() => {
      expect(screen.getByText(/lỗi thanh toán:/i)).toBeInTheDocument();
      expect(screen.getByText(/giao dịch bị từ chối/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /thử lại thanh toán/i })).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const firstCallKey = vi.mocked(ordersService.payOrderApi).mock.calls[0][1];

    // LẦN 2: Nhập số khác và bấm Xác nhận thanh toán
    await user.type(accInput, '12345678');
    await user.click(payBtn);

    // Chờ thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#1007')).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const secondCallKey = vi.mocked(ordersService.payOrderApi).mock.calls[1][1];

    // KIỂM TRA QUY TẮC IDEMPOTENCY: Request thứ hai BẮT BUỘC có key KHÁC request đầu
    expect(secondCallKey).not.toBe(firstCallKey);
    expect(secondCallKey).toBeDefined();
  });

  // 8. Lỗi mạng / timeout -> Thử lại với cùng số thì BẮT BUỘC DÙNG CÙNG KEY
  it('8. Lỗi mạng / timeout: Thử lại với cùng số tài khoản thì BẮT BUỘC DÙNG CÙNG KEY', async () => {
    const user = userEvent.setup();
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
      accountLast4: '5678',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: 'order-pending-9',
        orderNumber: 1009,
        status: 'PAID',
      },
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1009/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    // LẦN 1: Nhập số hợp lệ
    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Báo lỗi mạng
    await waitFor(() => {
      expect(screen.getByText(/không thể kết nối đến máy chủ/i)).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(1);
    const call1Key = vi.mocked(ordersService.payOrderApi).mock.calls[0][1];

    // LẦN 2: Nhập lại CÙNG số đó và bấm Thử lại
    await user.type(accInput, '12345678');
    await user.click(payBtn);

    // Thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#1009')).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledTimes(2);
    const call2Key = vi.mocked(ordersService.payOrderApi).mock.calls[1][1];

    // Sau lỗi mạng thử lại cùng số -> BẮT BUỘC DÙNG CÙNG KEY
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

  // 10. Đơn chờ đã hoàn tất thanh toán từ trước (PAID)
  it('10. Đơn chờ đã hoàn tất thanh toán từ trước (PAID): Mở lại trang tự động dọn dẹp đơn chờ, giỏ hàng và chuyển sang màn hình thành công', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

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

    renderCheckout();

    // Tự động chuyển sang màn hình thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#1020')).toBeInTheDocument();
    });

    // Đơn chờ và giỏ hàng đã được xóa sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
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

  // 12. Thanh toán gặp lỗi 404 (Không tìm thấy đơn): Xóa đơn chờ, quay về bước đặt đơn, hiện thông báo rõ ràng và giữ nguyên giỏ hàng
  it('12. Thanh toán gặp 404: Xóa bản ghi đơn chờ, quay về bước đặt đơn, báo lỗi rõ ràng và giữ nguyên giỏ hàng', async () => {
    const user = userEvent.setup();
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

    // Mock API thanh toán trả về lỗi 404
    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Không tìm thấy đơn hàng')
    );

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText(/bạn có đơn hàng đang chờ thanh toán: #1044/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Quay về bước 1 (đặt đơn hàng), hiện nút "Đặt đơn hàng"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /đặt đơn hàng/i })).toBeInTheDocument();
      expect(
        screen.getByText(/đơn hàng trước đó không còn tồn tại trên hệ thống. vui lòng tiến hành đặt lại/i)
      ).toBeInTheDocument();
    });

    // Bản ghi đơn chờ đã bị xóa sạch khỏi localStorage
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();

    // Giỏ hàng VẪN NGUYÊN VẸN, không bị xóa
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByText('Cà phê muối')).toBeInTheDocument();
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
    const user = userEvent.setup();
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

    vi.mocked(ordersService.payOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(500, 'Internal Server Error')
    );

    renderCheckout();

    const resumeBtn = await screen.findByRole('button', { name: /tiếp tục thanh toán/i });
    await user.click(resumeBtn);

    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

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

  // 15. Kịch bản F5 rồi thanh toán tiếp thành công với CÙNG id đơn
  it('15. Kịch bản F5: Mở lại trang và thanh toán tiếp thành công với CÙNG id đơn', async () => {
    const user = userEvent.setup();
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
    };
    savePendingOrder(pendingOrder);

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
      accountLast4: '5678',
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      order: {
        id: targetOrderId,
        orderNumber: targetOrderNumber,
        status: 'PAID',
      },
    });

    renderCheckout();

    // F5 tự động đồng bộ và vào thẳng bước thanh toán
    await waitFor(() => {
      expect(screen.getByText('#1888')).toBeInTheDocument();
    });

    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // Chờ màn hình thành công
    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#1888')).toBeInTheDocument();
    });

    expect(ordersService.payOrderApi).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: targetOrderId, method: 'WALLET' }),
      'idemp-f5-success-key'
    );

    // Đơn chờ và giỏ hàng được dọn sạch
    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 16. Xử lý lỗi 409 khi thanh toán: kiểm tra lại đơn qua getOrderByIdApi
  it('16. Thanh toán gặp 409: Nếu đơn đã PAID qua tra cứu thì tự động chuyển sang màn hình thành công', async () => {
    const user = userEvent.setup();
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

    await waitFor(() => {
      expect(screen.getByText('#1409')).toBeInTheDocument();
    });

    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getByText('#1409')).toBeInTheDocument();
    });

    expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
  });

  // 17. POST /payments trả 400: Giao diện hiển thị câu tiếng Việt, KHÔNG hiển thị chuỗi tiếng Anh của server
  it('17. POST /payments trả 400: Giao diện hiển thị thông báo tiếng Việt, KHÔNG hiển thị chuỗi tiếng Anh của server', async () => {
    const user = userEvent.setup();
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

    // Mock getOrderByIdApi lần 1 trên mount: trả về PENDING -> vào bước thanh toán
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

    await waitFor(() => {
      expect(screen.getByText('#1400')).toBeInTheDocument();
    });

    const accInput = await screen.findByPlaceholderText(/nhập số ví điện tử/i);
    await user.type(accInput, '12345678');

    const payBtn = screen.getByRole('button', { name: /xác nhận thanh toán/i });
    await user.click(payBtn);

    // KẾT QUẢ KỲ VỌNG:
    // 1. Giao diện hiển thị câu thông báo tiếng Việt
    await waitFor(() => {
      expect(screen.getByText(/lỗi thanh toán:/i)).toBeInTheDocument();
      expect(
        screen.getByText(/số tài khoản không hợp lệ \(chỉ gồm 8 đến 19 chữ số\)/i)
      ).toBeInTheDocument();
    });

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
});
