import {
  CreateOrderDto,
  ORDER_ERROR_MESSAGES,
  OrderResponse,
  PaymentDto,
  PaymentResponse,
} from '../services/order-contract';
import { OrderApiError } from '../services/orders';
import { MOCK_PRODUCTS } from './mock-products';

/**
 * Kiểm tra xem có đang bật chế độ Mock Đơn hàng/Thanh toán hay không
 */
export function isMockOrdersActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_ORDERS === 'true';
}

export interface MockOrderRecord extends OrderResponse {
  userId?: string;
}

export const MOCK_ORDERS_STORAGE_KEY = 'brewlite_mock_orders_db_v1';

export interface StoredMockPayload {
  orderId: string;
  method: string;
  last4: string;
}

export interface StoredMockDatabase {
  orders: Record<string, MockOrderRecord>;
  payments: Record<string, PaymentResponse>;
  payloads: Record<string, StoredMockPayload>;
}

export const mockOrdersDatabase: Map<string, MockOrderRecord> = new Map();
export const mockPaymentsDatabase: Map<string, PaymentResponse> = new Map();
export const mockPaymentsPayloadDatabase: Map<string, StoredMockPayload> = new Map();

/**
 * Nạp dữ liệu mock từ localStorage (phục vụ F5 / reload trang khi bật mock)
 */
export function loadMockDatabaseFromStorage(): void {
  if (!isMockOrdersActive() || typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(MOCK_ORDERS_STORAGE_KEY);
    if (!raw) return;

    const parsed: StoredMockDatabase = JSON.parse(raw);
    const now = Date.now();
    let hasExpiredItems = false;

    if (parsed.orders && typeof parsed.orders === 'object') {
      for (const [id, order] of Object.entries(parsed.orders)) {
        // Tự động dọn dẹp các đơn hàng mock đã quá 15 phút
        if (new Date(order.expiresAt).getTime() <= now) {
          hasExpiredItems = true;
        } else {
          mockOrdersDatabase.set(id, order);
        }
      }
    }

    if (parsed.payments && typeof parsed.payments === 'object') {
      for (const [key, payment] of Object.entries(parsed.payments)) {
        mockPaymentsDatabase.set(key, payment);
      }
    }

    if (parsed.payloads && typeof parsed.payloads === 'object') {
      for (const [key, payload] of Object.entries(parsed.payloads)) {
        mockPaymentsPayloadDatabase.set(key, payload);
      }
    }

    // Nếu có đơn hết hạn thì ghi lại storage sạch
    if (hasExpiredItems) {
      persistMockDatabaseToStorage();
    }
  } catch {
    // Dữ liệu storage bị hỏng thì bỏ qua
  }
}

/**
 * Đồng bộ dữ liệu mock vào localStorage
 * BẢO MẬT: Chỉ lưu 4 số cuối của số thẻ/ví để đối chiếu Idempotency mock, tuyệt đối không lưu trọn vẹn số thẻ/ví.
 */
export function persistMockDatabaseToStorage(): void {
  if (!isMockOrdersActive() || typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const ordersObj: Record<string, MockOrderRecord> = {};
    mockOrdersDatabase.forEach((val, key) => {
      if (new Date(val.expiresAt).getTime() > now) {
        ordersObj[key] = val;
      }
    });

    const paymentsObj: Record<string, PaymentResponse> = {};
    mockPaymentsDatabase.forEach((val, key) => {
      paymentsObj[key] = val;
    });

    // Lưu ý bảo mật: Chỉ lưu 4 số cuối (last4) của số ví/thẻ vào localStorage.
    const payloadsObj: Record<string, StoredMockPayload> = {};
    mockPaymentsPayloadDatabase.forEach((val, key) => {
      payloadsObj[key] = {
        orderId: val.orderId,
        method: val.method,
        last4: val.last4,
      };
    });

    const data: StoredMockDatabase = {
      orders: ordersObj,
      payments: paymentsObj,
      payloads: payloadsObj,
    };

    localStorage.setItem(MOCK_ORDERS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Bỏ qua nếu storage đầy hoặc bị chặn
  }
}

// Cờ giả lập lỗi mạng để phục vụ kiểm thử
let mockNetworkSimulation: 'timeout' | 'offline' | null = null;

export function setMockNetworkSimulation(type: 'timeout' | 'offline' | null): void {
  mockNetworkSimulation = type;
}

export function resetMockOrdersDatabase(): void {
  mockOrdersDatabase.clear();
  mockPaymentsDatabase.clear();
  mockPaymentsPayloadDatabase.clear();
  mockNetworkSimulation = null;

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(MOCK_ORDERS_STORAGE_KEY);
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
  }
}

/**
 * Phục vụ Unit Test: Giả lập hiệu ứng F5 (xóa bộ nhớ RAM của mock nhưng giữ nguyên localStorage)
 */
export function clearMockMemoryOnlyForTesting(): void {
  mockOrdersDatabase.clear();
  mockPaymentsDatabase.clear();
  mockPaymentsPayloadDatabase.clear();
}

/**
 * Giả lập tạo đơn hàng phía server
 */
export async function mockCreateOrder(dto: CreateOrderDto): Promise<OrderResponse> {
  // Đồng bộ dữ liệu mock từ storage (nếu vừa F5 hoặc mở tab mới)
  loadMockDatabaseFromStorage();

  // Giả lập độ trễ mạng 200ms
  await new Promise((resolve) => setTimeout(resolve, 200));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // Hỗ trợ kiểm thử thủ công qua ghi chú hoặc số điện thoại giả lập
  const lowerNote = (dto.note || '').toLowerCase();
  if (lowerNote.includes('hethang') || lowerNote.includes('hết hàng')) {
    throw new OrderApiError(409, ORDER_ERROR_MESSAGES.OUT_OF_STOCK, {
      outOfStockItems: ['Trà đào cam sả'],
      errorData: { statusCode: 409, outOfStockItems: ['Trà đào cam sả'] },
    });
  }
  if (lowerNote.includes('timeout') || dto.customerPhone === '0900000001') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (lowerNote.includes('offline') || dto.customerPhone === '0900000002') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // 1. Kiểm tra tồn kho (món productId = '3' trong MOCK_PRODUCTS là Trà đào cam sả đang hết hàng)
  const outOfStockNames: string[] = [];
  for (const item of dto.items) {
    const product = MOCK_PRODUCTS.find((p) => p.id === item.productId);
    if (product && !product.isAvailable) {
      outOfStockNames.push(product.name);
    }
  }

  if (outOfStockNames.length > 0) {
    throw new OrderApiError(409, ORDER_ERROR_MESSAGES.OUT_OF_STOCK, {
      outOfStockItems: outOfStockNames,
      errorData: { statusCode: 409, outOfStockItems: outOfStockNames },
    });
  }

  // 2. SERVER TỰ TÍNH TIỀN (tuyệt đối không nhận giá từ client)
  let calculatedTotal = 0;
  const processedItems = dto.items.map((item) => {
    const product = MOCK_PRODUCTS.find((p) => p.id === item.productId);
    const basePrice = product ? product.price : 29000;
    let unitPrice = basePrice;

    if (item.size === 'M') unitPrice += 5000;
    if (item.size === 'L') unitPrice += 10000;

    const lineTotal = unitPrice * item.quantity;
    calculatedTotal += lineTotal;

    return {
      productId: item.productId,
      productName: product ? product.name : 'Đồ uống BrewLite',
      unitPrice,
      quantity: item.quantity,
      size: item.size,
      sugarLevel: item.sugarLevel,
      iceLevel: item.iceLevel,
      note: item.note,
      lineTotal,
    };
  });

  const now = new Date();
  const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const orderNumber = `#BL-${Math.floor(1000 + Math.random() * 9000)}`;
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 phút

  const orderRecord: MockOrderRecord = {
    id: orderId,
    orderNumber,
    status: 'PENDING',
    receiveType: dto.receiveType,
    totalAmount: calculatedTotal,
    subtotal: calculatedTotal,
    discountAmount: 0,
    note: dto.note,
    customerName: dto.customerName,
    customerPhone: dto.customerPhone,
    expiresAt,
    createdAt: now.toISOString(),
    items: processedItems,
  };

  mockOrdersDatabase.set(orderId, orderRecord);
  persistMockDatabaseToStorage();
  return orderRecord;
}

/**
 * Giả lập thanh toán phía server với kiểm soát Idempotency
 */
export async function mockPayOrder(
  orderId: string,
  dto: PaymentDto,
  idempotencyKey: string
): Promise<PaymentResponse> {
  // Đồng bộ dữ liệu mock từ storage (nếu vừa F5 hoặc mở tab mới)
  loadMockDatabaseFromStorage();

  await new Promise((resolve) => setTimeout(resolve, 250));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // 1. KIỂM TRA IDEMPOTENCY & GIẢ LẬP SỰ CỐ QUA SỐ TÀI KHOẢN:
  const cleanNumber = (dto.accountNumber || '').replace(/[\s-]+/g, '');
  if (cleanNumber === '0900000001' || cleanNumber === '9704000000000001') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (cleanNumber === '0900000002' || cleanNumber === '9704000000000002') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  const last4 = cleanNumber.slice(-4);
  const existingPayload = mockPaymentsPayloadDatabase.get(idempotencyKey);

  // Nếu cùng key nhưng body thanh toán khác (đổi orderId, đổi Ví/Thẻ hoặc đổi số tài khoản):
  // Server từ chối (409 Conflict), không xử lý giao dịch lần hai.
  if (existingPayload) {
    if (
      existingPayload.orderId !== orderId ||
      existingPayload.method !== dto.method ||
      existingPayload.last4 !== last4
    ) {
      throw new OrderApiError(409, ORDER_ERROR_MESSAGES.IDEMPOTENCY_MISMATCH);
    }
  }

  // Nếu đã xử lý với key này trước đó và body khớp -> trả lại kết quả cũ (không trừ tiền lần 2)
  const existingPayment = mockPaymentsDatabase.get(idempotencyKey);
  if (existingPayment) {
    if (existingPayment.status === 'SUCCESS') {
      return existingPayment;
    }
    // Nếu lần trước thất bại với cùng key này
    throw new OrderApiError(402, ORDER_ERROR_MESSAGES.PAYMENT_REJECTED, {
      errorData: existingPayment,
    });
  }

  // Lưu payload của lần gửi đầu tiên với key này (chỉ lưu 4 số cuối)
  if (!existingPayload) {
    mockPaymentsPayloadDatabase.set(idempotencyKey, {
      orderId,
      method: dto.method,
      last4,
    });
    persistMockDatabaseToStorage();
  }

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, 'Không tìm thấy thông tin đơn hàng');
  }

  // Nếu đơn đã quá hạn
  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'CANCELLED';
    persistMockDatabaseToStorage();
    throw new OrderApiError(410, ORDER_ERROR_MESSAGES.ORDER_EXPIRED);
  }

  // Nếu đơn đã được thanh toán trước đó
  if (order.status === 'PAID') {
    const successResult: PaymentResponse = {
      id: `pay-${Date.now()}`,
      orderId,
      amount: order.totalAmount,
      method: dto.method,
      status: 'SUCCESS',
      orderStatus: 'PAID',
      idempotencyKey,
      gatewayRef: `GW-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    mockPaymentsDatabase.set(idempotencyKey, successResult);
    persistMockDatabaseToStorage();
    return successResult;
  }

  // 2. QUY TẮC MÔ PHỎNG: số kết thúc bằng 0 -> THẤT BẠI
  if (cleanNumber.endsWith('0')) {
    order.status = 'PAYMENT_FAILED';

    const failedPayment: PaymentResponse = {
      id: `pay-failed-${Date.now()}`,
      orderId,
      amount: order.totalAmount,
      method: dto.method,
      status: 'FAILED',
      orderStatus: 'PAYMENT_FAILED',
      idempotencyKey,
      createdAt: new Date().toISOString(),
      message: ORDER_ERROR_MESSAGES.PAYMENT_REJECTED,
    };
    mockPaymentsDatabase.set(idempotencyKey, failedPayment);
    persistMockDatabaseToStorage();

    throw new OrderApiError(402, ORDER_ERROR_MESSAGES.PAYMENT_REJECTED, {
      errorData: failedPayment,
    });
  }

  // 3. THANH TOÁN THÀNH CÔNG
  order.status = 'PAID';
  const successPayment: PaymentResponse = {
    id: `pay-${Date.now()}`,
    orderId,
    amount: order.totalAmount,
    method: dto.method,
    status: 'SUCCESS',
    orderStatus: 'PAID',
    idempotencyKey,
    gatewayRef: `MOCK-GW-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  mockPaymentsDatabase.set(idempotencyKey, successPayment);
  persistMockDatabaseToStorage();
  return successPayment;
}

/**
 * Giả lập tra cứu đơn hàng theo ID
 */
export async function mockGetOrderById(orderId: string): Promise<OrderResponse> {
  // Đồng bộ dữ liệu mock từ storage
  loadMockDatabaseFromStorage();

  await new Promise((resolve) => setTimeout(resolve, 100));

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, 'Không tìm thấy đơn hàng');
  }

  // Tự động chuyển CANCELLED nếu hết hạn
  if (order.status === 'PENDING' && new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'CANCELLED';
    persistMockDatabaseToStorage();
  }

  return order;
}

