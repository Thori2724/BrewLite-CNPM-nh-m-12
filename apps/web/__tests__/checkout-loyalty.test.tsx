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
import { LoyaltyMeResponse } from '../services/loyalty';
import { OrderResponse } from '../services/order-contract';
import * as loyaltyService from '../services/loyalty';
import * as ordersService from '../services/orders';
import * as promotionsService from '../services/promotions';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import { CART_STORAGE_KEY, CartItem } from '../utils/cart';
import { resetMockLoyaltyDatabase } from '../mocks';
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

vi.mock('../services/promotions', async () => {
  const actual = await vi.importActual<typeof import('../services/promotions')>(
    '../services/promotions'
  );
  return {
    ...actual,
    validatePromotionApi: vi.fn(),
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
  id: 'cart-loyalty-1',
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
  token: 'mock-jwt-token-loyalty',
  user: {
    id: '44444444-0000-0000-0000-000000000001',
    email: 'khach@example.com',
    displayName: 'Khách demo',
    role: 'CUSTOMER' as const,
  },
};

describe('Dòng 19 - Công tắc Dùng điểm trên trang đặt đơn (/checkout)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockReset();
    vi.mocked(promotionsService.validatePromotionApi).mockReset();
    vi.mocked(ordersService.createOrderApi).mockReset();
    vi.mocked(ordersService.getOrderByIdApi).mockReset();
    vi.mocked(ordersService.payOrderApi).mockReset();

    localStorage.clear();
    resetRedirectFlag();
    resetMockLoyaltyDatabase();

    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.NEXT_PUBLIC_USE_MOCK_LOYALTY;
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

  it('(a) Hiển thị loading khi tải GET /loyalty/me, sau đó hiện đúng dòng số điểm, bật/tắt công tắc cập nhật khối tóm tắt và không có ô nhập số điểm', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    let resolveLoyalty!: (val: LoyaltyMeResponse) => void;
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockImplementationOnce(
      () =>
        new Promise<LoyaltyMeResponse>((resolve) => {
          resolveLoyalty = resolve;
        })
    );

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-loading')).toHaveTextContent(
        'Đang tải số dư điểm thưởng...'
      );
    });
    const switchDuringLoad = screen.getByRole('switch', { name: /dùng điểm/i });
    expect(switchDuringLoad).toBeDisabled();
    expect(switchDuringLoad).not.toBeChecked();

    await act(async () => {
      resolveLoyalty({ loyaltyPoints: 50, transactions: [] });
    });

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 50 điểm (dùng được 50 điểm, giảm 50.000đ)'
      );
    });

    // Không có ô nhập số điểm tùy ý
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

    const pointsSwitch = screen.getByRole('switch', { name: /dùng điểm/i });
    expect(pointsSwitch).not.toBeDisabled();
    expect(pointsSwitch).not.toBeChecked();

    const summaryBox = screen.getByTestId('checkout-summary-box');
    expect(within(summaryBox).getByText('Dùng điểm:')).toBeInTheDocument();
    expect(within(summaryBox).getByText('0 điểm')).toBeInTheDocument();
    expect(within(summaryBox).getAllByText('90.000đ')).toHaveLength(2);

    // Bật công tắc -> trừ 50.000đ, Tổng còn 40.000đ
    await user.click(pointsSwitch);
    expect(pointsSwitch).toBeChecked();
    expect(within(summaryBox).getByText('-50.000đ')).toBeInTheDocument();
    expect(within(summaryBox).getByText('40.000đ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /xác nhận đặt đơn hàng \(40\.000\s*đ\)/i })
    ).toBeInTheDocument();

    // Tắt công tắc -> trở lại 90.000đ
    await user.click(pointsSwitch);
    expect(pointsSwitch).not.toBeChecked();
    expect(within(summaryBox).getByText('0 điểm')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /xác nhận đặt đơn hàng \(90\.000\s*đ\)/i })
    ).toBeInTheDocument();
  });

  it('(b) Khi X = 0 (do N = 0 hoặc Tạm tính - Giảm giá <= 1000) công tắc bị khóa; khi áp mã/đổi giỏ làm X đổi thì tự tính lại và tự tắt nếu X về 0', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    // 1. N = 0 -> công tắc tắt và bị khóa (disabled)
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockResolvedValueOnce({
      loyaltyPoints: 0,
      transactions: [],
    });

    const { unmount } = renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 0 điểm (dùng được 0 điểm, giảm 0đ)'
      );
    });
    const zeroSwitch = screen.getByRole('switch', { name: /dùng điểm/i });
    expect(zeroSwitch).toBeDisabled();
    expect(zeroSwitch).not.toBeChecked();
    await user.click(zeroSwitch);
    expect(zeroSwitch).not.toBeChecked();
    unmount();

    // 2. Có 100 điểm trên đơn 90.000đ -> dùng tối đa 89 điểm (tổng tối thiểu 1.000đ)
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockResolvedValueOnce({
      loyaltyPoints: 100,
      transactions: [],
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 100 điểm (dùng được 89 điểm, giảm 89.000đ)'
      );
    });

    const pointsSwitch = screen.getByRole('switch', { name: /dùng điểm/i });
    await user.click(pointsSwitch);
    expect(pointsSwitch).toBeChecked();
    expect(within(screen.getByTestId('checkout-summary-box')).getByText('-89.000đ')).toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-summary-box')).getByText('1.000đ')).toBeInTheDocument();

    // Áp mã GIAM20K (giảm 20.000đ) -> X tự giảm còn 69 điểm (giảm 69.000đ), tổng vẫn 1.000đ
    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'GIAM20K',
      type: 'FIXED',
      value: 20000,
      maxDiscount: null,
      discountAmount: 20000,
    });
    const promoInput = screen.getByLabelText(/mã giảm giá/i);
    await user.type(promoInput, 'GIAM20K');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 100 điểm (dùng được 69 điểm, giảm 69.000đ)'
      );
    });
    expect(pointsSwitch).toBeChecked();
    expect(within(screen.getByTestId('checkout-summary-box')).getByText('-69.000đ')).toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-summary-box')).getByText('1.000đ')).toBeInTheDocument();

    // Gỡ mã -> X quay lại 89 điểm
    await user.click(screen.getByRole('button', { name: /gỡ mã/i }));
    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 100 điểm (dùng được 89 điểm, giảm 89.000đ)'
      );
    });

    // Áp mã giảm 89.000đ -> Tạm tính - Giảm giá = 1.000đ -> X = 0 -> tự tắt công tắc và khóa lại
    vi.mocked(promotionsService.validatePromotionApi).mockResolvedValueOnce({
      code: 'MAX89',
      type: 'FIXED',
      value: 89000,
      maxDiscount: null,
      discountAmount: 89000,
    });
    await user.type(promoInput, 'MAX89');
    await user.click(screen.getByRole('button', { name: /^áp dụng$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 100 điểm (dùng được 0 điểm, giảm 0đ)'
      );
      expect(pointsSwitch).not.toBeChecked();
      expect(pointsSwitch).toBeDisabled();
    });

    // Gỡ mã -> X về lại 89 và nút mở khóa (vẫn tắt cho khách tự bật nếu muốn)
    await user.click(screen.getByRole('button', { name: /gỡ mã/i }));
    await waitFor(() => {
      expect(pointsSwitch).not.toBeDisabled();
      expect(pointsSwitch).not.toBeChecked();
    });

    // Bật lại rồi đổi giỏ hàng xuống 1.000đ -> X về 0 và tự tắt công tắc
    await user.click(pointsSwitch);
    expect(pointsSwitch).toBeChecked();

    const cheapCart: CartItem[] = [
      { ...mockCartItem, toppings: [], unitPrice: 1000, quantity: 1 },
    ];
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cheapCart));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 100 điểm (dùng được 0 điểm, giảm 0đ)'
      );
      expect(pointsSwitch).not.toBeChecked();
      expect(pointsSwitch).toBeDisabled();
    });
  });

  it('(c) Khi bấm đặt đơn: gửi usePoints (true/false) + promotionCode, không gửi trường tiền/pointsUsed; sau khi tạo đơn hiển thị số liệu lấy từ response POST /orders', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    vi.mocked(loyaltyService.getMyLoyaltyApi).mockResolvedValue({
      loyaltyPoints: 30,
      transactions: [],
    });

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 30 điểm (dùng được 30 điểm, giảm 30.000đ)'
      );
    });

    // Bật công tắc Dùng điểm nhưng không nhập mã -> gửi usePoints: true, không gửi unitPrice/totalAmount/pointsUsed
    await user.click(screen.getByRole('switch', { name: /dùng điểm/i }));

    const serverOrder: OrderResponse = {
      id: 'order-loyalty-201',
      orderNumber: 3099,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      subtotalAmount: 90000,
      discountAmount: 7000, // Cố ý khác số xem trước để chứng minh FE không tự tính lại
      promotionCode: null,
      pointsUsed: 12, // Cố ý khác 30 điểm xem trước
      pointsEarned: 0,
      totalAmount: 43210, // Cố ý khác 90000 - 7000 - 12000
      createdAt: new Date().toISOString(),
      items: [],
    };
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce(serverOrder);

    await user.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));

    await waitFor(() => {
      expect(screen.getByText('#3099')).toBeInTheDocument();
    });

    const sentPayload = vi.mocked(ordersService.createOrderApi).mock.calls[0][0] as unknown as Record<
      string,
      unknown
    >;
    expect(sentPayload.usePoints).toBe(true);
    expect(sentPayload.unitPrice).toBeUndefined();
    expect(sentPayload.totalAmount).toBeUndefined();
    expect(sentPayload.pointsUsed).toBeUndefined();
    expect(sentPayload.discountAmount).toBeUndefined();

    // Hiển thị đúng số liệu từ response POST /orders
    const createdSummary = screen.getByTestId('created-order-summary');
    expect(createdSummary).toHaveTextContent('90.000đ');
    expect(createdSummary).toHaveTextContent('-7.000đ');
    expect(createdSummary).toHaveTextContent('12 điểm (-12.000đ)');
    expect(createdSummary).toHaveTextContent('43.210đ');
  });

  it('(d) Lỗi tải GET /loyalty/me không chặn đặt đơn; lỗi 401 chuyển về đăng nhập; lỗi 403 khóa tài khoản tự đăng xuất', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    // 1. Lỗi mạng khi lấy điểm -> thông báo ngắn, công tắc bị vô hiệu hóa, vẫn đặt đơn bình thường với usePoints: false
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 0, message: 'Lỗi mạng' })
    );
    vi.mocked(ordersService.createOrderApi).mockResolvedValueOnce({
      id: 'order-no-loyalty-ok',
      orderNumber: 3100,
      status: 'PENDING',
      receiveType: 'AT_COUNTER',
      subtotalAmount: 90000,
      discountAmount: 0,
      promotionCode: null,
      pointsUsed: 0,
      pointsEarned: 0,
      totalAmount: 90000,
      createdAt: new Date().toISOString(),
      items: [],
    });

    const { unmount } = renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-error')).toHaveTextContent(
        /không thể tải số dư điểm thưởng/i
      );
    });
    expect(screen.getByRole('switch', { name: /dùng điểm/i })).toBeDisabled();

    const submitBtn = screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('#3100')).toBeInTheDocument();
    });
    expect(vi.mocked(ordersService.createOrderApi).mock.calls[0][0].usePoints).toBe(false);
    unmount();

    // 2. 401 khi lấy điểm -> xóa phiên và chuyển về đăng nhập
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockRejectedValueOnce(
      new ApiHttpError({ statusCode: 401, message: 'Unauthorized' })
    );

    const { unmount: unmount401 } = renderCheckout();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/login?redirect=%2Fcheckout&expired=true');
    });
    unmount401();

    // 3. 403 tài khoản bị khóa -> thông báo và tự đăng xuất
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockRejectedValueOnce(
      new ApiHttpError({
        statusCode: 403,
        message: 'Tài khoản đã bị khóa',
        error: 'Forbidden',
      })
    );

    renderCheckout();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(screen.getByTestId('account-locked-notice')).toHaveTextContent(
        'Tài khoản đã bị khóa'
      );
    });
  });

  it('(e) Tương thích chế độ dữ liệu giả (NEXT_PUBLIC_USE_MOCK=true): đọc 50 điểm từ mockGetMyLoyalty()', async () => {
    const actualLoyalty = await vi.importActual<typeof import('../services/loyalty')>(
      '../services/loyalty'
    );
    vi.mocked(loyaltyService.getMyLoyaltyApi).mockImplementation(() =>
      actualLoyalty.getMyLoyaltyApi()
    );
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockLoggedInUser));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockCartItem]));

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('loyalty-summary-text')).toHaveTextContent(
        'Bạn có 50 điểm (dùng được 50 điểm, giảm 50.000đ)'
      );
    });
  });
});
