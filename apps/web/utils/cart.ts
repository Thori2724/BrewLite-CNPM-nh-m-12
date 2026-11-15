import { SizeId, SugarLevel, IceLevel, Topping } from '../services/api';

export interface CartItem {
  id: string; // Mã duy nhất cho từng dòng trong giỏ hàng
  productId: string;
  name: string;
  imageUrl: string;
  size?: SizeId;
  sugarLevel?: SugarLevel;
  iceLevel?: IceLevel;
  toppings: Topping[];
  note: string;
  unitPrice: number; // Đơn giá 1 ly/món (đã gồm basePrice + sizeExtraPrice + tổng giá topping)
  quantity: number; // Số lượng món (1..10)
}

export const MAX_ITEM_QUANTITY = 10;
export const MAX_CART_ITEMS = 20;
export const CART_STORAGE_KEY = 'brewlite_cart_v2';
export const LEGACY_CART_STORAGE_KEY = 'brewlite_cart_v1';

/**
 * Sinh chuỗi định danh đặc trưng cho các tùy chọn của món để kiểm tra trùng lặp.
 * Quy tắc:
 * 1. Sắp xếp topping theo id tăng dần trước khi ghép.
 * 2. Trim khoảng trắng ở ghi chú (đầu và cuối chuỗi).
 * 3. Xử lý đường/đá vắng mặt (undefined/null -> chuỗi rỗng "").
 */
export function getCartItemSignature(item: {
  productId: string;
  size?: SizeId | null;
  sugarLevel?: SugarLevel | null;
  iceLevel?: IceLevel | null;
  toppings?: Topping[];
  note?: string | null;
}): string {
  const sortedToppingIds = (item.toppings || [])
    .map((t) => t.id)
    .sort()
    .join(',');

  const trimmedNote = (item.note || '').trim();
  const size = item.size || '';
  const sugar = item.sugarLevel || '';
  const ice = item.iceLevel || '';

  return `${item.productId}|${size}|${sugar}|${ice}|${sortedToppingIds}|${trimmedNote}`;
}

/**
 * Tính thành tiền của một dòng giỏ hàng:
 * Thành tiền = unitPrice x quantity
 */
export function getLineTotal(item: CartItem): number {
  const safeUnitPrice = Math.max(0, item.unitPrice || 0);
  const safeQuantity = Math.max(1, Math.floor(item.quantity || 1));
  return safeUnitPrice * safeQuantity;
}

export interface AddToCartResult {
  ok: boolean;
  cart: CartItem[];
  error?: string;
}

/**
 * Thêm món vào giỏ hàng:
 * - Nếu trùng toàn bộ tùy chọn (cùng signature): cộng dồn số lượng, kẹp tối đa 10 ly.
 * - Nếu khác tùy chọn:
 *   + Nếu giỏ đã đạt tối đa 20 dòng: trả về { ok: false, error: '...' }, GIỮ NGUYÊN giỏ cũ, KHÔNG ném exception.
 *   + Nếu chưa đủ 20 dòng: tạo dòng mới với id riêng và thêm vào giỏ.
 */
export function addItemToCart(
  cart: CartItem[],
  newItem: Omit<CartItem, 'id'> & { id?: string }
): AddToCartResult {
  const newSignature = getCartItemSignature(newItem);
  const existingIndex = cart.findIndex(
    (item) => getCartItemSignature(item) === newSignature
  );

  const safeQuantity = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.floor(newItem.quantity || 1)));
  const cleanNote = (newItem.note || '').trim();
  const safeUnitPrice = Math.max(0, newItem.unitPrice || 0);

  if (existingIndex > -1) {
    const updatedCart = cart.map((item, idx) => {
      if (idx === existingIndex) {
        const combinedQty = Math.min(MAX_ITEM_QUANTITY, item.quantity + safeQuantity);
        return {
          ...item,
          quantity: combinedQty,
        };
      }
      return item;
    });
    return { ok: true, cart: updatedCart };
  }

  // Chặn khi vượt quá 20 dòng theo hợp đồng
  if (cart.length >= MAX_CART_ITEMS) {
    return {
      ok: false,
      cart, // Giữ nguyên giỏ cũ không thay đổi
      error: 'Giỏ hàng chỉ được chứa tối đa 20 món khác nhau',
    };
  }

  const createdItem: CartItem = {
    ...newItem,
    id: newItem.id || `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    imageUrl: newItem.imageUrl,
    size: newItem.size,
    sugarLevel: newItem.sugarLevel,
    iceLevel: newItem.iceLevel,
    toppings: newItem.toppings || [],
    note: cleanNote,
    unitPrice: safeUnitPrice,
    quantity: safeQuantity,
  };

  return { ok: true, cart: [...cart, createdItem] };
}

/**
 * Cập nhật số lượng của một dòng trong giỏ hàng.
 * Số lượng tối thiểu là 1, tối đa là 10.
 * Không tự xóa dòng khi giảm xuống dưới 1.
 */
export function updateItemQuantity(
  cart: CartItem[],
  id: string,
  newQuantity: number
): CartItem[] {
  return cart.map((item) => {
    if (item.id === id) {
      const clampedQuantity = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.floor(newQuantity)));
      return {
        ...item,
        quantity: clampedQuantity,
      };
    }
    return item;
  });
}

/**
 * Xóa một dòng khỏi giỏ hàng theo id.
 */
export function removeItemFromCart(cart: CartItem[], id: string): CartItem[] {
  return cart.filter((item) => item.id !== id);
}

/**
 * Xóa toàn bộ giỏ hàng.
 */
export function clearCart(): CartItem[] {
  return [];
}

/**
 * Tính tổng tiền tạm tính của toàn bộ giỏ hàng.
 * Tiền thật do server tính khi đặt đơn (không tin giá từ client).
 */
export function calculateCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + getLineTotal(item), 0);
}

/**
 * Đếm tổng số ly/món trong giỏ hàng (cộng dồn số lượng của từng dòng).
 */
export function calculateCartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0);
}

/**
 * Đọc dữ liệu giỏ hàng an toàn từ localStorage.
 * - Nếu còn khóa cũ brewlite_cart_v1: xóa bỏ ngay (không đọc, không migrate).
 * - Đọc khóa brewlite_cart_v2.
 * - Trả về mảng rỗng nếu môi trường server, JSON lỗi, hoặc cấu trúc dữ liệu bị hỏng.
 */
export function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  try {
    // 1. Tự động dọn sạch khóa cũ brewlite_cart_v1 nếu còn
    if (window.localStorage.getItem(LEGACY_CART_STORAGE_KEY) !== null) {
      window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
    }

    // 2. Đọc khóa brewlite_cart_v2
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Kiểm tra cấu trúc từng phần tử để phòng ngừa dữ liệu hỏng
    const validItems: CartItem[] = parsed.filter(
      (item): item is CartItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.productId === 'string' &&
        typeof item.name === 'string' &&
        typeof item.imageUrl === 'string' &&
        typeof item.unitPrice === 'number' &&
        typeof item.quantity === 'number' &&
        Array.isArray(item.toppings)
    );
    return validItems;
  } catch {
    return [];
  }
}

/**
 * Ghi dữ liệu giỏ hàng vào localStorage an toàn.
 */
export function saveCartToStorage(cart: CartItem[]): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    return true;
  } catch {
    return false;
  }
}
