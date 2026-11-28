import React from 'react';
import { render, screen, waitFor, act, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckoutPage from '../app/checkout/page';
import AccountLockedNotice from '../app/components/AccountLockedNotice';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { resetRedirectFlag } from '../services/auth';
import { ApiHttpError } from '../services/auth-contract';
import { OrderResponse } from '../services/order-contract';
import { ValidatePromotionResponse } from '../services/promotions';
import * as promotionsService from '../services/promotions';
import * as loyaltyService from '../services/loyalty';
import * as ordersService from '../services/orders';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import { CART_STORAGE_KEY, CartItem } from '../utils/cart';
import { resetMockPromotionsDatabase } from '../mocks';
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

vi.mock('../services/promotions', async () => {
  const actual = await vi.importActual<typeof import('../services/promotions')>(
    '../services/promotions'
  );
  return {
    ...actual,
    validatePromotionApi: vi.fn(),
  };
});

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
    getOrderByIdApi: vi.fn(),
    payOrderApi: vi.fn(),
  };
});

const mockCartItem: CartItem = {
  id: 'cart-promo-1',
  productId: '11111111-0000-0000-0000-000000000007',
  name: 'Trà sữa truyền thống',
  imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
  size: 'M',
  sugarLevel: 'P70',
  iceLevel: 'NORMAL',
  toppings: [{ id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 }],
  note: '',
  unitPrice: 45000,
  quantity: 2, // Tạm tính = 90.000đ
};

const mockLoggedInUser = {
  token: 'mock-jwt-token-promo',
  user: {
    id: '44444444-0000-0000-0000-000000000001',
    email: 'khach@example.com',
    displayName: 'Khách demo',
    role: 'CUSTOMER' as const,
  },
};

describe('Dòng 18 - Mã giảm giá trên trang đặt đơn (/checkout)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(promotionsService.validatePromotionApi).mockReset();
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockReset();
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockResolvedValue({
      loyaltyPoints: 0,
      transactions: [],
    });
    vi.mocked(ordersService.createOrderApi).mockReset();
    vi.mocked(ordersService.getOrderByIdApi).mockReset();
    vi.mocked(ordersService.payOrderApi).mockReset();
    localStorage.clear();
    resetRedirectFlag();
    resetMockPromotionsDatabase();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.NEXT_PUBLIC_USE_MOCK_PROMOTIONS;
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
      new ordersService.OrderApiError(404, 'Không tìm thấy đơn hàng')
    );
  });

  afterEach(() => {
    cleanup();
    process.env = originalEnv;
  });

  const renderCheckout = () =>
    render(
      <AuthProvider>
        <CartProvider>
          <AccountLockedNotice />
          <CheckoutPage />
        </CartProvider>
      </AuthProvider>
    );

  it('(a) Áp dụng mã hợp lệ (BREW10): chuẩn hóa trim + in hoa, khóa nút khi đang kiểm tra, lấy discountAmount từ response và tính Tổng đúng (kể cả sàn 1.000đ)', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    let resolveValidate!: (val: ValidatePromotionResponse) => void;
    const pendingValidate = new Promise<ValidatePromotionResponse>((resolve) => {
      resolveValidate = resolve;
    });
    vi.mocked(promotionsService.validatePromotionApi).mockImplementationOnce(() => pendingValidate);

    renderCheckout();

    const promoInput = await screen.findByLabelText(/mã giảm giá/i);
    const applyBtn = screen.getByRole('button', { name: /^áp dụng$/i });

    // 1. Validate client: để trống hoặc quá 30 ký tự thì báo lỗi ngay, không gọi API
    await user.click(applyBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(/vui lòng nhập mã giảm giá/i);
    expect(promotionsService.validatePromotionApi).not.toHaveBeenCalled();

    await user.type(promoInput, 'A'.repeat(31));
    await user.click(applyBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(/tối đa 30 ký tự/i);
    expect(promotionsService.validatePromotionApi).not.toHaveBeenCalled();

    // 2. Nhập có khoảng trắng & chữ thường -> gửi code in hoa, subtotal = 90000
    await user.clear(promoInput);
    await user.type(promoInput, '  brew10  ');
    await user.click(applyBtn);

    // Đang kiểm tra -> nút bị khóa và đổi nhãn, bấm thêm không gọi lần 2
    const checkingBtn = screen.getByRole('button', { name: /đang kiểm tra/i });
    expect(checkingBtn).toBeDisabled();
    await user.click(checkingBtn);
    expect(promotionsService.validatePromotionApi).toHaveBeenCalledTimes(1);
    expect(promotionsService.validatePromotionApi).toHaveBeenCalledWith({
      code: 'BREW10',
      subtotal: 90000,
    });

    // Server trả discountAmount riêng để xác nhận FE không tự tính phần giảm
    await act(async () => {
      resolveValidate({
        code: 'BREW10',
        type: 'PERCENT',
        value: 10,
        maxDiscount: 15000,
        discountAmount: 12345,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã BREW10')).toBeInTheDocument();
    });

    // 3 dòng tóm tắt: Tạm tính / Giảm giá / Tổng (90.000 - 12.345 = 77.655đ)
    const summaryBox = screen.getByTestId('checkout-summary-box');
    expect(within(summaryBox).getByText('Tạm tính:')).toBeInTheDocument();
    expect(within(summaryBox).getByText('90.000đ')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Giảm giá:')).toBeInTheDocument();
    expect(within(summaryBox).getByText('-12.345đ')).toBeInTheDocument();
    expect(within(summaryBox).getByText('Tổng:')).toBeInTheDocument();
    expect(within(summaryBox).getByText('77.655đ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /xác nhận đặt đơn hàng \(77\.655\s*đ\)/i })
    ).toBeInTheDocument();

    // Kiểm tra sàn tối thiểu 1.000đ nếu response có discountAmount gần bằng subtotal
    await user.click(screen.getByRole('button', { name: /gỡ mã/i }));
    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'SUPER90',
      type: 'FIXED',
      value: 90000,
      maxDiscount: null,
      discountAmount: 89500,
    });
    await user.type(promoInput, 'SUPER90');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));

    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã SUPER90')).toBeInTheDocument();
      // 90.000 - 89.500 = 500 -> kẹp tối thiểu 1.000đ
      expect(within(summaryBox).getByText('1.000đ')).toBeInTheDocument();
    });
  });

  it('(b) Hiển thị đúng lỗi 404, 409, lỗi chung (400/mạng), xử lý 401 và 403 tài khoản bị khóa', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    const { unmount } = renderCheckout();

    const promoInput = await screen.findByLabelText(/mã giảm giá/i);
    const applyBtn = screen.getByRole('button', { name: /^áp dụng$/i });

    // 1. 404 Mã giảm giá không tồn tại
    vi.mocked(promotionsService.validatePromotionApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 404,
        message: 'Mã giảm giá không tồn tại',
        error: 'Not Found',
      })
    );
    await user.type(promoInput, 'KHONGCO');
    await user.click(applyBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mã giảm giá không tồn tại');
    });

    // 2. 409 Mã giảm giá đã ngừng áp dụng
    vi.mocked(promotionsService.validatePromotionApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 409,
        message: 'Mã giảm giá đã ngừng áp dụng',
        error: 'Conflict',
      })
    );
    await user.clear(promoInput);
    await user.type(promoInput, 'TAMNGUNG');
    await user.click(applyBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mã giảm giá đã ngừng áp dụng');
    });

    // 3. 400 validation mảng tiếng Anh -> thông báo tiếng Việt chung
    vi.mocked(promotionsService.validatePromotionApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 400,
        message: ['code must be shorter than or equal to 30 characters'],
        error: 'Bad Request',
      })
    );
    await user.clear(promoInput);
    await user.type(promoInput, 'BAD');
    await user.click(applyBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'
      );
    });
    expect(screen.queryByText(/must be shorter/i)).not.toBeInTheDocument();

    // 4. Lỗi mạng -> thông báo chung dễ hiểu
    vi.mocked(promotionsService.validatePromotionApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 0,
        message: 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.',
      })
    );
    await user.click(applyBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/không thể kết nối đến máy chủ/i);
    });

    // 5. 401 -> chuyển về trang đăng nhập
    vi.mocked(promotionsService.validatePromotionApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 401,
        message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
      })
    );
    await user.click(applyBtn);
    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/login?redirect=%2Fcheckout&expired=true');
    });

    unmount();

    // 6. Phiên mới gặp 403 "Tài khoản đã bị khóa" -> thông báo và tự đăng xuất
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    renderCheckout();

    const lockedPromoInput = await screen.findByLabelText(/mã giảm giá/i);
    await user.type(lockedPromoInput, 'BREW10');
    vi.mocked(promotionsService.validatePromotionApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 403,
        message: 'Tài khoản đã bị khóa',
        error: 'Forbidden',
      })
    );
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(screen.getByTestId('account-locked-notice')).toHaveTextContent(
        'Tài khoản đã bị khóa'
      );
    });
  });

  it('(c) Gỡ mã: khóa ô nhập khi đã áp mã, bấm "Gỡ mã" đưa tóm tắt về trạng thái chưa dùng mã (Giảm giá 0đ)', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'BREW10',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 15000,
      discountAmount: 9000,
    });

    renderCheckout();

    const promoInput = await screen.findByLabelText(/mã giảm giá/i);
    await user.type(promoInput, 'BREW10');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));

    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã BREW10')).toBeInTheDocument();
    });

    const summaryBox = screen.getByTestId('checkout-summary-box');
    // Mỗi đơn tối đa 1 mã: đã áp dụng mã thì ô nhập & nút Áp dụng bị khóa
    expect(promoInput).toBeDisabled();
    expect(screen.getByRole('button', { name: /^áp dụng$/i })).toBeDisabled();
    expect(within(summaryBox).getByText('-9.000đ')).toBeInTheDocument();
    expect(within(summaryBox).getByText('81.000đ')).toBeInTheDocument();

    // Bấm Gỡ mã -> quay về trạng thái chưa dùng mã
    await user.click(screen.getByRole('button', { name: /gỡ mã/i }));

    expect(screen.queryByText(/đã áp dụng mã/i)).not.toBeInTheDocument();
    expect(promoInput).not.toBeDisabled();
    expect(promoInput).toHaveValue('');
    expect(screen.getByRole('button', { name: /^áp dụng$/i })).not.toBeDisabled();
    expect(within(summaryBox).getByText('0đ')).toBeInTheDocument();
    expect(within(summaryBox).getAllByText('90.000đ')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /xác nhận đặt đơn hàng \(90\.000\s*đ\)/i })
    ).toBeInTheDocument();
  });

  it('(d) Đặt đơn gửi promotionCode (không gửi trường tiền), hiển thị số liệu 201 từ server, màn QR dùng totalAmount sau giảm; lỗi 409/404 mã lúc đặt đơn thì báo lỗi và gỡ mã', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'BREW10',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 15000,
      discountAmount: 9000,
    });

    renderCheckout();

    await user.type(await screen.findByLabelText(/mã giảm giá/i), 'BREW10');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));
    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã BREW10')).toBeInTheDocument();
    });

    // 1. Khi đặt đơn gặp 409 "Mã giảm giá đã ngừng áp dụng" -> báo lỗi và gỡ mã
    vi.mocked(ordersService.createOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(409, 'Mã giảm giá đã ngừng áp dụng')
    );
    await user.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mã giảm giá đã ngừng áp dụng');
    });
    expect(screen.queryByText(/đã áp dụng mã/i)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-summary-box')).getByText('0đ')).toBeInTheDocument();

    // 2. Áp lại mã khác -> gặp 404 "Mã giảm giá không tồn tại" lúc đặt đơn -> báo lỗi và gỡ mã
    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'OLDCODE',
      type: 'FIXED',
      value: 10000,
      maxDiscount: null,
      discountAmount: 10000,
    });
    await user.type(screen.getByLabelText(/mã giảm giá/i), 'OLDCODE');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));
    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã OLDCODE')).toBeInTheDocument();
    });

    vi.mocked(ordersService.createOrderApi).mockRejectedValueOnce(
      new ordersService.OrderApiError(404, 'Mã giảm giá không tồn tại')
    );
    await user.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mã giảm giá không tồn tại');
    });
    expect(screen.queryByText(/đã áp dụng mã/i)).not.toBeInTheDocument();

    // 3. Áp mã BREW10 và đặt đơn thành công 201 -> kiểm tra payload và hiển thị số liệu server
    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'BREW10',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 15000,
      discountAmount: 9000,
    });
    await user.type(screen.getByLabelText(/mã giảm giá/i), 'BREW10');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));
    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã BREW10')).toBeInTheDocument();
    });

    const serverOrder: OrderResponse = {
      id: 'order-promo-201',
      orderNumber: 2055,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      subtotalAmount: 90000,
      discountAmount: 15000, // Cố ý khác 9.000đ để xác nhận FE hiển thị đúng số liệu từ response 201
      promotionCode: 'BREW10',
      pointsUsed: 0,
      pointsEarned: 0,
      totalAmount: 75000,
      createdAt: new Date().toISOString(),
      items: [],
    };
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(serverOrder);

    await user.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));

    await waitFor(() => {
      expect(screen.getByText('#2055')).toBeInTheDocument();
    });

    // Kiểm tra body gửi cho createOrderApi
    const lastPayload = vi.mocked(ordersService.createOrderApi).mock.calls[2][0] as unknown as Record<
      string,
      unknown
    >;
    expect(lastPayload.promotionCode).toBe('BREW10');
    expect(lastPayload.usePoints).toBe(false);
    expect(lastPayload.unitPrice).toBeUndefined();
    expect(lastPayload.totalAmount).toBeUndefined();
    expect(lastPayload.discountAmount).toBeUndefined();
    expect(lastPayload.subtotalAmount).toBeUndefined();

    // Hiển thị số liệu từ response 201 và màn QR dùng totalAmount (75.000đ)
    const createdSummary = screen.getByTestId('created-order-summary');
    expect(createdSummary).toHaveTextContent('90.000đ');
    expect(createdSummary).toHaveTextContent('-15.000đ');
    expect(createdSummary).toHaveTextContent('75.000đ');
    expect(screen.getAllByText('75.000đ').length).toBeGreaterThanOrEqual(2);
  });

  it('(e) Giỏ hàng thay đổi làm tạm tính thay đổi sau khi đã áp mã -> tự động gỡ mã kèm thông báo', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'BREW10',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 15000,
      discountAmount: 9000,
    });

    renderCheckout();

    await user.type(await screen.findByLabelText(/mã giảm giá/i), 'BREW10');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));

    await waitFor(() => {
      expect(screen.getByText('Đã áp dụng mã BREW10')).toBeInTheDocument();
    });

    // Thay đổi số lượng trong giỏ (2 -> 3 => 135.000đ) thông qua sự kiện storage
    const updatedCart: CartItem[] = [{ ...mockCartItem, quantity: 3 }];
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updatedCart));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
    });

    await waitFor(() => {
      expect(
        screen.getByText('Giỏ hàng đã thay đổi, vui lòng áp dụng lại mã')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/đã áp dụng mã/i)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-summary-box')).getByText('0đ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /xác nhận đặt đơn hàng \(135\.000\s*đ\)/i })
    ).toBeInTheDocument();
  });

  it('(f) Mở /checkout?orderId=... để thanh toán lại đơn có sẵn (kể cả khi giỏ có món): KHÔNG hiện ô nhập mã và nút Áp dụng, chỉ hiện số liệu của đơn đó', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));
    mockSearchParams = new URLSearchParams('orderId=order-existing-promo-1');

    vi.mocked(ordersService.getOrderByIdApi).mockResolvedValueOnce({
      id: 'order-existing-promo-1',
      orderNumber: 1889,
      status: 'PENDING',
      receiveType: 'TAKE_AWAY',
      subtotalAmount: 100000,
      discountAmount: 15000,
      promotionCode: 'BREW10',
      pointsUsed: 0,
      pointsEarned: 0,
      totalAmount: 85000,
      createdAt: new Date().toISOString(),
      items: [
        {
          id: 'oi-1',
          productId: '11111111-0000-0000-0000-000000000007',
          productName: 'Trà sữa truyền thống',
          size: 'L',
          sugarLevel: 'P70',
          iceLevel: 'NORMAL',
          quantity: 2,
          unitPrice: 50000,
          lineTotal: 100000,
          note: null,
          toppings: [],
        },
      ],
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('#1889')).toBeInTheDocument();
    });

    expect(screen.getByText('85.000đ')).toBeInTheDocument();
    expect(screen.queryByLabelText(/mã giảm giá/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /áp dụng/i })).not.toBeInTheDocument();
    expect(screen.queryByText('90.000đ')).not.toBeInTheDocument();
  });

  it('Tương thích mock mode (NEXT_PUBLIC_USE_MOCK=true): kiểm tra đủ BREW10, TAMNGUNG và mã không tồn tại', async () => {
    const actualPromotions = await vi.importActual<typeof import('../services/promotions')>(
      '../services/promotions'
    );
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';

    const okRes = await actualPromotions.validatePromotionApi({
      code: ' brew10 ',
      subtotal: 90000,
    });
    expect(okRes.code).toBe('BREW10');
    expect(okRes.discountAmount).toBe(9000);

    await expect(
      actualPromotions.validatePromotionApi({ code: 'TAMNGUNG', subtotal: 90000 })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Mã giảm giá đã ngừng áp dụng',
    });

    await expect(
      actualPromotions.validatePromotionApi({ code: 'NOTEXIST', subtotal: 90000 })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Mã giảm giá không tồn tại',
    });
  });
});
