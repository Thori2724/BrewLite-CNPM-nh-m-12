import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CartItem,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearCart,
  calculateCartTotal,
  calculateCartItemCount,
  getLineTotal,
  loadCartFromStorage,
  saveCartToStorage,
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  MAX_CART_ITEMS,
} from '../utils/cart';

describe('Logic giỏ hàng thuần túy (utils/cart.ts)', () => {
  const baseItem: Omit<CartItem, 'id'> = {
    productId: '1',
    name: 'Cà phê sữa đá',
    imageUrl: 'https://example.com/cf.jpg',
    size: 'M',
    sugarLevel: 'P100',
    iceLevel: 'NORMAL',
    toppings: [{ id: 'top-1', name: 'Trân châu đen', price: 5000 }],
    note: 'ít ngọt',
    unitPrice: 34000, // Đơn giá 1 ly
    quantity: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // 1. Thêm món mới
  it('1. Thêm món mới vào giỏ hàng rỗng', () => {
    const result = addItemToCart([], baseItem);

    expect(result.ok).toBe(true);
    expect(result.cart).toHaveLength(1);
    expect(result.cart[0].productId).toBe('1');
    expect(result.cart[0].unitPrice).toBe(34000);
    expect(result.cart[0].quantity).toBe(1);
    expect(result.cart[0].id).toBeDefined();
    expect(result.cart[0].imageUrl).toBe('https://example.com/cf.jpg');
  });

  // 2. Gộp dòng trùng
  it('2. Gộp dòng trùng: cùng món, cùng size, cùng đường/đá, topping và ghi chú', () => {
    const initial = addItemToCart([], baseItem);
    const updated = addItemToCart(initial.cart, { ...baseItem, quantity: 2 });

    expect(updated.ok).toBe(true);
    expect(updated.cart).toHaveLength(1);
    expect(updated.cart[0].quantity).toBe(3); // 1 + 2 = 3 ly
  });

  // 3. So sánh dòng trùng - TH1: Sắp xếp topping theo id
  it('3. So sánh dòng trùng - Trường hợp 1: Sắp xếp topping theo ID trước khi ghép', () => {
    const topping1 = { id: 'top-1', name: 'Trân châu đen', price: 5000 };
    const topping2 = { id: 'top-2', name: 'Trân châu trắng', price: 7000 };

    // Dòng 1 chọn: [top-1, top-2]
    const cart1 = addItemToCart([], {
      ...baseItem,
      toppings: [topping1, topping2],
      quantity: 1,
    }).cart;

    // Dòng 2 chọn theo thứ tự ngược: [top-2, top-1]
    const cart2 = addItemToCart(cart1, {
      ...baseItem,
      toppings: [topping2, topping1],
      quantity: 2,
    }).cart;

    // Phải gộp lại thành 1 dòng duy nhất với số lượng = 3
    expect(cart2).toHaveLength(1);
    expect(cart2[0].quantity).toBe(3);
  });

  // 4. So sánh dòng trùng - TH2: Trim ghi chú
  it('4. So sánh dòng trùng - Trường hợp 2: Trim khoảng trắng ở ghi chú', () => {
    // Dòng 1 ghi chú có khoảng trắng thừa hai đầu
    const cart1 = addItemToCart([], {
      ...baseItem,
      note: '   pha đậm vị trà   ',
      quantity: 1,
    }).cart;

    // Dòng 2 ghi chú đã trim gọn gàng
    const cart2 = addItemToCart(cart1, {
      ...baseItem,
      note: 'pha đậm vị trà',
      quantity: 1,
    }).cart;

    expect(cart2).toHaveLength(1);
    expect(cart2[0].quantity).toBe(2);
    expect(cart2[0].note).toBe('pha đậm vị trà');
  });

  // 5. So sánh dòng trùng - TH3: Xử lý đường/đá vắng mặt (món bánh)
  it('5. So sánh dòng trùng - Trường hợp 3: Xử lý đường/đá vắng mặt (món bánh)', () => {
    const cakeItem: Omit<CartItem, 'id'> = {
      productId: '5',
      name: 'Bánh croissant',
      imageUrl: 'https://example.com/cake.jpg',
      sugarLevel: undefined, // Không có đường
      iceLevel: undefined, // Không có đá
      toppings: [],
      note: '',
      unitPrice: 25000,
      quantity: 1,
    };

    // Thêm 2 chiếc bánh cùng không có đường/đá
    const cart1 = addItemToCart([], cakeItem).cart;
    const cart2 = addItemToCart(cart1, { ...cakeItem, quantity: 2 }).cart;

    expect(cart2).toHaveLength(1);
    expect(cart2[0].quantity).toBe(3);

    // Món có đường vs món không đường sẽ tách thành 2 dòng riêng
    const cart3 = addItemToCart(cart2, {
      ...cakeItem,
      sugarLevel: 'P100', // Có đường
      quantity: 1,
    }).cart;
    expect(cart3).toHaveLength(2);
  });

  // 6. Khác tùy chọn thì tách dòng riêng
  it('6. Khác size hoặc khác topping thì tách dòng riêng', () => {
    const cart1 = addItemToCart([], baseItem).cart;
    // Cùng món nhưng chọn Size L thay vì M
    const cart2 = addItemToCart(cart1, { ...baseItem, size: 'L', unitPrice: 39000, quantity: 1 }).cart;

    expect(cart2).toHaveLength(2);
    expect(cart2[0].size).toBe('M');
    expect(cart2[1].size).toBe('L');
  });

  // 7. Số lượng tối đa 10 ly khi gộp dòng
  it('7. Số lượng khi cộng dồn không vượt quá giới hạn tối đa 10 ly', () => {
    const cart1 = addItemToCart([], { ...baseItem, quantity: 8 }).cart;
    const cart2 = addItemToCart(cart1, { ...baseItem, quantity: 5 }).cart; // 8 + 5 = 13 -> giới hạn 10

    expect(cart2[0].quantity).toBe(10);
  });

  // 8. Đổi số lượng và không giảm dưới 1
  it('8. Đổi số lượng: tối thiểu là 1, tối đa 10, giảm dưới 1 không tự xóa', () => {
    const cart = addItemToCart([], baseItem).cart;
    const itemId = cart[0].id;

    // Tăng lên 5
    const updated1 = updateItemQuantity(cart, itemId, 5);
    expect(updated1[0].quantity).toBe(5);

    // Thử giảm về 0 hoặc số âm -> kẹp về tối thiểu 1 (không tự xóa)
    const updated2 = updateItemQuantity(updated1, itemId, 0);
    expect(updated2[0].quantity).toBe(1);

    const updated3 = updateItemQuantity(updated1, itemId, -3);
    expect(updated3[0].quantity).toBe(1);

    // Thử tăng vượt quá 10 -> kẹp về 10
    const updated4 = updateItemQuantity(updated1, itemId, 15);
    expect(updated4[0].quantity).toBe(10);
  });

  // 9. Xóa dòng và xóa hết
  it('9. Xóa một dòng và xóa toàn bộ giỏ hàng', () => {
    const cart1 = addItemToCart([], baseItem).cart;
    const cart2 = addItemToCart(cart1, { ...baseItem, size: 'L', unitPrice: 39000, quantity: 1 }).cart;
    expect(cart2).toHaveLength(2);

    // Xóa dòng 1
    const cartAfterRemove = removeItemFromCart(cart2, cart2[0].id);
    expect(cartAfterRemove).toHaveLength(1);
    expect(cartAfterRemove[0].size).toBe('L');

    // Xóa toàn bộ
    const cartEmpty = clearCart();
    expect(cartEmpty).toHaveLength(0);
  });

  // 10. Đơn giá, thành tiền dòng và tổng tiền giỏ hàng
  it('10. Lưu đơn giá (unitPrice), thành tiền dòng = unitPrice x quantity, tính đúng tổng giỏ', () => {
    const item1: CartItem = {
      id: 'item-1',
      productId: '1',
      name: 'Cà phê sữa đá',
      imageUrl: '',
      size: 'M',
      toppings: [],
      note: '',
      unitPrice: 34000, // 34.000đ 1 ly
      quantity: 2, // 2 ly -> thành tiền dòng = 68.000đ
    };

    const item2: CartItem = {
      id: 'item-2',
      productId: '5',
      name: 'Bánh croissant',
      imageUrl: '',
      toppings: [],
      note: '',
      unitPrice: 25000, // 25.000đ 1 cái
      quantity: 3, // 3 cái -> thành tiền dòng = 75.000đ
    };

    expect(getLineTotal(item1)).toBe(68000);
    expect(getLineTotal(item2)).toBe(75000);

    const cart = [item1, item2];
    // Tổng = 68.000 + 75.000 = 143.000đ
    expect(calculateCartTotal(cart)).toBe(143000);
    // Tổng số ly/món = 2 + 3 = 5
    expect(calculateCartItemCount(cart)).toBe(5);
  });

  // 11. Lưu và nạp từ localStorage an toàn
  it('11. Đọc và ghi an toàn với localStorage, chống sập khi dữ liệu hỏng', () => {
    const items = addItemToCart([], baseItem).cart;
    saveCartToStorage(items);

    // Đọc lại khi dữ liệu đúng
    const loaded = loadCartFromStorage();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].productId).toBe('1');

    // Giả lập dữ liệu localStorage bị hỏng (JSON sai)
    localStorage.setItem(CART_STORAGE_KEY, '{invalid json syntax}');
    const loadedCorrupted = loadCartFromStorage();
    expect(loadedCorrupted).toEqual([]); // Trả về giỏ rỗng an toàn, không sập trang

    // Giả lập dữ liệu không phải là mảng
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ some: 'object' }));
    const loadedNotArray = loadCartFromStorage();
    expect(loadedNotArray).toEqual([]);
  });

  // 12. Chặn thêm món khi giỏ hàng đã đạt giới hạn tối đa 20 dòng, giữ nguyên giỏ cũ
  it('12. Chặn thêm món khi giỏ hàng đã có 20 món khác nhau, không ném lỗi và giữ nguyên giỏ cũ', () => {
    let currentCart: CartItem[] = [];

    // Tạo sẵn 20 dòng khác nhau trong giỏ
    for (let i = 1; i <= MAX_CART_ITEMS; i++) {
      const item: Omit<CartItem, 'id'> = {
        productId: `prod-${i}`,
        name: `Món số ${i}`,
        imageUrl: `https://example.com/item-${i}.jpg`,
        toppings: [],
        note: '',
        unitPrice: 30000,
        quantity: 1,
      };
      const res = addItemToCart(currentCart, item);
      expect(res.ok).toBe(true);
      currentCart = res.cart;
    }

    expect(currentCart).toHaveLength(20);

    // Thử thêm món thứ 21 (khác tùy chọn/khác ID)
    const item21: Omit<CartItem, 'id'> = {
      productId: 'prod-21',
      name: 'Món số 21',
      imageUrl: 'https://example.com/item-21.jpg',
      toppings: [],
      note: '',
      unitPrice: 35000,
      quantity: 1,
    };

    const overflowResult = addItemToCart(currentCart, item21);

    // Phải trả về ok: false, kèm error tiếng Việt, giỏ cũ được giữ nguyên 20 món
    expect(overflowResult.ok).toBe(false);
    expect(overflowResult.error).toBe('Giỏ hàng chỉ được chứa tối đa 20 món khác nhau');
    expect(overflowResult.cart).toHaveLength(20);
    expect(overflowResult.cart).toBe(currentCart); // Giữ nguyên tham chiếu hoặc dữ liệu giỏ cũ
  });

  // 13. Tự động dọn dẹp khóa cũ brewlite_cart_v1 khi nạp giỏ hàng
  it('13. Tự động xóa khóa cũ brewlite_cart_v1 khi gọi loadCartFromStorage', () => {
    // Giả lập người dùng trước đó có dữ liệu ở khóa v1
    localStorage.setItem(LEGACY_CART_STORAGE_KEY, JSON.stringify([{ id: 'legacy-item-1' }]));
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'cart-v2-1',
          productId: 'prod-1',
          name: 'Trà sen vàng',
          imageUrl: 'https://example.com/tra.jpg',
          toppings: [],
          note: '',
          unitPrice: 35000,
          quantity: 2,
        },
      ])
    );

    const loaded = loadCartFromStorage();

    // Khóa brewlite_cart_v1 phải bị xóa hoàn toàn khỏi localStorage
    expect(localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
    // Dữ liệu v2 nạp đúng
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('cart-v2-1');
  });
});
