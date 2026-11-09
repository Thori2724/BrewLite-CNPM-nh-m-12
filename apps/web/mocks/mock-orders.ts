import {
  CreateOrderDto,
  ORDER_ERROR_MESSAGES,
  OrderItemResponse,
  OrderResponse,
  OutOfStockDetail,
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

export const MOCK_ORDERS_STORAGE_KEY = 'brewlite_mock_orders_db_v2';
const LEGACY_MOCK_ORDERS_STORAGE_KEY = 'brewlite_mock_orders_db_v1';

export interface StoredMockDatabase {
  lastOrderNumber: number;
  orders: Record<string, MockOrderRecord>;
  payments: Record<string, PaymentResponse>;
}

let mockLastOrderNumber = 1000;
export const mockOrdersDatabase: Map<string, MockOrderRecord> = new Map();
export const mockPaymentsDatabase: Map<string, PaymentResponse> = new Map();

/**
 * Nạp dữ liệu mock từ localStorage (phục vụ F5 / reload trang khi bật mock)
 */
export function loadMockDatabaseFromStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    // Tự động dọn dẹp key cũ v1
    window.localStorage.removeItem(LEGACY_MOCK_ORDERS_STORAGE_KEY);

    const raw = window.localStorage.getItem(MOCK_ORDERS_STORAGE_KEY);
    if (!raw) return;

    const parsed: StoredMockDatabase = JSON.parse(raw);

    if (typeof parsed.lastOrderNumber === 'number' && parsed.lastOrderNumber >= 1000) {
      mockLastOrderNumber = Math.max(mockLastOrderNumber, parsed.lastOrderNumber);
    }

    if (parsed.orders && typeof parsed.orders === 'object') {
      for (const [id, order] of Object.entries(parsed.orders)) {
        mockOrdersDatabase.set(id, order);
      }
    }

    if (parsed.payments && typeof parsed.payments === 'object') {
      for (const [key, payment] of Object.entries(parsed.payments)) {
        mockPaymentsDatabase.set(key, payment);
      }
    }
  } catch {
    // Dữ liệu storage bị hỏng thì bỏ qua
  }
}

/**
 * Đồng bộ dữ liệu mock vào localStorage
 * BẢO MẬT: Chỉ lưu 4 số cuối của số thẻ/ví trong PaymentResponse, không lưu trọn vẹn số thẻ/ví.
 */
export function persistMockDatabaseToStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    const ordersObj: Record<string, MockOrderRecord> = {};
    mockOrdersDatabase.forEach((val, key) => {
      ordersObj[key] = val;
    });

    const paymentsObj: Record<string, PaymentResponse> = {};
    mockPaymentsDatabase.forEach((val, key) => {
      paymentsObj[key] = val;
    });

    const data: StoredMockDatabase = {
      lastOrderNumber: mockLastOrderNumber,
      orders: ordersObj,
      payments: paymentsObj,
    };

    window.localStorage.setItem(MOCK_ORDERS_STORAGE_KEY, JSON.stringify(data));
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
  mockLastOrderNumber = 1000;
  mockOrdersDatabase.clear();
  mockPaymentsDatabase.clear();
  mockNetworkSimulation = null;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(MOCK_ORDERS_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_MOCK_ORDERS_STORAGE_KEY);
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
  mockLastOrderNumber = 1000;
}

/**
 * Giả lập tạo đơn hàng phía server POST /orders
 */
export async function mockCreateOrder(dto: CreateOrderDto): Promise<OrderResponse> {
  // Đồng bộ dữ liệu mock từ storage
  loadMockDatabaseFromStorage();

  // Giả lập độ trễ mạng
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // Giả lập qua ghi chú
  const lowerNote = (dto.note || '').toLowerCase();
  if (lowerNote.includes('hethang') || lowerNote.includes('hết hàng')) {
    const details: OutOfStockDetail[] = [
      {
        productId: 'mock-p-out',
        name: 'Trà đào cam sả',
        available: 0,
      },
    ];
    throw new OrderApiError(409, ORDER_ERROR_MESSAGES.OUT_OF_STOCK, {
      details,
      outOfStockItems: ['Trà đào cam sả'],
      errorData: { statusCode: 409, message: ORDER_ERROR_MESSAGES.OUT_OF_STOCK, details },
    });
  }
  if (lowerNote.includes('timeout')) {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (lowerNote.includes('offline')) {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // 1. Kiểm tra tồn kho (stock <= 0 là hết hàng)
  const outOfStockDetails: OutOfStockDetail[] = [];
  for (const item of dto.items) {
    if (item.productId === '3') {
      outOfStockDetails.push({
        productId: '3',
        name: 'Trà đào cam sả',
        available: 0,
      });
      continue;
    }
    const product = MOCK_PRODUCTS.find((p) => p.id === item.productId);
    if (product && product.stock <= 0) {
      outOfStockDetails.push({
        productId: product.id,
        name: product.name,
        available: product.stock,
      });
    }
  }

  if (outOfStockDetails.length > 0) {
    throw new OrderApiError(409, ORDER_ERROR_MESSAGES.OUT_OF_STOCK, {
      details: outOfStockDetails,
      outOfStockItems: outOfStockDetails.map((d) => d.name),
      errorData: {
        statusCode: 409,
        message: ORDER_ERROR_MESSAGES.OUT_OF_STOCK,
        details: outOfStockDetails,
      },
    });
  }

  // 2. SERVER TỰ TÍNH TIỀN (tuyệt đối không nhận giá từ client)
  let calculatedTotal = 0;
  const processedItems: OrderItemResponse[] = dto.items.map((item) => {
    const product = MOCK_PRODUCTS.find(
      (p) =>
        p.id === item.productId ||
        (item.productId === '1' && p.id === '11111111-0000-0000-0000-000000000001')
    );
    const basePrice = product ? product.basePrice : 29000;
    let unitPrice = basePrice;

    if (item.size === 'M') unitPrice += 6000;
    if (item.size === 'L') unitPrice += 10000;

    if (item.toppingIds && item.toppingIds.length > 0) {
      unitPrice += item.toppingIds.length * 10000;
    }

    const lineTotal = unitPrice * item.quantity;
    calculatedTotal += lineTotal;

    return {
      productId: item.productId,
      productName: product ? product.name : 'Đồ uống BrewLite',
      size: item.size,
      sugarLevel: item.sugarLevel,
      iceLevel: item.iceLevel,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      note: item.note,
    };
  });

  mockLastOrderNumber += 1;
  const orderNumber = mockLastOrderNumber;
  const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const orderRecord: MockOrderRecord = {
    id: orderId,
    orderNumber,
    status: 'PENDING',
    receiveType: dto.receiveType || 'AT_COUNTER',
    note: dto.note,
    totalAmount: calculatedTotal,
    createdAt: new Date().toISOString(),
    items: processedItems,
    payments: [],
  };

  mockOrdersDatabase.set(orderId, orderRecord);
  persistMockDatabaseToStorage();
  return orderRecord;
}

/**
 * Giả lập thanh toán phía server POST /payments với kiểm soát Idempotency
 */
export async function mockPayOrder(
  orderIdOrDto: string | PaymentDto,
  dtoOrKey: PaymentDto | string,
  maybeKey?: string
): Promise<PaymentResponse> {
  // Đồng bộ dữ liệu mock từ storage
  loadMockDatabaseFromStorage();

  let actualDto: PaymentDto;
  let idempotencyKey: string;

  if (typeof orderIdOrDto === 'string') {
    actualDto = { ...(dtoOrKey as PaymentDto), orderId: orderIdOrDto };
    idempotencyKey = maybeKey || '';
  } else {
    actualDto = orderIdOrDto;
    idempotencyKey = (dtoOrKey as string) || '';
  }

  const orderId = actualDto.orderId;

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // 1. Kiểm tra tài khoản mô phỏng đặc biệt
  const cleanNumber = (actualDto.accountNumber || '').replace(/[\s-]+/g, '');
  if (cleanNumber === '9999999991') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (cleanNumber === '9999999992') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // 2. IDEMPOTENCY:
  const existingPayment = mockPaymentsDatabase.get(idempotencyKey);
  if (existingPayment) {
    if (existingPayment.orderId !== orderId) {
      // Cùng key nhưng khác orderId -> 409 Conflict
      throw new OrderApiError(409, ORDER_ERROR_MESSAGES.IDEMPOTENCY_MISMATCH);
    }
    // Cùng key + cùng orderId -> Luôn trả 200 với kết quả cũ
    return existingPayment;
  }

  // 3. Kiểm tra đơn hàng tồn tại
  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND);
  }

  // 4. Kiểm tra trạng thái cho phép thanh toán (chỉ PENDING và PAYMENT_FAILED)
  if (order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED') {
    throw new OrderApiError(409, ORDER_ERROR_MESSAGES.ORDER_NOT_PAYABLE);
  }

  const last4 = cleanNumber.slice(-4);

  // 5. QUY TẮC MÔ PHỎNG: số kết thúc bằng '0000' -> THẤT BẠI (201 status: 'FAILED')
  if (cleanNumber.endsWith('0000')) {
    order.status = 'PAYMENT_FAILED';

    const failedPayment: PaymentResponse = {
      id: `pay-failed-${Date.now()}`,
      orderId,
      method: actualDto.method,
      accountLast4: last4,
      amount: order.totalAmount,
      status: 'FAILED',
      failureReason: 'Giao dịch bị từ chối (mô phỏng)',
      createdAt: new Date().toISOString(),
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: 'PAYMENT_FAILED',
      },
    };

    if (!order.payments) order.payments = [];
    order.payments.push({
      id: failedPayment.id,
      method: failedPayment.method,
      accountLast4: failedPayment.accountLast4,
      amount: failedPayment.amount,
      status: 'FAILED',
      failureReason: failedPayment.failureReason,
      createdAt: failedPayment.createdAt,
    });

    mockPaymentsDatabase.set(idempotencyKey, failedPayment);
    persistMockDatabaseToStorage();
    return failedPayment;
  }

  // 6. THANH TOÁN THÀNH CÔNG (201 status: 'SUCCESS')
  order.status = 'PAID';
  const successPayment: PaymentResponse = {
    id: `pay-${Date.now()}`,
    orderId,
    method: actualDto.method,
    accountLast4: last4,
    amount: order.totalAmount,
    status: 'SUCCESS',
    createdAt: new Date().toISOString(),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: 'PAID',
    },
  };

  if (!order.payments) order.payments = [];
  order.payments.push({
    id: successPayment.id,
    method: successPayment.method,
    accountLast4: successPayment.accountLast4,
    amount: successPayment.amount,
    status: 'SUCCESS',
    createdAt: successPayment.createdAt,
  });

  mockPaymentsDatabase.set(idempotencyKey, successPayment);
  persistMockDatabaseToStorage();
  return successPayment;
}

/**
 * Giả lập tra cứu đơn hàng theo ID GET /orders/:id
 */
export async function mockGetOrderById(orderId: string): Promise<OrderResponse> {
  // Đồng bộ dữ liệu mock từ storage
  loadMockDatabaseFromStorage();

  await new Promise((resolve) => setTimeout(resolve, 50));

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND);
  }

  return order;
}
