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
} from '../utils/cart';

describe('Logic giỏ hàng thuần túy (utils/cart.ts)', () => {
  const baseItem: Omit<CartItem, 'id'> = {
    productId: '1',
    name: 'Cà phê sữa đá',
    image: 'https://example.com/cf.jpg',
    size: 'M',
    sugarLevel: '100%',
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
    const cart = addItemToCart([], baseItem);

    expect(cart).toHaveLength(1);
    expect(cart[0].productId).toBe('1');
    expect(cart[0].unitPrice).toBe(34000);
    expect(cart[0].quantity).toBe(1);
    expect(cart[0].id).toBeDefined();
  });

  // 2. Gộp dòng trùng
  it('2. Gộp dòng trùng: cùng món, cùng size, cùng đường/đá, topping và ghi chú', () => {
    const initialCart = addItemToCart([], baseItem);
    const updatedCart = addItemToCart(initialCart, { ...baseItem, quantity: 2 });

    expect(updatedCart).toHaveLength(1);
    expect(updatedCart[0].quantity).toBe(3); // 1 + 2 = 3 ly
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
    });

    // Dòng 2 chọn theo thứ tự ngược: [top-2, top-1]
    const cart2 = addItemToCart(cart1, {
      ...baseItem,
      toppings: [topping2, topping1],
      quantity: 2,
    });

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
    });

    // Dòng 2 ghi chú đã trim gọn gàng
    const cart2 = addItemToCart(cart1, {
      ...baseItem,
      note: 'pha đậm vị trà',
      quantity: 1,
    });

    expect(cart2).toHaveLength(1);
    expect(cart2[0].quantity).toBe(2);
    expect(cart2[0].note).toBe('pha đậm vị trà');
  });

  // 5. So sánh dòng trùng - TH3: Xử lý đường/đá vắng mặt (món bánh)
  it('5. So sánh dòng trùng - Trường hợp 3: Xử lý đường/đá vắng mặt (món bánh)', () => {
    const cakeItem: Omit<CartItem, 'id'> = {
      productId: '5',
      name: 'Bánh croissant',
      image: 'https://example.com/cake.jpg',
      sugarLevel: undefined, // Không có đường
      iceLevel: undefined, // Không có đá
      toppings: [],
      note: '',
      unitPrice: 25000,
      quantity: 1,
    };

    // Thêm 2 chiếc bánh cùng không có đường/đá
    const cart1 = addItemToCart([], cakeItem);
    const cart2 = addItemToCart(cart1, { ...cakeItem, quantity: 2 });

    expect(cart2).toHaveLength(1);
    expect(cart2[0].quantity).toBe(3);

    // Món có đường vs món không đường sẽ tách thành 2 dòng riêng
    const cart3 = addItemToCart(cart2, {
      ...cakeItem,
      sugarLevel: '100%', // Có đường
      quantity: 1,
    });
    expect(cart3).toHaveLength(2);
  });

  // 6. Khác tùy chọn thì tách dòng riêng
  it('6. Khác size hoặc khác topping thì tách dòng riêng', () => {
    const cart1 = addItemToCart([], baseItem);
    // Cùng món nhưng chọn Size L thay vì M
    const cart2 = addItemToCart(cart1, { ...baseItem, size: 'L', unitPrice: 39000, quantity: 1 });

    expect(cart2).toHaveLength(2);
    expect(cart2[0].size).toBe('M');
    expect(cart2[1].size).toBe('L');
  });

  // 7. Số lượng tối đa 10 ly khi gộp dòng
  it('7. Số lượng khi cộng dồn không vượt quá giới hạn tối đa 10 ly', () => {
    const cart1 = addItemToCart([], { ...baseItem, quantity: 8 });
    const cart2 = addItemToCart(cart1, { ...baseItem, quantity: 5 }); // 8 + 5 = 13 -> giới hạn 10

    expect(cart2[0].quantity).toBe(10);
  });

  // 8. Đổi số lượng và không giảm dưới 1
  it('8. Đổi số lượng: tối thiểu là 1, tối đa 10, giảm dưới 1 không tự xóa', () => {
    const cart = addItemToCart([], baseItem);
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
    const cart1 = addItemToCart([], baseItem);
    const cart2 = addItemToCart(cart1, { ...baseItem, size: 'L', unitPrice: 39000, quantity: 1 });
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
      image: '',
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
      image: '',
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
    const items = addItemToCart([], baseItem);
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
});

