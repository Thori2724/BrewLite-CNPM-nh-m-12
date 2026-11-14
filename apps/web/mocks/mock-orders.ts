import { ApiHttpError } from '../services/auth-contract';
import {
  CreateOrderDto,
  GetOrdersParams,
  ORDER_ERROR_MESSAGES,
  ORDER_STATUS_LABELS,
  OrderCustomer,
  OrderItemResponse,
  OrderResponse,
  OrderStatus,
  OutOfStockDetail,
  PaymentDto,
  PaymentResponse,
  StaffUpdatableOrderStatus,
} from '../services/order-contract';
import { OrderApiError } from '../services/orders';
import { isMockOrdersActive } from './mock-config';
import { MOCK_PRODUCTS, MOCK_TOPPINGS } from './mock-products';

export { isMockOrdersActive };

export const MOCK_DEFAULT_CUSTOMER: OrderCustomer = {
  id: '44444444-0000-0000-0000-000000000001',
  displayName: 'Khách demo',
  email: 'khach@example.com',
};

export interface MockOrderRecord extends OrderResponse {
  userId?: string;
}

export const MOCK_ORDERS_STORAGE_KEY = 'brewlite_mock_orders_db_v2';
export const MOCK_ORDERS_EMPTY_SIMULATION_KEY = 'brewlite_mock_orders_empty';
const LEGACY_MOCK_ORDERS_STORAGE_KEY = 'brewlite_mock_orders_db_v1';

/**
 * Danh sách 4 đơn hàng mẫu mặc định đúng hình dạng hợp đồng (mục 2.8 & 2.9 docs/api-contract.md)
 * Sắp xếp mới nhất lên trước (orderNumber 1004 -> 1001)
 */
export const MOCK_SEED_ORDERS: MockOrderRecord[] = [
  // 1. Đơn PAID (2 món: 1 món nước có topping + 1 món bánh size/sugarLevel/iceLevel = null)
  {
    id: '33333333-0000-0000-0000-000000000001',
    orderNumber: 1001,
    status: 'PAID',
    receiveType: 'TAKE_AWAY',
    note: 'Cho xin thêm quai xách giấy',
    totalAmount: 136000,
    createdAt: '2026-11-05T03:00:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000001',
        productId: '11111111-0000-0000-0000-000000000007',
        productName: 'Trà sữa truyền thống',
        size: 'M',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        quantity: 2,
        unitPrice: 53000,
        lineTotal: 106000,
        note: 'Ít ngọt vừa phải',
        toppings: [
          { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
          { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
        ],
      },
      {
        id: '88888888-0000-0000-0000-000000000002',
        productId: '11111111-0000-0000-0000-000000000010',
        productName: 'Bánh Croissant',
        size: null,
        sugarLevel: null,
        iceLevel: null,
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 30000,
        note: 'Hâm nóng bánh giúp mình',
        toppings: [],
      },
    ],
    payments: [
      {
        id: '44444444-0000-0000-0000-000000000001',
        method: 'WALLET',
        accountLast4: '4321',
        status: 'SUCCESS',
        failureReason: null,
        createdAt: '2026-11-05T03:02:00.000Z',
      },
    ],
  },
  // 2. Đơn PENDING (chưa có giao dịch thanh toán)
  {
    id: '33333333-0000-0000-0000-000000000002',
    orderNumber: 1002,
    status: 'PENDING',
    receiveType: 'AT_COUNTER',
    note: null,
    totalAmount: 29000,
    createdAt: '2026-11-05T04:15:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000003',
        productId: '11111111-0000-0000-0000-000000000001',
        productName: 'Cà phê sữa đá',
        size: 'S',
        sugarLevel: 'P100',
        iceLevel: 'NORMAL',
        quantity: 1,
        unitPrice: 29000,
        lineTotal: 29000,
        note: null,
        toppings: [],
      },
    ],
    payments: [],
  },
  // 3. Đơn PAYMENT_FAILED (có payment FAILED với failureReason: "Giao dịch bị từ chối (mô phỏng)")
  {
    id: '33333333-0000-0000-0000-000000000003',
    orderNumber: 1003,
    status: 'PAYMENT_FAILED',
    receiveType: 'TAKE_AWAY',
    note: 'Gọi điện khi tới sảnh',
    totalAmount: 49000,
    createdAt: '2026-11-05T05:30:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000004',
        productId: '11111111-0000-0000-0000-000000000004',
        productName: 'Trà đào cam sả',
        size: 'L',
        sugarLevel: 'P50',
        iceLevel: 'LOW',
        quantity: 1,
        unitPrice: 49000,
        lineTotal: 49000,
        note: null,
        toppings: [],
      },
    ],
    payments: [
      {
        id: '44444444-0000-0000-0000-000000000002',
        method: 'CARD',
        accountLast4: '0000',
        status: 'FAILED',
        failureReason: 'Giao dịch bị từ chối (mô phỏng)',
        createdAt: '2026-11-05T05:31:00.000Z',
      },
    ],
  },
  // 4. Đơn READY (để kiểm tra giao diện trạng thái chưa có API kích hoạt)
  {
    id: '33333333-0000-0000-0000-000000000004',
    orderNumber: 1004,
    status: 'READY',
    receiveType: 'AT_COUNTER',
    note: null,
    totalAmount: 65000,
    createdAt: '2026-11-05T06:45:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000005',
        productId: '11111111-0000-0000-0000-000000000001',
        productName: 'Cà phê sữa đá',
        size: 'M',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        quantity: 1,
        unitPrice: 35000,
        lineTotal: 35000,
        note: null,
        toppings: [],
      },
      {
        id: '88888888-0000-0000-0000-000000000006',
        productId: '11111111-0000-0000-0000-000000000010',
        productName: 'Bánh Croissant',
        size: null,
        sugarLevel: null,
        iceLevel: null,
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 30000,
        note: null,
        toppings: [],
      },
    ],
    payments: [
      {
        id: '44444444-0000-0000-0000-000000000003',
        method: 'WALLET',
        accountLast4: '8888',
        status: 'SUCCESS',
        failureReason: null,
        createdAt: '2026-11-05T06:46:00.000Z',
      },
    ],
  },
  // 5. Đơn PREPARING (đang pha chế)
  {
    id: '33333333-0000-0000-0000-000000000005',
    orderNumber: 1005,
    status: 'PREPARING',
    receiveType: 'AT_COUNTER',
    note: 'Ít đá giúp mình',
    totalAmount: 39000,
    createdAt: '2026-11-05T07:10:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000007',
        productId: '11111111-0000-0000-0000-000000000004',
        productName: 'Trà đào cam sả',
        size: 'S',
        sugarLevel: 'P70',
        iceLevel: 'LOW',
        quantity: 1,
        unitPrice: 39000,
        lineTotal: 39000,
        note: null,
        toppings: [],
      },
    ],
    payments: [
      {
        id: '44444444-0000-0000-0000-000000000004',
        method: 'WALLET',
        accountLast4: '0001',
        status: 'SUCCESS',
        failureReason: null,
        createdAt: '2026-11-05T07:11:00.000Z',
      },
    ],
  },
  // 6. Đơn COMPLETED (hoàn thành)
  {
    id: '33333333-0000-0000-0000-000000000006',
    orderNumber: 1006,
    status: 'COMPLETED',
    receiveType: 'TAKE_AWAY',
    note: null,
    totalAmount: 35000,
    createdAt: '2026-11-05T08:00:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000008',
        productId: '11111111-0000-0000-0000-000000000001',
        productName: 'Cà phê sữa đá',
        size: 'M',
        sugarLevel: 'P100',
        iceLevel: 'NORMAL',
        quantity: 1,
        unitPrice: 35000,
        lineTotal: 35000,
        note: null,
        toppings: [],
      },
    ],
    payments: [
      {
        id: '44444444-0000-0000-0000-000000000005',
        method: 'WALLET',
        accountLast4: '0001',
        status: 'SUCCESS',
        failureReason: null,
        createdAt: '2026-11-05T08:01:00.000Z',
      },
    ],
  },
  // 7. Đơn CANCELLED (đã hủy sau khi thanh toán)
  {
    id: '33333333-0000-0000-0000-000000000007',
    orderNumber: 1007,
    status: 'CANCELLED',
    receiveType: 'AT_COUNTER',
    note: 'Đổi ý không đặt nữa',
    totalAmount: 30000,
    createdAt: '2026-11-05T08:30:00.000Z',
    items: [
      {
        id: '88888888-0000-0000-0000-000000000009',
        productId: '11111111-0000-0000-0000-000000000010',
        productName: 'Bánh Croissant',
        size: null,
        sugarLevel: null,
        iceLevel: null,
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 30000,
        note: null,
        toppings: [],
      },
    ],
    payments: [
      {
        id: '44444444-0000-0000-0000-000000000006',
        method: 'WALLET',
        accountLast4: '0001',
        status: 'SUCCESS',
        failureReason: null,
        createdAt: '2026-11-05T08:31:00.000Z',
      },
    ],
  },
];

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
// Cờ giả lập danh sách đơn hàng rỗng (phục vụ kiểm thử trạng thái empty)
let mockEmptyOrdersSimulation = false;

export function setMockNetworkSimulation(type: 'timeout' | 'offline' | null): void {
  mockNetworkSimulation = type;
}

export function setMockEmptyOrdersSimulation(isEmpty: boolean): void {
  mockEmptyOrdersSimulation = isEmpty;
  if (typeof window !== 'undefined') {
    try {
      if (isEmpty) {
        window.localStorage.setItem(MOCK_ORDERS_EMPTY_SIMULATION_KEY, 'true');
      } else {
        window.localStorage.removeItem(MOCK_ORDERS_EMPTY_SIMULATION_KEY);
      }
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
  }
}

export function isMockEmptyOrdersSimulated(): boolean {
  if (mockEmptyOrdersSimulation) return true;
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(MOCK_ORDERS_EMPTY_SIMULATION_KEY) === 'true';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Đảm bảo 4 đơn hàng mẫu mặc định được nạp sẵn vào Mock DB để người dùng có thể xem ngay
 * tại /orders và /orders/[id] khi chưa chạy Backend
 */
export function ensureSeedMockOrders(): void {
  for (const seed of MOCK_SEED_ORDERS) {
    if (!mockOrdersDatabase.has(seed.id)) {
      // Sao chép sâu để tránh đột biến dữ liệu gốc
      mockOrdersDatabase.set(seed.id, JSON.parse(JSON.stringify(seed)));
    }
  }
}

export function resetMockOrdersDatabase(): void {
  mockLastOrderNumber = 1000;
  mockOrdersDatabase.clear();
  mockPaymentsDatabase.clear();
  mockNetworkSimulation = null;
  mockEmptyOrdersSimulation = false;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(MOCK_ORDERS_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_MOCK_ORDERS_STORAGE_KEY);
      window.localStorage.removeItem(MOCK_ORDERS_EMPTY_SIMULATION_KEY);
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

  // 1. Kiểm tra món đang bán (stock <= 0 là tạm hết) - bản 2 chỉ trả productId và name
  const outOfStockDetails: OutOfStockDetail[] = [];
  for (const item of dto.items) {
    if (item.productId === '3') {
      outOfStockDetails.push({
        productId: '3',
        name: 'Trà đào cam sả',
      });
      continue;
    }
    const product = MOCK_PRODUCTS.find((p) => p.id === item.productId);
    if (product && product.stock <= 0) {
      outOfStockDetails.push({
        productId: product.id,
        name: product.name,
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
  const processedItems: OrderItemResponse[] = dto.items.map((item, idx) => {
    const product = MOCK_PRODUCTS.find(
      (p) =>
        p.id === item.productId ||
        (item.productId === '1' && p.id === '11111111-0000-0000-0000-000000000001')
    );
    const isCake = product?.category === 'CAKE';
    const basePrice = product ? product.basePrice : 29000;
    let unitPrice = basePrice;

    if (!isCake && item.size === 'M') unitPrice += 6000;
    if (!isCake && item.size === 'L') unitPrice += 10000;

    const resolvedToppings = !isCake && item.toppingIds
      ? item.toppingIds.map((tId) => {
          const found = MOCK_TOPPINGS.find((mt) => mt.id === tId);
          return found ? { ...found } : { id: tId, name: 'Topping', price: 10000 };
        })
      : [];

    for (const t of resolvedToppings) {
      unitPrice += t.price;
    }

    const lineTotal = unitPrice * item.quantity;
    calculatedTotal += lineTotal;

    return {
      id: `item-${Date.now()}-${idx}`,
      productId: item.productId,
      productName: product ? product.name : 'Đồ uống BrewLite',
      size: isCake ? null : (item.size ?? null),
      sugarLevel: isCake ? null : (item.sugarLevel ?? null),
      iceLevel: isCake ? null : (item.iceLevel ?? null),
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      note: item.note ?? null,
      toppings: resolvedToppings,
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
  // Đồng bộ dữ liệu mock từ storage và đảm bảo seed đơn mẫu có sẵn
  loadMockDatabaseFromStorage();
  ensureSeedMockOrders();

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
    status: 'SUCCESS',
    failureReason: null,
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
  // Đồng bộ dữ liệu mock từ storage và đảm bảo 4 đơn mẫu luôn sẵn có
  loadMockDatabaseFromStorage();
  ensureSeedMockOrders();

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // Cho phép giả lập 404 dễ dàng qua ID chứa '404' hoặc 'not-found' hoặc không tồn tại trong DB
  if (orderId === '404' || orderId === 'not-found') {
    throw new OrderApiError(404, ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND);
  }

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND);
  }

  return order;
}

/**
 * Giả lập lấy danh sách đơn hàng của tôi GET /orders/me
 * Server trả về sắp xếp từ mới nhất đến cũ nhất (createdAt giảm dần / orderNumber giảm dần)
 * Không bao gồm trường payments[] trong danh sách GET /orders/me theo đúng hợp đồng mục 2.8
 */
export async function mockGetMyOrders(): Promise<OrderResponse[]> {
  loadMockDatabaseFromStorage();
  ensureSeedMockOrders();

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  if (isMockEmptyOrdersSimulated()) {
    return [];
  }

  const allOrders = Array.from(mockOrdersDatabase.values());

  // Server sắp xếp mới nhất lên trước (theo thời gian tạo, nếu bằng nhau thì theo orderNumber giảm dần)
  allOrders.sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.orderNumber - a.orderNumber;
  });

  // Trả về danh sách theo đúng hợp đồng GET /orders/me (mục 2.8)
  return allOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    receiveType: order.receiveType,
    note: order.note ?? null,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    items: order.items,
  }));
}

const ALL_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'PAID',
  'PREPARING',
  'READY',
  'COMPLETED',
  'PAYMENT_FAILED',
  'CANCELLED',
];

const STAFF_UPDATABLE_STATUSES: StaffUpdatableOrderStatus[] = [
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
];

/**
 * Quy tắc chuyển trạng thái đơn hàng theo mục 5.7 & 5.8 hợp đồng API bản 2.
 */
export function validateOrderTransition(
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): boolean {
  if (toStatus === 'CANCELLED') {
    return (
      fromStatus === 'PENDING' ||
      fromStatus === 'PAYMENT_FAILED' ||
      fromStatus === 'PAID'
    );
  }
  if (fromStatus === 'PAID' && toStatus === 'PREPARING') return true;
  if (fromStatus === 'PREPARING' && toStatus === 'READY') return true;
  if (fromStatus === 'READY' && toStatus === 'COMPLETED') return true;
  return false;
}

/**
 * Giả lập GET /orders (STAFF, ADMIN): lấy toàn bộ đơn kèm customer, hỗ trợ lọc ?status=...
 */
export async function mockGetAllOrders(
  params?: GetOrdersParams
): Promise<OrderResponse[]> {
  loadMockDatabaseFromStorage();
  ensureSeedMockOrders();

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new ApiHttpError({ statusCode: 0, message: ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT });
  }
  if (mockNetworkSimulation === 'offline') {
    throw new ApiHttpError({ statusCode: 0, message: ORDER_ERROR_MESSAGES.NETWORK_ERROR });
  }

  if (params?.status && !ALL_ORDER_STATUSES.includes(params.status)) {
    throw new ApiHttpError({
      statusCode: 400,
      message: ORDER_ERROR_MESSAGES.INVALID_ORDER_STATUS,
      error: 'Bad Request',
    });
  }

  let allOrders = Array.from(mockOrdersDatabase.values());
  if (params?.status) {
    allOrders = allOrders.filter((order) => order.status === params.status);
  }

  allOrders.sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.orderNumber - a.orderNumber;
  });

  return allOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    receiveType: order.receiveType,
    note: order.note ?? null,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    items: order.items,
    customer: order.customer ?? MOCK_DEFAULT_CUSTOMER,
  }));
}

/**
 * Giả lập PATCH /orders/:id/status (STAFF, ADMIN)
 */
export async function mockUpdateOrderStatus(
  orderId: string,
  nextStatus: StaffUpdatableOrderStatus
): Promise<OrderResponse> {
  loadMockDatabaseFromStorage();
  ensureSeedMockOrders();

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new ApiHttpError({ statusCode: 0, message: ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT });
  }
  if (mockNetworkSimulation === 'offline') {
    throw new ApiHttpError({ statusCode: 0, message: ORDER_ERROR_MESSAGES.NETWORK_ERROR });
  }

  if (!STAFF_UPDATABLE_STATUSES.includes(nextStatus)) {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['status must be one of PREPARING, READY, COMPLETED, CANCELLED'],
      error: 'Bad Request',
    });
  }

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new ApiHttpError({
      statusCode: 404,
      message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      error: 'Not Found',
    });
  }

  if (!validateOrderTransition(order.status, nextStatus)) {
    throw new ApiHttpError({
      statusCode: 409,
      message: `Không thể chuyển đơn từ trạng thái '${ORDER_STATUS_LABELS[order.status]}' sang '${ORDER_STATUS_LABELS[nextStatus]}'`,
      error: 'Conflict',
    });
  }

  order.status = nextStatus;
  persistMockDatabaseToStorage();

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    receiveType: order.receiveType,
    note: order.note ?? null,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    items: order.items,
    customer: order.customer ?? MOCK_DEFAULT_CUSTOMER,
  };
}

/**
 * Giả lập POST /orders/:id/cancel
 */
export async function mockCancelOrder(orderId: string): Promise<OrderResponse> {
  loadMockDatabaseFromStorage();
  ensureSeedMockOrders();

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (mockNetworkSimulation === 'timeout') {
    throw new ApiHttpError({ statusCode: 0, message: ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT });
  }
  if (mockNetworkSimulation === 'offline') {
    throw new ApiHttpError({ statusCode: 0, message: ORDER_ERROR_MESSAGES.NETWORK_ERROR });
  }

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new ApiHttpError({
      statusCode: 404,
      message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      error: 'Not Found',
    });
  }

  if (!validateOrderTransition(order.status, 'CANCELLED')) {
    throw new ApiHttpError({
      statusCode: 409,
      message: ORDER_ERROR_MESSAGES.ORDER_CANCEL_INVALID,
      error: 'Conflict',
    });
  }

  order.status = 'CANCELLED';
  persistMockDatabaseToStorage();

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    receiveType: order.receiveType,
    note: order.note ?? null,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    items: order.items,
  };
}
