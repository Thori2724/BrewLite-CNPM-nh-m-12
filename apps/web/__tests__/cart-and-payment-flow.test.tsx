import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckoutPage from '../app/checkout/page';
import CartPage from '../app/cart/page';
import CartIcon from '../app/components/CartIcon';
import ProductDetailPage from '../app/menu/[id]/page';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider, useCart } from '../context/CartContext';
import { AUTH_STORAGE_KEY } from '../utils/auth';
import {
  CartItem,
  CART_STORAGE_KEY,
  MAX_CART_ITEMS,
  addItemToCart,
  updateItemQuantity,
  calculateCartTotal,
  calculateCartItemCount,
  loadCartFromStorage,
  saveCartToStorage,
} from '../utils/cart';
import { calculatePrice } from '../utils/price';
import {
  buildCreateOrderPayload,
  PENDING_ORDER_STORAGE_KEY,
  savePendingOrder,
  validateAccountNumber,
} from '../utils/checkout';
import { resetRedirectFlag } from '../services/auth';
import { ProductDetail } from '../services/api';
import * as navigation from 'next/navigation';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockParams: Record<string, string> = { id: '11111111-0000-0000-0000-000000000007' };

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => mockSearchParams),
  useParams: vi.fn(() => mockParams),
}));

// Dữ liệu mẫu đúng từng chữ theo docs/api-contract.md
const CONTRACT_DRINK_DETAIL: ProductDetail = {
  id: '11111111-0000-0000-0000-000000000007',
  name: 'Trà sữa truyền thống',
  category: 'MILK_TEA',
  basePrice: 35000,
  imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
  stock: 40,
  sizes: [
    { value: 'S', label: 'Size S', extraPrice: 0 },
    { value: 'M', label: 'Size M', extraPrice: 6000 },
    { value: 'L', label: 'Size L', extraPrice: 10000 },
  ],
  sugarLevels: [
    { value: 'P0', label: '0%' },
    { value: 'P30', label: '30%' },
    { value: 'P50', label: '50%' },
    { value: 'P70', label: '70%' },
    { value: 'P100', label: '100%' },
  ],
  iceLevels: [
    { value: 'NONE', label: 'Không đá' },
    { value: 'LOW', label: 'Ít đá' },
    { value: 'NORMAL', label: 'Đá vừa' },
    { value: 'FULL', label: 'Nhiều đá' },
  ],
  toppings: [
    { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
    { id: '22222222-0000-0000-0000-000000000002', name: 'Thạch dừa', price: 5000 },
    { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
    { id: '22222222-0000-0000-0000-000000000004', name: 'Kem cheese', price: 10000 },
  ],
};

const CONTRACT_CAKE_DETAIL: ProductDetail = {
  id: '11111111-0000-0000-0000-000000000010',
  name: 'Bánh Croissant',
  category: 'CAKE',
  basePrice: 30000,
  imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
  stock: 20,
  sizes: [],
  sugarLevels: [],
  iceLevels: [],
  toppings: [],
};

const CONTRACT_OUT_OF_STOCK_DETAIL: ProductDetail = {
  ...CONTRACT_DRINK_DETAIL,
  id: '11111111-0000-0000-0000-000000000003',
  name: 'Bạc xỉu',
  category: 'COFFEE',
  basePrice: 32000,
  stock: 0,
};

const CONTRACT_CART_DRINK: CartItem = {
  id: 'cart-drink-1',
  productId: '11111111-0000-0000-0000-000000000007',
  name: 'Trà sữa truyền thống',
  imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
  size: 'M',
  sugarLevel: 'P70',
  iceLevel: 'NORMAL',
  toppings: [
    { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
    { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
  ],
  note: 'Ít ngọt vừa phải',
  unitPrice: 53000, // 35.000 + 6.000 + 5.000 + 7.000
  quantity: 2, // 53.000 x 2 = 106.000
};

const CONTRACT_CART_CAKE: CartItem = {
  id: 'cart-cake-1',
  productId: '11111111-0000-0000-0000-000000000010',
  name: 'Bánh Croissant',
  imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
  size: undefined,
  sugarLevel: undefined,
  iceLevel: undefined,
  toppings: [],
  note: 'Hâm nóng bánh giúp mình',
  unitPrice: 30000,
  quantity: 1, // 30.000 x 1 = 30.000
};

const MOCK_AUTH_SESSION = {
  token: 'secret-jwt-token-999',
  user: {
    id: '99999999-0000-0000-0000-000000000001',
    email: 'nguyenan@gmail.com',
    displayName: 'Nguyễn Văn An',
    role: 'CUSTOMER' as const,
  },
};

function createJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? 'Internal Server Error' : 'OK',
    json: async () => body,
  } as unknown as Response;
}

describe('Dòng 20 — Kiểm thử Giỏ hàng và Luồng Thanh toán (A1–A10, B1–B11)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetRedirectFlag();

    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
      NEXT_PUBLIC_USE_MOCK_PRODUCTS: 'false',
      NEXT_PUBLIC_USE_MOCK_AUTH: 'false',
      NEXT_PUBLIC_USE_MOCK_ORDERS: 'false',
    };

    mockSearchParams = new URLSearchParams();
    mockParams = { id: CONTRACT_DRINK_DETAIL.id };

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

    vi.mocked(navigation.useParams).mockImplementation(() => mockParams);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  // ============================================================================
  // NHÓM A: GIỎ HÀNG (LOGIC + COMPONENT)
  // ============================================================================
  describe('Nhóm A — Giỏ hàng (A1–A10)', () => {
    it('A1. Thêm món: tạo dòng mới, lưu đúng productId, quantity, size, sugarLevel, iceLevel, toppings (toppingIds) và note', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse(200, CONTRACT_DRINK_DETAIL));

      render(
        <CartProvider>
          <ProductDetailPage />
        </CartProvider>
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'Trà sữa truyền thống' })
        ).toBeInTheDocument();
      });

      // Chọn Size M, Đường 70%, Đá vừa, 2 topping (Trân châu đen + Pudding), ghi chú, số lượng 2
      await user.click(screen.getByRole('button', { name: /Size M/i }));
      await user.click(screen.getByRole('button', { name: '70%' }));
      await user.click(screen.getByRole('button', { name: 'Đá vừa' }));
      await user.click(screen.getByText('Trân châu đen'));
      await user.click(screen.getByText('Pudding'));
      await user.type(screen.getByLabelText(/ghi chú cho quán/i), 'Ít ngọt vừa phải');
      await user.click(screen.getByRole('button', { name: '+' }));

      await user.click(screen.getByRole('button', { name: /\+ Thêm vào giỏ/i }));

      const savedCart = loadCartFromStorage();
      expect(savedCart).toHaveLength(1);
      expect(savedCart[0]).toMatchObject({
        productId: '11111111-0000-0000-0000-000000000007',
        quantity: 2,
        size: 'M',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        note: 'Ít ngọt vừa phải',
        unitPrice: 53000,
      });
      expect(savedCart[0].toppings.map((t) => t.id)).toEqual([
        '22222222-0000-0000-0000-000000000001',
        '22222222-0000-0000-0000-000000000003',
      ]);

      // Khi chuyển sang payload POST /orders có đúng mảng toppingIds
      const payload = buildCreateOrderPayload(savedCart, 'AT_COUNTER');
      expect(payload.items[0].toppingIds).toEqual([
        '22222222-0000-0000-0000-000000000001',
        '22222222-0000-0000-0000-000000000003',
      ]);
    });

    it('A2. Thêm cùng món với cùng tùy chọn thì gộp dòng và cộng dồn số lượng; khác size hoặc khác topping thì tách dòng riêng', () => {
      // Cùng món, cùng tùy chọn (kể cả khác thứ tự chọn topping) -> GỘP DÒNG
      const step1 = addItemToCart([], { ...CONTRACT_CART_DRINK, quantity: 2 });
      const step2 = addItemToCart(step1.cart, {
        ...CONTRACT_CART_DRINK,
        toppings: [...CONTRACT_CART_DRINK.toppings].reverse(),
        quantity: 3,
      });
      expect(step2.cart).toHaveLength(1);
      expect(step2.cart[0].quantity).toBe(5);

      // Cùng món nhưng khác size (Size L thay vì Size M) -> TÁCH DÒNG RIÊNG
      const step3 = addItemToCart(step2.cart, {
        ...CONTRACT_CART_DRINK,
        size: 'L',
        unitPrice: 57000,
        quantity: 1,
      });
      expect(step3.cart).toHaveLength(2);

      // Cùng món, cùng size M nhưng khác topping -> TÁCH DÒNG RIÊNG
      const step4 = addItemToCart(step3.cart, {
        ...CONTRACT_CART_DRINK,
        toppings: [{ id: '22222222-0000-0000-0000-000000000004', name: 'Kem cheese', price: 10000 }],
        unitPrice: 51000,
        quantity: 1,
      });
      expect(step4.cart).toHaveLength(3);
    });

    it('A3. Đổi số lượng: giới hạn 1–10 mỗi dòng, không giảm dưới 1 (không tự xóa dòng), tối đa 20 dòng món trong giỏ', async () => {
      const user = userEvent.setup();
      // Kiểm tra logic kẹp 1..10
      const initial = addItemToCart([], { ...CONTRACT_CART_DRINK, quantity: 1 }).cart;
      const itemId = initial[0].id;

      expect(updateItemQuantity(initial, itemId, 10)[0].quantity).toBe(10);
      expect(updateItemQuantity(initial, itemId, 15)[0].quantity).toBe(10); // Kẹp trần 10
      expect(updateItemQuantity(initial, itemId, 0)[0].quantity).toBe(1); // Kẹp sàn 1, không xóa
      expect(updateItemQuantity(initial, itemId, -5)[0].quantity).toBe(1);

      // Kiểm tra giới hạn tối đa 20 dòng món
      let cart20: CartItem[] = [];
      for (let i = 1; i <= MAX_CART_ITEMS; i++) {
        const res = addItemToCart(cart20, {
          ...CONTRACT_CART_CAKE,
          productId: `prod-${i}`,
          name: `Món ${i}`,
        });
        expect(res.ok).toBe(true);
        cart20 = res.cart;
      }
      expect(cart20).toHaveLength(20);
      const res21 = addItemToCart(cart20, {
        ...CONTRACT_CART_CAKE,
        productId: 'prod-21',
        name: 'Món 21',
      });
      expect(res21.ok).toBe(false);
      expect(res21.cart).toHaveLength(20);

      // Kiểm tra trên giao diện CartPage: nút giảm bị khóa ở 1, nút tăng bị khóa ở 10
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ ...CONTRACT_CART_CAKE, quantity: 1 }]));
      render(
        <CartProvider>
          <CartPage />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Giảm số lượng' })).toBeDisabled();
      });

      const incBtn = screen.getByRole('button', { name: 'Tăng số lượng' });
      for (let i = 1; i < 10; i++) {
        await user.click(incBtn);
      }
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(incBtn).toBeDisabled();
    });

    it('A4. Xóa dòng: tổng tiền và số trên biểu tượng giỏ cập nhật đúng; giỏ rỗng hiện trạng thái empty và ẩn nút đặt đơn', async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify([CONTRACT_CART_DRINK, CONTRACT_CART_CAKE])
      );

      render(
        <CartProvider>
          <CartIcon />
          <CartPage />
        </CartProvider>
      );

      // Ban đầu: 2 ly trà sữa (106.000đ) + 1 bánh (30.000đ) = 3 món, tổng 136.000đ
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /giỏ hàng, 3 món/i })).toBeInTheDocument();
        expect(screen.getAllByText('136.000đ').length).toBeGreaterThan(0);
      });

      // Xóa dòng Trà sữa truyền thống -> còn 1 bánh, tổng 30.000đ
      await user.click(screen.getByRole('button', { name: 'Xóa Trà sữa truyền thống' }));
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /giỏ hàng, 1 món/i })).toBeInTheDocument();
        expect(screen.getAllByText('30.000đ').length).toBeGreaterThan(0);
      });

      // Xóa nốt dòng Bánh Croissant -> giỏ rỗng, hiện trạng thái empty và ẩn nút đặt đơn
      await user.click(screen.getByRole('button', { name: 'Xóa Bánh Croissant' }));
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /giỏ hàng, trống/i })).toBeInTheDocument();
        expect(screen.getByText('Giỏ hàng của bạn đang trống')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /tiến hành đặt đơn/i })).not.toBeInTheDocument();
      });
    });

    it('A5. Giá tạm tính (chỉ để hiển thị): khớp đúng ví dụ hợp đồng (106.000 + 30.000 = 136.000) và các ca Size S/L, CAKE, 0..3 topping', () => {
      // 1. Ví dụ hợp đồng: Trà sữa truyền thống (35.000 + Size M 6.000 + Trân châu 5.000 + Pudding 7.000 = 53.000 x 2 = 106.000)
      const drinkUnit = calculatePrice({
        basePrice: 35000,
        sizeExtraPrice: 6000,
        toppings: [{ price: 5000 }, { price: 7000 }],
        quantity: 1,
      });
      expect(drinkUnit).toBe(53000);
      const drinkLineTotal = calculatePrice({
        basePrice: 35000,
        sizeExtraPrice: 6000,
        toppings: [{ price: 5000 }, { price: 7000 }],
        quantity: 2,
      });
      expect(drinkLineTotal).toBe(106000);

      // 2. Bánh Croissant: 30.000 x 1 = 30.000
      const cakeLineTotal = calculatePrice({
        basePrice: 30000,
        sizeExtraPrice: 0,
        toppings: [],
        quantity: 1,
      });
      expect(cakeLineTotal).toBe(30000);

      // 3. Tổng giỏ hàng = 136.000
      expect(calculateCartTotal([CONTRACT_CART_DRINK, CONTRACT_CART_CAKE])).toBe(136000);

      // 4. Các ca bổ sung: Size S (+0), Size L (+10.000), 0 topping, 3 topping
      expect(
        calculatePrice({ basePrice: 35000, sizeExtraPrice: 0, toppings: [], quantity: 1 })
      ).toBe(35000);
      expect(
        calculatePrice({ basePrice: 35000, sizeExtraPrice: 10000, toppings: [], quantity: 1 })
      ).toBe(45000);
      expect(
        calculatePrice({
          basePrice: 35000,
          sizeExtraPrice: 10000,
          toppings: [{ price: 5000 }, { price: 7000 }, { price: 10000 }],
          quantity: 1,
        })
      ).toBe(67000);
    });

    it('A6. Món CAKE: không có size, đường, đá, topping cả trên trang chi tiết lẫn trong giỏ hàng', async () => {
      const user = userEvent.setup();
      mockParams = { id: CONTRACT_CAKE_DETAIL.id };
      globalThis.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse(200, CONTRACT_CAKE_DETAIL));

      render(
        <CartProvider>
          <ProductDetailPage />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Bánh Croissant' })).toBeInTheDocument();
      });

      // Không hiển thị phần chọn Size, Đá, Đường, Topping
      expect(screen.queryByText(/Chọn kích cỡ/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Lượng đá/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Lượng đường/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Topping thêm/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /\+ Thêm vào giỏ/i }));

      const stored = loadCartFromStorage();
      expect(stored).toHaveLength(1);
      expect(stored[0].size).toBeUndefined();
      expect(stored[0].sugarLevel).toBeUndefined();
      expect(stored[0].iceLevel).toBeUndefined();
      expect(stored[0].toppings).toEqual([]);
    });

    it('A7. Món hết hàng (stock = 0) có nhãn "Hết hàng" và không thêm được vào giỏ', async () => {
      mockParams = { id: CONTRACT_OUT_OF_STOCK_DETAIL.id };
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(createJsonResponse(200, CONTRACT_OUT_OF_STOCK_DETAIL));

      render(
        <CartProvider>
          <ProductDetailPage />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Bạc xỉu' })).toBeInTheDocument();
      });

      expect(screen.getByText('Hết hàng')).toBeInTheDocument();
      const disabledBtn = screen.getByRole('button', { name: /Món tạm hết hàng/i });
      expect(disabledBtn).toBeDisabled();

      fireEvent.click(disabledBtn);
      expect(loadCartFromStorage()).toEqual([]);
    });

    it('A8. Lưu trên localStorage: tải lại trang giỏ vẫn còn; JSON hỏng hoặc localStorage ném lỗi thì không crash, giỏ rỗng', async () => {
      // 1. Lưu và tải lại trang (unmount -> mount lại)
      saveCartToStorage([CONTRACT_CART_DRINK]);
      const { unmount } = render(
        <CartProvider>
          <CartPage />
        </CartProvider>
      );
      await waitFor(() => {
        expect(screen.getByText('Trà sữa truyền thống')).toBeInTheDocument();
      });
      unmount();

      render(
        <CartProvider>
          <CartPage />
        </CartProvider>
      );
      await waitFor(() => {
        expect(screen.getByText('Trà sữa truyền thống')).toBeInTheDocument();
      });
      cleanup();

      // 2. Dữ liệu localStorage bị hỏng (JSON sai cú pháp) -> không crash, trả về giỏ rỗng
      localStorage.setItem(CART_STORAGE_KEY, '{corrupted_json: true');
      expect(() => loadCartFromStorage()).not.toThrow();
      expect(loadCartFromStorage()).toEqual([]);

      // 3. localStorage ném lỗi SecurityError / QuotaExceededError -> bọc bởi try/catch, không crash
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: Storage disabled');
      });
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => loadCartFromStorage()).not.toThrow();
      expect(loadCartFromStorage()).toEqual([]);
      expect(() => saveCartToStorage([CONTRACT_CART_CAKE])).not.toThrow();
      expect(saveCartToStorage([CONTRACT_CART_CAKE])).toBe(false);

      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    });

    it('A9. Số trên biểu tượng giỏ (CartIcon) luôn khớp với tổng số lượng món trong giỏ', async () => {
      function CartTestHarness() {
        const { addToCart, updateQuantity, removeFromCart, items } = useCart();
        return (
          <div>
            <CartIcon />
            <button
              type="button"
              onClick={() => addToCart({ ...CONTRACT_CART_DRINK, quantity: 2 })}
            >
              Thêm 2 trà sữa
            </button>
            <button
              type="button"
              onClick={() => addToCart({ ...CONTRACT_CART_CAKE, quantity: 3 })}
            >
              Thêm 3 bánh
            </button>
            {items[0] && (
              <>
                <button type="button" onClick={() => updateQuantity(items[0].id, 8)}>
                  Đổi dòng 1 thành 8
                </button>
                <button type="button" onClick={() => removeFromCart(items[0].id)}>
                  Xóa dòng 1
                </button>
              </>
            )}
          </div>
        );
      }

      const user = userEvent.setup();
      render(
        <CartProvider>
          <CartTestHarness />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Thêm 2 trà sữa' }));
      expect(screen.getByText('2')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Thêm 3 bánh' }));
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(calculateCartItemCount(loadCartFromStorage())).toBe(5);

      await user.click(screen.getByRole('button', { name: 'Đổi dòng 1 thành 8' }));
      // 8 + 3 = 11 (> 9 hiển thị 9+, aria-label vẫn báo 11 ly)
      expect(screen.getByText('9+')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Giỏ hàng, 11 món' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Xóa dòng 1' }));
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('A10. Hàm tạo body cho POST /orders: chỉ gồm trường hợp đồng, tuyệt đối không có giá/tên ở mọi cấp, CAKE không gửi size/đường/đá/toppingIds, tối đa 3 topping không trùng', () => {
      const cakeWithDirtyFields: CartItem = {
        ...CONTRACT_CART_CAKE,
        note: '   ', // Ghi chú toàn khoảng trắng -> không gửi
      };
      const drinkWithDuplicateToppings: CartItem = {
        ...CONTRACT_CART_DRINK,
        toppings: [
          { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
          { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
          { id: '22222222-0000-0000-0000-000000000002', name: 'Thạch dừa', price: 5000 },
          { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
          { id: '22222222-0000-0000-0000-000000000004', name: 'Kem cheese', price: 10000 },
        ],
      };

      const payload = buildCreateOrderPayload(
        [drinkWithDuplicateToppings, cakeWithDirtyFields],
        'TAKE_AWAY',
        { note: 'Cho xin thêm quai xách giấy' }
      );

      // 1. Chỉ gồm các key cho phép ở cấp root
      expect(Object.keys(payload).sort()).toEqual(['items', 'note', 'receiveType']);
      expect(payload.receiveType).toBe('TAKE_AWAY');
      expect(payload.note).toBe('Cho xin thêm quai xách giấy');

      // 2. Kiểm tra đệ quy ở MỌI CẤP: tuyệt đối không có unitPrice, lineTotal, totalAmount, price, name
      const forbiddenKeys = ['unitPrice', 'lineTotal', 'totalAmount', 'price', 'name'];
      const assertNoForbiddenKeys = (obj: unknown) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          obj.forEach(assertNoForbiddenKeys);
          return;
        }
        for (const [k, v] of Object.entries(obj)) {
          expect(forbiddenKeys).not.toContain(k);
          assertNoForbiddenKeys(v);
        }
      };
      assertNoForbiddenKeys(payload);

      // 3. Dòng 1 (món nước): tối đa 3 topping và không trùng nhau
      expect(payload.items[0].toppingIds).toEqual([
        '22222222-0000-0000-0000-000000000001',
        '22222222-0000-0000-0000-000000000002',
        '22222222-0000-0000-0000-000000000003',
      ]);

      // 4. Dòng 2 (món CAKE): KHÔNG gửi size, sugarLevel, iceLevel, toppingIds, và không gửi note rỗng
      const cakeItemPayload = payload.items[1];
      expect(Object.keys(cakeItemPayload).sort()).toEqual(['productId', 'quantity']);
      expect('size' in cakeItemPayload).toBe(false);
      expect('sugarLevel' in cakeItemPayload).toBe(false);
      expect('iceLevel' in cakeItemPayload).toBe(false);
      expect('toppingIds' in cakeItemPayload).toBe(false);
      expect('note' in cakeItemPayload).toBe(false);
    });
  });

  // ============================================================================
  // NHÓM B: ĐẶT ĐƠN VÀ THANH TOÁN (COMPONENT / INTEGRATION VỚI FETCH MOCK)
  // ============================================================================
  describe('Nhóm B — Đặt đơn và Thanh toán với fetch mock (B1–B11)', () => {
    const renderCheckoutWithProviders = () =>
      render(
        <AuthProvider>
          <CartProvider>
            <CheckoutPage />
          </CartProvider>
        </AuthProvider>
      );

    it('B1. Chưa đăng nhập mà vào đặt đơn thì chuyển về đăng nhập; bất kỳ API nào trả 401 đều xóa token và chuyển về đăng nhập', async () => {
      // 1. Chưa đăng nhập vào /checkout -> chuyển về /login
      const { unmount } = renderCheckoutWithProviders();
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
      });
      unmount();

      // 2. Đã đăng nhập nhưng API trả 401 -> xóa token trong localStorage và chuyển về /login
      const user = userEvent.setup();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      const originalLocation = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      (window as unknown as Record<string, unknown>).location = {
        pathname: '/checkout',
        search: '',
        href: '/checkout',
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createJsonResponse(401, {
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
        })
      );

      renderCheckoutWithProviders();

      const submitBtn = await screen.findByRole('button', { name: /đặt đơn hàng/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
        expect(window.location.href).toContain('/login?redirect=');
      });

      (window as unknown as Record<string, unknown>).location = originalLocation;
    });

    it('B2. Form hiển thị hình thức nhận mặc định AT_COUNTER ("Tại quầy"/"Mang đi") và lựa chọn ví QR ZaloPay/MoMo (bỏ thẻ ngân hàng và ô nhập số)', async () => {
      const user = userEvent.setup();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      renderCheckoutWithProviders();

      // Bước 1: Kiểm tra nhãn hình thức nhận và mặc định AT_COUNTER
      const atCounterRadio = (await screen.findByLabelText(/tại quầy/i)) as HTMLInputElement;
      const takeAwayRadio = screen.getByLabelText(/mang đi/i) as HTMLInputElement;
      expect(atCounterRadio.value).toBe('AT_COUNTER');
      expect(atCounterRadio.checked).toBe(true);
      expect(takeAwayRadio.value).toBe('TAKE_AWAY');
      expect(takeAwayRadio.checked).toBe(false);

      // Kiểm tra lựa chọn ví QR (ZaloPay mặc định, MoMo tùy chọn) và đã gỡ thẻ/ô nhập số
      const zalopayBtn = screen.getByRole('button', { name: /zalopay/i });
      const momoBtn = screen.getByRole('button', { name: /momo/i });
      expect(zalopayBtn).toHaveAttribute('aria-pressed', 'true');
      expect(momoBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('radio', { name: /thẻ ngân hàng/i })).not.toBeInTheDocument();
      expect(document.querySelector('#accountNumber')).toBeNull();

      await user.click(momoBtn);
      expect(momoBtn).toHaveAttribute('aria-pressed', 'true');
      expect(zalopayBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('B3. Giữ nguyên hàm validateAccountNumber ở mức unit test, kiểm tra ghi chú đơn > 200 ký tự không gọi fetch, và bước QR không hiển thị ô nhập số tài khoản/thẻ', async () => {
      vi.useFakeTimers();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      // 1. Kiểm tra hàm validateAccountNumber trực tiếp với đủ các biên (code cũ giữ lại nhưng gỡ khỏi UI)
      expect(validateAccountNumber('1234567').isValid).toBe(false); // 7 số -> lỗi
      expect(validateAccountNumber('12345678').isValid).toBe(true); // 8 số -> ok
      expect(validateAccountNumber('1234567890123456789').isValid).toBe(true); // 19 số -> ok
      expect(validateAccountNumber('12345678901234567890').isValid).toBe(false); // 20 số -> lỗi
      expect(validateAccountNumber('9704 1234 5678 0000').isValid).toBe(true); // Dán có khoảng trắng đủ 16 số -> ok
      expect(validateAccountNumber('        ').isValid).toBe(false); // Toàn khoảng trắng -> lỗi
      expect(validateAccountNumber('123 4567').isValid).toBe(false); // 7 chữ số sau khi bỏ khoảng trắng -> lỗi
      expect(validateAccountNumber('1234567a').isValid).toBe(false); // Có chữ -> lỗi
      expect(validateAccountNumber('1234-5678').isValid).toBe(false); // Ký tự đặc biệt -> lỗi
      expect(validateAccountNumber('').isValid).toBe(false); // Để trống -> lỗi

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
      });

      // 2. Ghi chú đơn > 200 ký tự trên UI -> báo lỗi tiếng Việt cạnh ô nhập và KHÔNG gọi fetch
      const noteTextarea = screen.getByLabelText(/ghi chú đơn hàng/i);
      fireEvent.change(noteTextarea, { target: { value: 'a'.repeat(201) } });
      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));

      expect(screen.getByText(/ghi chú không được vượt quá 200 ký tự/i)).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();

      // 3. Sửa lại ghi chú hợp lệ để sang Bước 2 (màn QR): không có ô nhập #accountNumber hay chọn thẻ
      fireEvent.change(noteTextarea, { target: { value: 'Ghi chú hợp lệ' } });
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(201, {
          id: '33333333-0000-0000-0000-000000000001',
          orderNumber: 1001,
          status: 'PENDING',
          receiveType: 'AT_COUNTER',
          totalAmount: 106000,
          createdAt: '2026-11-05T03:00:00.000Z',
          items: [],
        })
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole('img', { name: /mã qr zalopay cho đơn hàng #1001/i })).toBeInTheDocument();
      expect(document.querySelector('#accountNumber')).toBeNull();
      expect(screen.queryByRole('radio', { name: /thẻ ngân hàng/i })).not.toBeInTheDocument();
    });

    it('B4. Luồng thành công QR: POST /orders (201), đếm ngược 5 giây tự gọi POST /payments (201) với method WALLET và accountNumber 0900000001, xóa giỏ và hiện màn xác nhận kèm orderNumber', async () => {
      vi.useFakeTimers();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify([CONTRACT_CART_DRINK, CONTRACT_CART_CAKE])
      );

      const mockFetch = vi
        .fn()
        // Lần 1: POST /orders (201)
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '33333333-0000-0000-0000-000000000001',
            orderNumber: 1001,
            status: 'PENDING',
            receiveType: 'TAKE_AWAY',
            note: 'Cho xin thêm quai xách giấy',
            totalAmount: 136000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        )
        // Lần 2: POST /payments (201 SUCCESS)
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '44444444-0000-0000-0000-000000000001',
            orderId: '33333333-0000-0000-0000-000000000001',
            method: 'WALLET',
            accountLast4: '0001',
            amount: 136000,
            status: 'SUCCESS',
            createdAt: '2026-11-05T03:02:00.000Z',
            order: {
              id: '33333333-0000-0000-0000-000000000001',
              orderNumber: 1001,
              status: 'PAID',
            },
          })
        );
      globalThis.fetch = mockFetch;

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
      });

      // Bước 1: Chọn Mang đi, chọn ví MoMo (chỉ hiển thị), nhập ghi chú và bấm Xác nhận đặt đơn hàng
      fireEvent.click(screen.getByLabelText(/mang đi/i));
      fireEvent.click(screen.getByRole('button', { name: /momo/i }));
      fireEvent.change(screen.getByLabelText(/ghi chú đơn hàng/i), {
        target: { value: 'Cho xin thêm quai xách giấy' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Bước 2: Màn QR mở và hiển thị đếm ngược 5 giây
      expect(screen.getByRole('img', { name: /mã qr momo cho đơn hàng #1001/i })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/5 giây/i);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Hết 5 giây -> tự gọi POST /payments với accountNumber = 0900000001
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getAllByText('#1001').length).toBeGreaterThan(0);
      expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();

      // Kiểm tra request POST /orders và POST /payments không mang thông tin ví hiển thị
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const orderBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(Object.keys(orderBody).sort()).toEqual(['items', 'note', 'receiveType']);

      const [payUrl, payInit] = mockFetch.mock.calls[1];
      expect(payUrl).toBe('http://localhost:3001/payments');
      expect(payInit.method).toBe('POST');

      const payHeaders = payInit.headers as Headers;
      expect(payHeaders.get('Authorization')).toBe(`Bearer ${MOCK_AUTH_SESSION.token}`);
      const idempKey = payHeaders.get('Idempotency-Key') || '';
      expect(idempKey.length).toBeGreaterThanOrEqual(8);
      expect(idempKey.length).toBeLessThanOrEqual(100);

      const payBody = JSON.parse(payInit.body);
      expect(Object.keys(payBody).sort()).toEqual(['accountNumber', 'method', 'orderId']);
      expect(payBody).toEqual({
        orderId: '33333333-0000-0000-0000-000000000001',
        method: 'WALLET',
        accountNumber: '0900000001',
      });

      // Giỏ hàng và đơn chờ đã được xóa sạch
      expect(loadCartFromStorage()).toEqual([]);
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });

    it('B5. Thoát khỏi màn QR (Hủy thanh toán): gọi POST /payments với 0900000000 -> nhận 201 FAILED, giữ nguyên giỏ và orderId, hiện nút "Thử lại thanh toán"', async () => {
      vi.useFakeTimers();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '33333333-0000-0000-0000-000000000001',
            orderNumber: 1001,
            status: 'PENDING',
            receiveType: 'AT_COUNTER',
            totalAmount: 106000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        )
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '44444444-0000-0000-0000-000000000002',
            orderId: '33333333-0000-0000-0000-000000000001',
            method: 'WALLET',
            accountLast4: '0000',
            amount: 106000,
            status: 'FAILED',
            failureReason: 'Giao dịch bị từ chối (mô phỏng)',
            createdAt: '2026-11-05T03:02:00.000Z',
            order: {
              id: '33333333-0000-0000-0000-000000000001',
              orderNumber: 1001,
              status: 'PAYMENT_FAILED',
            },
          })
        );

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Bấm "Hủy thanh toán" trên màn QR
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/Bạn đã hủy thanh toán QR/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thử lại thanh toán/i })).toBeInTheDocument();

      const payCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(JSON.parse(payCall[1].body)).toEqual({
        orderId: '33333333-0000-0000-0000-000000000001',
        method: 'WALLET',
        accountNumber: '0900000000',
      });

      // Giữ nguyên giỏ hàng và orderId trong pendingOrder
      expect(loadCartFromStorage()).toHaveLength(1);
      const pendingRaw = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
      expect(pendingRaw).not.toBeNull();
      expect(JSON.parse(pendingRaw!).orderId).toBe('33333333-0000-0000-0000-000000000001');
    });

    it('B6. Thử lại thanh toán nhiều lần (thoát QR -> thoát QR -> hết 5 giây thành công): vào thẳng màn QR của CÙNG orderId, Idempotency-Key MỚI mỗi lần, không gọi POST /orders lại và chỉ xóa giỏ khi thành công', async () => {
      vi.useFakeTimers();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      const targetOrderId = '33333333-0000-0000-0000-000000000001';
      const mockFetch = vi
        .fn()
        // 1. Tạo đơn (chỉ 1 lần duy nhất)
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: targetOrderId,
            orderNumber: 1001,
            status: 'PENDING',
            receiveType: 'AT_COUNTER',
            totalAmount: 106000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        )
        // 2. Thanh toán lần 1 -> FAILED (thoát QR)
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: 'pay-attempt-1',
            orderId: targetOrderId,
            method: 'WALLET',
            accountLast4: '0000',
            amount: 106000,
            status: 'FAILED',
            failureReason: 'Giao dịch bị từ chối (mô phỏng)',
            createdAt: '2026-11-05T03:02:00.000Z',
            order: { id: targetOrderId, orderNumber: 1001, status: 'PAYMENT_FAILED' },
          })
        )
        // 3. Thanh toán lần 2 -> FAILED tiếp (thoát QR)
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: 'pay-attempt-2',
            orderId: targetOrderId,
            method: 'WALLET',
            accountLast4: '0000',
            amount: 106000,
            status: 'FAILED',
            failureReason: 'Giao dịch bị từ chối (mô phỏng)',
            createdAt: '2026-11-05T03:03:00.000Z',
            order: { id: targetOrderId, orderNumber: 1001, status: 'PAYMENT_FAILED' },
          })
        )
        // 4. Thanh toán lần 3 -> SUCCESS (PAID sau 5 giây)
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: 'pay-attempt-3',
            orderId: targetOrderId,
            method: 'WALLET',
            accountLast4: '0001',
            amount: 106000,
            status: 'SUCCESS',
            createdAt: '2026-11-05T03:04:00.000Z',
            order: { id: targetOrderId, orderNumber: 1001, status: 'PAID' },
          })
        );
      globalThis.fetch = mockFetch;

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
      });

      // Đặt đơn
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Lần thử 1: thoát QR (FAILED) -> giỏ vẫn còn
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Thử lại thanh toán/i })).toBeInTheDocument();
      expect(loadCartFromStorage()).toHaveLength(1);

      // Bấm Thử lại thanh toán -> vào thẳng màn QR -> Lần thử 2: thoát QR (FAILED)
      fireEvent.click(screen.getByRole('button', { name: /Thử lại thanh toán/i }));
      expect(screen.getByRole('img', { name: /mã qr zalopay cho đơn hàng #1001/i })).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /hủy thanh toán/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 orders + 2 payments
      expect(loadCartFromStorage()).toHaveLength(1);

      // Bấm Thử lại thanh toán -> vào thẳng màn QR -> Lần thử 3: hết 5 giây (SUCCESS)
      fireEvent.click(screen.getByRole('button', { name: /Thử lại thanh toán/i }));
      expect(screen.getByRole('img', { name: /mã qr zalopay cho đơn hàng #1001/i })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getAllByText('#1001').length).toBeGreaterThan(0);
      expect(loadCartFromStorage()).toEqual([]);

      // Kiểm tra số lần gọi POST /orders chỉ đúng 1 lần, POST /payments 3 lần
      const orderCalls = mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/orders'));
      const paymentCalls = mockFetch.mock.calls.filter(([url]) =>
        String(url).endsWith('/payments')
      );
      expect(orderCalls).toHaveLength(1);
      expect(paymentCalls).toHaveLength(3);

      // Cả 3 lần gọi POST /payments đều dùng CÙNG orderId và 3 Idempotency-Key hoàn toàn khác nhau
      const usedKeys: string[] = [];
      for (const [, init] of paymentCalls) {
        const body = JSON.parse(init.body);
        expect(body.orderId).toBe(targetOrderId);
        const key = (init.headers as Headers).get('Idempotency-Key')!;
        expect(key.length).toBeGreaterThanOrEqual(8);
        expect(usedKeys).not.toContain(key);
        usedKeys.push(key);
      }
      expect(new Set(usedKeys).size).toBe(3);
    });

    it('B7. Chống gọi trùng khi đang gửi POST /payments (khóa nút thoát/đóng, hiện "Đang xử lý...") và xử lý response 200 OK (idempotency replay) giống 201', async () => {
      vi.useFakeTimers();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      let resolvePayment!: (value: Response) => void;
      const pendingPaymentPromise = new Promise<Response>((resolve) => {
        resolvePayment = resolve;
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '33333333-0000-0000-0000-000000000001',
            orderNumber: 1001,
            status: 'PENDING',
            receiveType: 'AT_COUNTER',
            totalAmount: 106000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        )
        .mockImplementationOnce(() => pendingPaymentPromise);
      globalThis.fetch = mockFetch;

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Hết 5 giây -> bắt đầu gọi POST /payments đang pending
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(screen.getByRole('status')).toHaveTextContent(/đang xử lý\.\.\./i);
      const processingCancelBtn = screen.getByRole('button', { name: /đang xử lý\.\.\./i });
      const closeBtn = screen.getByRole('button', { name: /đóng màn thanh toán qr/i });
      expect(processingCancelBtn).toBeDisabled();
      expect(closeBtn).toBeDisabled();

      // Thử bấm thoát/đóng trong lúc đang xử lý cũng không gọi thêm /payments
      fireEvent.click(processingCancelBtn);
      fireEvent.click(closeBtn);

      const paymentCalls = mockFetch.mock.calls.filter(([url]) =>
        String(url).endsWith('/payments')
      );
      expect(paymentCalls).toHaveLength(1);

      // Trả về HTTP 200 OK (kết quả cũ do idempotency) -> vẫn xử lý thành công như 201
      await act(async () => {
        resolvePayment(
          createJsonResponse(200, {
            id: '44444444-0000-0000-0000-000000000001',
            orderId: '33333333-0000-0000-0000-000000000001',
            method: 'WALLET',
            accountLast4: '0001',
            amount: 106000,
            status: 'SUCCESS',
            createdAt: '2026-11-05T03:02:00.000Z',
            order: {
              id: '33333333-0000-0000-0000-000000000001',
              orderNumber: 1001,
              status: 'PAID',
            },
          })
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getAllByText('#1001').length).toBeGreaterThan(0);
      expect(loadCartFromStorage()).toEqual([]);
    });

    it('B8. Lỗi POST /orders: 409 hết hàng (kèm details), 404, 400 (message mảng tiếng Anh), lỗi mạng và 500 đều hiện thông báo tiếng Việt thân thiện, giữ giỏ và không gọi /payments', async () => {
      const user = userEvent.setup();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      renderCheckoutWithProviders();
      const submitBtn = await screen.findByRole('button', { name: /đặt đơn hàng/i });

      // 1. 409 Hết hàng kèm details
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(409, {
          statusCode: 409,
          message: "Sản phẩm 'Trà sữa truyền thống' không đủ số lượng trong kho",
          error: 'Conflict',
          details: [
            {
              productId: '11111111-0000-0000-0000-000000000007',
              name: 'Trà sữa truyền thống',
              available: 0,
            },
          ],
        })
      );
      await user.click(submitBtn);
      await waitFor(() => {
        expect(
          screen.getByText("Sản phẩm 'Trà sữa truyền thống' không đủ số lượng trong kho")
        ).toBeInTheDocument();
        expect(screen.getByText('Trà sữa truyền thống: còn 0')).toBeInTheDocument();
      });
      expect(loadCartFromStorage()).toHaveLength(1);

      // 2. 404 Không tìm thấy sản phẩm / topping
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(404, {
          statusCode: 404,
          message: 'Không tìm thấy topping',
          error: 'Not Found',
        })
      );
      await user.click(submitBtn);
      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy topping')).toBeInTheDocument();
      });

      // 3. 400 Bad Request với message là MẢNG chuỗi tiếng Anh -> hiện tiếng Việt thân thiện, không in thô tiếng Anh
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(400, {
          statusCode: 400,
          message: ['items.0.quantity must not be greater than 10'],
          error: 'Bad Request',
        })
      );
      await user.click(submitBtn);
      await waitFor(() => {
        expect(
          screen.getByText(/Dữ liệu không hợp lệ\. Vui lòng kiểm tra lại\./i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/must not be greater than 10/i)).not.toBeInTheDocument();

      // 4. Lỗi mạng (fetch reject) -> thông báo tiếng Việt chung
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await user.click(submitBtn);
      await waitFor(() => {
        expect(
          screen.getByText(/Không thể kết nối đến máy chủ/i)
        ).toBeInTheDocument();
      });

      // 5. Lỗi 500 Internal Server Error -> thông báo tiếng Việt chung ('Không kết nối được máy chủ, vui lòng thử lại'), không hiện chữ tiếng Anh 'Internal Server Error'
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(500, {
          statusCode: 500,
          message: 'Internal Server Error',
        })
      );
      await user.click(submitBtn);
      await waitFor(() => {
        expect(
          screen.getByText('Không kết nối được máy chủ, vui lòng thử lại')
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Internal Server Error/i)).not.toBeInTheDocument();

      // Tuyệt đối không có request nào gọi tới /payments
      const paymentCalls = mockFetch.mock.calls.filter(([url]) =>
        String(url).endsWith('/payments')
      );
      expect(paymentCalls).toHaveLength(0);
    });

    it('B9. Lỗi POST /payments trên luồng QR: 400 (mảng/chuỗi), lỗi mạng, 500, 409 và 404 đều hiện thông báo tiếng Việt và không kẹt loading', async () => {
      vi.useFakeTimers();
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      const targetOrderId = '33333333-0000-0000-0000-000000000001';
      savePendingOrder({
        orderId: targetOrderId,
        orderNumber: 1001,
        totalAmount: 106000,
        receiveType: 'AT_COUNTER',
        idempotencyKey: 'idemp-b9-initial-key',
        createdAt: '2026-11-05T03:00:00.000Z',
        itemCount: 1,
      });
      mockSearchParams = new URLSearchParams(`orderId=${targetOrderId}`);

      const mockFetch = vi.fn().mockResolvedValueOnce(
        // Mount: GET /orders/:id trả về PENDING
        createJsonResponse(200, {
          id: targetOrderId,
          orderNumber: 1001,
          status: 'PENDING',
          receiveType: 'AT_COUNTER',
          totalAmount: 106000,
          createdAt: '2026-11-05T03:00:00.000Z',
          items: [],
        })
      );
      globalThis.fetch = mockFetch;

      const { unmount } = renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // Bấm "Thanh toán bằng QR" ở màn chọn ví (?orderId= Cách A)
      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));

      // 1. Lỗi 400 với message là mảng chuỗi tiếng Anh
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(400, {
          statusCode: 400,
          message: ['accountNumber must be a number string', 'Idempotency-Key must be a string'],
          error: 'Bad Request',
        })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/Yêu cầu thanh toán không hợp lệ/i)).toBeInTheDocument();
      const retryQrBtn = screen.getByRole('button', { name: /thử lại thanh toán/i });
      expect(retryQrBtn).not.toBeDisabled();

      // 2. Bấm "Thử lại thanh toán" -> mở QR -> Lỗi mạng (fetch reject)
      fireEvent.click(retryQrBtn);
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/Không thể kết nối đến máy chủ/i)).toBeInTheDocument();
      const retryNetBtn = screen.getByRole('button', { name: /^thử lại$/i });
      expect(retryNetBtn).not.toBeDisabled();

      // 3. Lỗi 500 Internal Server Error khi bấm Thử lại (giữ nguyên key)
      mockFetch.mockResolvedValueOnce(
        createJsonResponse(500, {
          statusCode: 500,
          message: 'Internal Server Error',
        })
      );
      await act(async () => {
        fireEvent.click(retryNetBtn);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/Máy chủ đang gặp sự cố tạm thời/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^thử lại$/i })).not.toBeDisabled();

      // 4. Lỗi 409 Conflict -> GET /orders/:id xác nhận CANCELLED -> báo rõ và không kẹt loading
      mockFetch
        .mockResolvedValueOnce(
          createJsonResponse(409, {
            statusCode: 409,
            message: 'Đơn không ở trạng thái cho phép thanh toán',
            error: 'Conflict',
          })
        )
        .mockResolvedValueOnce(
          createJsonResponse(200, {
            id: targetOrderId,
            orderNumber: 1001,
            status: 'CANCELLED',
            receiveType: 'AT_COUNTER',
            totalAmount: 106000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^thử lại$/i }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/Đơn không ở trạng thái cho phép thanh toán/i)).toBeInTheDocument();
      expect(screen.getByText('Đã hủy')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /xem lịch sử đơn/i })).toBeInTheDocument();

      unmount();

      // 5. Lỗi 404 Not Found khi POST /payments -> xóa pendingOrder và báo rõ tiếng Việt
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(
          createJsonResponse(200, {
            id: targetOrderId,
            orderNumber: 1001,
            status: 'PENDING',
            receiveType: 'AT_COUNTER',
            totalAmount: 106000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        )
        .mockResolvedValueOnce(
          createJsonResponse(404, {
            statusCode: 404,
            message: 'Đơn hàng không tồn tại',
            error: 'Not Found',
          })
        );

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole('button', { name: /thanh toán bằng qr/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/Đơn hàng không tồn tại/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /xem lịch sử đơn/i })).toBeInTheDocument();
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });

    it('B10. Bảo mật hằng số tài khoản mô phỏng và token: không lộ 0900000001 / 0900000000 / •••• ra giao diện, console, storage, URL và không lộ token ra console/URL', async () => {
      vi.useFakeTimers();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '33333333-0000-0000-0000-000000000001',
            orderNumber: 1001,
            status: 'PENDING',
            receiveType: 'AT_COUNTER',
            totalAmount: 106000,
            createdAt: '2026-11-05T03:00:00.000Z',
            items: [],
          })
        )
        .mockResolvedValueOnce(
          createJsonResponse(201, {
            id: '44444444-0000-0000-0000-000000000001',
            orderId: '33333333-0000-0000-0000-000000000001',
            method: 'WALLET',
            accountLast4: '0001',
            amount: 106000,
            status: 'SUCCESS',
            createdAt: '2026-11-05T03:02:00.000Z',
            order: {
              id: '33333333-0000-0000-0000-000000000001',
              orderNumber: 1001,
              status: 'PAID',
            },
          })
        );

      renderCheckoutWithProviders();
      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole('button', { name: /momo/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt đơn hàng/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/thanh toán thành công!/i)).toBeInTheDocument();
      expect(screen.getAllByText('#1001').length).toBeGreaterThan(0);

      // 1. Màn hình xác nhận KHÔNG hiện dòng số tài khoản hay 2 hằng số nội bộ
      expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
      expect(screen.queryByText(/0900000001/)).not.toBeInTheDocument();
      expect(screen.queryByText(/0900000000/)).not.toBeInTheDocument();

      // 2. Kiểm tra console.log / warn / error tuyệt đối không chứa hằng số tài khoản hay JWT token
      const allConsoleArgs = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');

      expect(allConsoleArgs).not.toContain('0900000001');
      expect(allConsoleArgs).not.toContain('0900000000');
      expect(allConsoleArgs).not.toContain(MOCK_AUTH_SESSION.token);

      // 3. Kiểm tra localStorage, sessionStorage và URL không chứa hằng số tài khoản
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        expect(localStorage.getItem(key)).not.toContain('0900000001');
        expect(localStorage.getItem(key)).not.toContain('0900000000');
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        expect(sessionStorage.getItem(key)).not.toContain('0900000001');
        expect(sessionStorage.getItem(key)).not.toContain('0900000000');
      }
      expect(window.location.href).not.toContain('0900000001');
      expect(window.location.href).not.toContain('0900000000');
      expect(window.location.href).not.toContain(MOCK_AUTH_SESSION.token);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('B11. Kiểm tra hiển thị đầy đủ các trạng thái của luồng: loading, empty giỏ hàng và error', async () => {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(MOCK_AUTH_SESSION));

      // 1. Trạng thái empty giỏ hàng trên /checkout
      const { unmount: unmountEmpty } = renderCheckoutWithProviders();
      await waitFor(() => {
        expect(screen.getByText(/giỏ hàng của bạn đang trống/i)).toBeInTheDocument();
      });
      unmountEmpty();

      // 2. Trạng thái loading khi đang tra cứu đơn hàng từ ?orderId=...
      mockSearchParams = new URLSearchParams('orderId=33333333-0000-0000-0000-000000000099');
      globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
      const { unmount: unmountLoading } = renderCheckoutWithProviders();
      await waitFor(() => {
        expect(screen.getByText(/đang tải thông tin đơn hàng\.\.\./i)).toBeInTheDocument();
      });
      unmountLoading();

      // 3. Trạng thái error khi tra cứu đơn hàng trả về 404
      mockSearchParams = new URLSearchParams('orderId=33333333-0000-0000-0000-000000000099');
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CONTRACT_CART_DRINK]));
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createJsonResponse(404, {
          statusCode: 404,
          message: 'Không tìm thấy đơn hàng',
          error: 'Not Found',
        })
      );
      renderCheckoutWithProviders();
      await waitFor(() => {
        expect(
          screen.getByText(/không tìm thấy đơn hàng hoặc bạn không có quyền truy cập\./i)
        ).toBeInTheDocument();
      });
    });
  });
});

