import { CartItem } from './cart';
import {
  CreateOrderDto,
  CreateOrderItemDto,
  ORDER_ERROR_MESSAGES,
  PaymentMethod,
  ReceiveType,
} from '../services/order-contract';

export const PENDING_ORDER_STORAGE_KEY = 'brewlite_pending_order_v2';
const LEGACY_PENDING_ORDER_STORAGE_KEY = 'brewlite_pending_order_v1';

/**
 * Bản ghi đơn hàng đang chờ thanh toán được lưu trữ trong localStorage.
 * TUYỆT ĐỐI KHÔNG LƯU số thẻ, số ví, CVV hay thông tin tài khoản ngân hàng.
 */
export interface PendingOrderRecord {
  orderId: string;
  orderNumber: number; // SỐ NGUYÊN (ví dụ: 1001)
  totalAmount: number;
  receiveType: ReceiveType;
  idempotencyKey: string;
  method?: PaymentMethod;
  createdAt: string;
  itemCount: number;
  createdFromCart?: boolean;
}

/**
 * Sinh khóa Idempotency-Key chuẩn UUID v4 (8..100 ký tự theo hợp đồng).
 * Ưu tiên dùng crypto.randomUUID() của trình duyệt, có fallback RFC 4122 v4.
 */
export function generateIdempotencyKey(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback RFC 4122 v4 an toàn
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Lưu đơn chờ thanh toán vào localStorage.
 * TUYỆT ĐỐI không chứa thông tin thẻ/ví.
 */
export function savePendingOrder(record: PendingOrderRecord): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const cleanRecord: PendingOrderRecord = {
      orderId: record.orderId,
      orderNumber: record.orderNumber,
      totalAmount: Math.max(0, record.totalAmount || 0),
      receiveType: record.receiveType || 'AT_COUNTER',
      idempotencyKey: record.idempotencyKey,
      method: record.method,
      createdAt: record.createdAt || new Date().toISOString(),
      itemCount: Math.max(1, record.itemCount || 1),
      ...(record.createdFromCart !== undefined
        ? { createdFromCart: Boolean(record.createdFromCart) }
        : {}),
    };
    window.localStorage.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify(cleanRecord));
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Không thể lưu đơn chờ vào localStorage:', err);
    }
  }
}

/**
 * Xóa đơn chờ thanh toán khỏi localStorage
 */
export function clearPendingOrder(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_PENDING_ORDER_STORAGE_KEY);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Không thể xóa đơn chờ:', err);
    }
  }
}

/**
 * Nạp đơn chờ thanh toán từ localStorage.
 * Tự động xóa và trả về null nếu dữ liệu hỏng.
 */
export function loadPendingOrder(): PendingOrderRecord | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    // Tự động dọn dẹp key cũ v1
    window.localStorage.removeItem(LEGACY_PENDING_ORDER_STORAGE_KEY);

    const raw = window.localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      clearPendingOrder();
      return null;
    }

    const {
      orderId,
      orderNumber,
      totalAmount,
      receiveType,
      idempotencyKey,
      method,
      createdAt,
      itemCount,
      createdFromCart,
    } = parsed as Partial<PendingOrderRecord>;

    if (
      typeof orderId !== 'string' ||
      !orderId.trim() ||
      typeof orderNumber !== 'number' ||
      typeof totalAmount !== 'number' ||
      typeof idempotencyKey !== 'string' ||
      !idempotencyKey.trim()
    ) {
      clearPendingOrder();
      return null;
    }

    const record: PendingOrderRecord = {
      orderId,
      orderNumber,
      totalAmount,
      receiveType: (receiveType as ReceiveType) || 'AT_COUNTER',
      idempotencyKey,
      method: method as PaymentMethod | undefined,
      createdAt: createdAt || new Date().toISOString(),
      itemCount: typeof itemCount === 'number' ? itemCount : 1,
      ...(typeof createdFromCart === 'boolean' ? { createdFromCart } : {}),
    };

    return record;
  } catch {
    clearPendingOrder();
    return null;
  }
}

/**
 * Chuyển đổi giỏ hàng sang payload gửi lên server POST /orders.
 * TUYỆT ĐỐI KHÔNG GỬI GIÁ TIỀN (unitPrice, lineTotal, totalAmount) LÊN SERVER.
 * BỎ HẲN customerName và customerPhone.
 * Món CAKE không gửi size, sugarLevel, iceLevel, toppingIds.
 */
export function buildCreateOrderPayload(
  cartItems: CartItem[],
  receiveType: ReceiveType,
  extra?: {
    note?: string;
  }
): CreateOrderDto {
  const items: CreateOrderItemDto[] = cartItems.map((item) => {
    const itemDto: CreateOrderItemDto = {
      productId: item.productId,
      quantity: Math.max(1, Math.min(10, Math.floor(item.quantity || 1))),
    };

    // Chỉ đính kèm khi có giá trị (món nước), không gửi chuỗi rỗng / mảng rỗng
    if (item.size) {
      itemDto.size = item.size;
    }
    if (item.sugarLevel) {
      itemDto.sugarLevel = item.sugarLevel;
    }
    if (item.iceLevel) {
      itemDto.iceLevel = item.iceLevel;
    }
    if (item.toppings && item.toppings.length > 0) {
      itemDto.toppingIds = item.toppings.slice(0, 3).map((t) => t.id);
    }
    if (item.note && item.note.trim()) {
      itemDto.note = item.note.trim().slice(0, 200);
    }

    return itemDto;
  });

  const payload: CreateOrderDto = {
    receiveType: receiveType || 'AT_COUNTER',
    items,
  };

  if (extra?.note && extra.note.trim()) {
    payload.note = extra.note.trim().slice(0, 200);
  }

  return payload;
}

/**
 * Che số thẻ / số ví, chỉ hiển thị 4 chữ số cuối để bảo mật thông tin.
 * Ví dụ: "9704123456789012" -> "•••• 9012"
 */
export function maskAccountNumber(rawNumber: string): string {
  const clean = (rawNumber || '').replace(/[\s-]+/g, '');
  if (!clean || clean.length < 4) return '••••';
  const lastFour = clean.slice(-4);
  return `•••• ${lastFour}`;
}

/**
 * Validate số tài khoản thanh toán mô phỏng (Ví điện tử hoặc Thẻ ngân hàng)
 * Hợp đồng: 8 đến 19 chữ số, không chứa ký tự khác.
 */
export function validateAccountNumber(
  accountNumber: string,
  method?: PaymentMethod
): { isValid: boolean; error?: string } {
  void method;
  const clean = (accountNumber || '').replace(/[\s-]+/g, '');

  if (!clean) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_REQUIRED };
  }

  if (!/^\d+$/.test(clean)) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID };
  }

  if (clean.length < 8 || clean.length > 19) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID };
  }

  return { isValid: true };
}

/**
 * Tham số đầu vào để quyết định giữ hay đổi Idempotency-Key
 */
export interface ResolveKeyParams {
  currentKey: string;
  isUncertainResult?: boolean; // Lỗi mạng, timeout, 5xx: BẮT BUỘC GIỮ NGUYÊN key
  isPaymentFailed?: boolean; // Server đã trả kết quả FAILED: ĐỔI sang key MỚI để thử lại
  hasPaymentInfoChanged?: boolean; // Khách đã đổi Ví/Thẻ hoặc đổi số tài khoản: ĐỔI key MỚI
}

/**
 * Hàm thuần quyết định giữ nguyên hay sinh mới Idempotency-Key.
 * Quy tắc:
 * 1. Khi chưa có key: SINH key MỚI.
 * 2. Khi kết quả chưa rõ (isUncertainResult = true: timeout, mất mạng, 5xx): GIỮ NGUYÊN key.
 * 3. Khi thông tin thanh toán thay đổi (hasPaymentInfoChanged = true): ĐỔI sang key MỚI.
 * 4. Khi thất bại rõ ràng (isPaymentFailed = true): ĐỔI sang key MỚI để thử lại.
 * 5. Mặc định: Giữ nguyên key đang có.
 */
export function resolveIdempotencyKey(params: ResolveKeyParams): {
  key: string;
  isNewKey: boolean;
} {
  const cleanCurrentKey = (params.currentKey || '').trim();

  // Chưa có key -> bắt buộc sinh mới
  if (!cleanCurrentKey) {
    return {
      key: generateIdempotencyKey(),
      isNewKey: true,
    };
  }

  // Ưu tiên 1: Kết quả chưa rõ ràng (mất mạng, timeout, 5xx) -> BẮT BUỘC GIỮ NGUYÊN KEY CŨ
  if (params.isUncertainResult) {
    return {
      key: cleanCurrentKey,
      isNewKey: false,
    };
  }

  // Ưu tiên 2: Thông tin thanh toán đã thay đổi -> BẮT BUỘC ĐỔI SANG KEY MỚI
  if (params.hasPaymentInfoChanged) {
    return {
      key: generateIdempotencyKey(),
      isNewKey: true,
    };
  }

  // Ưu tiên 3: Server trả kết quả FAILED rõ ràng -> BẮT BUỘC ĐỔI SANG KEY MỚI
  if (params.isPaymentFailed) {
    return {
      key: generateIdempotencyKey(),
      isNewKey: true,
    };
  }

  // Mặc định: Giữ nguyên key đang có
  return {
    key: cleanCurrentKey,
    isNewKey: false,
  };
}
