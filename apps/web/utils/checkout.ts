import { CartItem } from './cart';
import {
  CreateOrderDto,
  CreateOrderItemDto,
  ORDER_ERROR_MESSAGES,
  PaymentMethod,
  ReceiveType,
} from '../services/order-contract';

export const PENDING_ORDER_STORAGE_KEY = 'brewlite_pending_order_v1';

/**
 * Bản ghi đơn hàng đang chờ thanh toán được lưu trữ trong localStorage.
 * TUYỆT ĐỐI KHÔNG LƯU số thẻ, số ví, CVV hay thông tin tài khoản ngân hàng.
 */
export interface PendingOrderRecord {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  receiveType: ReceiveType;
  idempotencyKey: string;
  expiresAt: string; // ISO 8601
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  itemCount: number;
}

/**
 * Sinh khóa Idempotency-Key chuẩn UUID v4.
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
 * Kiểm tra xem đơn chờ thanh toán đã quá hạn 15 phút chưa
 */
export function isPendingOrderExpired(
  record: PendingOrderRecord,
  nowMs: number = Date.now()
): boolean {
  if (!record || !record.expiresAt) return true;
  const expiryTime = new Date(record.expiresAt).getTime();
  if (Number.isNaN(expiryTime)) return true;
  return expiryTime <= nowMs;
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
      receiveType: record.receiveType,
      idempotencyKey: record.idempotencyKey,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      customerName: record.customerName?.trim() || undefined,
      customerPhone: record.customerPhone?.trim() || undefined,
      itemCount: Math.max(1, record.itemCount || 1),
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
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Không thể xóa đơn chờ:', err);
    }
  }
}

/**
 * Nạp đơn chờ thanh toán từ localStorage.
 * Tự động xóa và trả về null nếu dữ liệu hỏng hoặc đơn đã quá hạn expiresAt.
 */
export function loadPendingOrder(nowMs: number = Date.now()): PendingOrderRecord | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
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
      expiresAt,
      createdAt,
      customerName,
      customerPhone,
      itemCount,
    } = parsed as Partial<PendingOrderRecord>;

    if (
      typeof orderId !== 'string' ||
      !orderId.trim() ||
      typeof orderNumber !== 'string' ||
      typeof totalAmount !== 'number' ||
      typeof idempotencyKey !== 'string' ||
      typeof expiresAt !== 'string'
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
      expiresAt,
      createdAt: createdAt || new Date().toISOString(),
      customerName: typeof customerName === 'string' ? customerName : undefined,
      customerPhone: typeof customerPhone === 'string' ? customerPhone : undefined,
      itemCount: typeof itemCount === 'number' ? itemCount : 1,
    };

    if (isPendingOrderExpired(record, nowMs)) {
      clearPendingOrder();
      return null;
    }

    return record;
  } catch {
    clearPendingOrder();
    return null;
  }
}

/**
 * Kiểm tra trạng thái đơn chờ khi mở lại trang:
 * Trả về đơn hợp lệ hoặc cờ báo hiệu đơn vừa bị quá hạn để hiện thông báo rõ ràng cho khách.
 */
export function checkPendingOrderStatus(nowMs: number = Date.now()): {
  pendingOrder: PendingOrderRecord | null;
  wasExpired: boolean;
} {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { pendingOrder: null, wasExpired: false };
  }

  try {
    const raw = window.localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    if (!raw) return { pendingOrder: null, wasExpired: false };

    const parsed = JSON.parse(raw) as Partial<PendingOrderRecord>;
    if (!parsed || !parsed.expiresAt) {
      clearPendingOrder();
      return { pendingOrder: null, wasExpired: false };
    }

    const isExpired = isPendingOrderExpired(parsed as PendingOrderRecord, nowMs);
    if (isExpired) {
      clearPendingOrder();
      return { pendingOrder: null, wasExpired: true };
    }

    const validOrder = loadPendingOrder(nowMs);
    return { pendingOrder: validOrder, wasExpired: false };
  } catch {
    clearPendingOrder();
    return { pendingOrder: null, wasExpired: false };
  }
}

/**
 * Chuyển đổi giỏ hàng sang payload gửi lên server.
 * TUYỆT ĐỐI KHÔNG GỬI GIÁ TIỀN (unitPrice, lineTotal) LÊN SERVER.
 */
export function buildCreateOrderPayload(
  cartItems: CartItem[],
  receiveType: ReceiveType,
  extra?: {
    note?: string;
    customerName?: string;
    customerPhone?: string;
  }
): CreateOrderDto {
  const items: CreateOrderItemDto[] = cartItems.map((item) => ({
    productId: item.productId,
    size: item.size,
    sugarLevel: item.sugarLevel,
    iceLevel: item.iceLevel,
    toppingIds: item.toppings && item.toppings.length > 0 ? item.toppings.map((t) => t.id) : undefined,
    note: item.note ? item.note.trim() : undefined,
    quantity: Math.max(1, Math.floor(item.quantity || 1)),
  }));

  const payload: CreateOrderDto = {
    receiveType,
    items,
    note: extra?.note?.trim() || undefined,
    customerName: extra?.customerName?.trim() || undefined,
    customerPhone: extra?.customerPhone?.trim() || undefined,
  };

  return payload;
}

/**
 * Che số thẻ / số ví, chỉ hiển thị 4 chữ số cuối để bảo mật thông tin.
 * Ví dụ: "9704123456789012" -> "•••• 9012"
 */
export function maskAccountNumber(rawNumber: string): string {
  const clean = (rawNumber || '').replace(/\s+/g, '');
  if (!clean || clean.length < 4) return '••••';
  const lastFour = clean.slice(-4);
  return `•••• ${lastFour}`;
}

/**
 * Validate số điện thoại nhận hàng (chuẩn Việt Nam 10 chữ số)
 */
export function validateCustomerPhone(phone: string): { isValid: boolean; error?: string } {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.PHONE_REQUIRED };
  }

  const phoneRegex = /^(03|05|07|08|09)\d{8}$/;
  if (!phoneRegex.test(trimmed)) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.PHONE_INVALID };
  }

  return { isValid: true };
}

/**
 * Validate số tài khoản thanh toán mô phỏng (Ví điện tử hoặc Thẻ ngân hàng)
 */
export function validateAccountNumber(
  accountNumber: string,
  method: PaymentMethod
): { isValid: boolean; error?: string } {
  const clean = (accountNumber || '').replace(/[\s-]+/g, '');

  if (!clean) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_REQUIRED };
  }

  if (!/^\d+$/.test(clean)) {
    return {
      isValid: false,
      error:
        method === 'E_WALLET'
          ? ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID_WALLET
          : ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID_CARD,
    };
  }

  if (method === 'E_WALLET') {
    if (clean.length !== 10) {
      return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID_WALLET };
    }
  } else if (method === 'BANK_CARD') {
    if (clean.length !== 16) {
      return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID_CARD };
    }
  }

  return { isValid: true };
}

