import { apiFetch, AuthApiError } from './auth';
import {
  CreateOrderDto,
  ORDER_ENDPOINTS,
  ORDER_ERROR_MESSAGES,
  OrderResponse,
  PaymentDto,
  PaymentResponse,
} from './order-contract';
import { MOCK_PRODUCTS } from './api';

export class OrderApiError extends Error {
  statusCode: number;
  errorData?: unknown;
  outOfStockItems?: string[];

  constructor(
    statusCode: number,
    message: string,
    options?: { errorData?: unknown; outOfStockItems?: string[] }
  ) {
    super(message);
    this.name = 'OrderApiError';
    this.statusCode = statusCode;
    this.errorData = options?.errorData;
    this.outOfStockItems = options?.outOfStockItems;
  }
}

/**
 * Kiểm tra xem có đang bật chế độ Mock Đơn hàng/Thanh toán hay không
 */
export function isMockOrdersActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_ORDERS === 'true';
}

// =========================================================================
// MOCK DATABASE & SIMULATION HANDLERS
// =========================================================================

interface MockOrderRecord extends OrderResponse {
  userId?: string;
}

const mockOrdersDatabase: Map<string, MockOrderRecord> = new Map();
const mockPaymentsDatabase: Map<string, PaymentResponse> = new Map();

// Cờ giả lập lỗi mạng để phục vụ kiểm thử
let mockNetworkSimulation: 'timeout' | 'offline' | null = null;

export function setMockNetworkSimulation(type: 'timeout' | 'offline' | null): void {
  mockNetworkSimulation = type;
}

export function resetMockOrdersDatabase(): void {
  mockOrdersDatabase.clear();
  mockPaymentsDatabase.clear();
  mockNetworkSimulation = null;
}

/**
 * Giả lập tạo đơn hàng phía server
 */
async function mockCreateOrder(dto: CreateOrderDto): Promise<OrderResponse> {
  // Giả lập độ trễ mạng 200ms
  await new Promise((resolve) => setTimeout(resolve, 200));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
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
  return orderRecord;
}

/**
 * Giả lập thanh toán phía server với kiểm soát Idempotency
 */
async function mockPayOrder(
  orderId: string,
  dto: PaymentDto,
  idempotencyKey: string
): Promise<PaymentResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  if (mockNetworkSimulation === 'timeout') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
  }
  if (mockNetworkSimulation === 'offline') {
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR);
  }

  // 1. KIỂM TRA IDEMPOTENCY: Nếu đã xử lý với key này trước đó -> trả lại kết quả cũ
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

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, 'Không tìm thấy thông tin đơn hàng');
  }

  // Nếu đơn đã quá hạn
  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'CANCELLED';
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
    return successResult;
  }

  // 2. QUY TẮC MÔ PHỎNG: số kết thúc bằng 0 -> THẤT BẠI
  const cleanNumber = (dto.accountNumber || '').replace(/[\s-]+/g, '');
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
  return successPayment;
}

/**
 * Giả lập tra cứu đơn hàng theo ID
 */
async function mockGetOrderById(orderId: string): Promise<OrderResponse> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const order = mockOrdersDatabase.get(orderId);
  if (!order) {
    throw new OrderApiError(404, 'Không tìm thấy đơn hàng');
  }

  // Tự động chuyển CANCELLED nếu hết hạn
  if (order.status === 'PENDING' && new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'CANCELLED';
  }

  return order;
}

// =========================================================================
// API CALLS (Chuyển tiếp qua apiFetch khi kết nối backend thật)
// =========================================================================

/**
 * Tạo đơn hàng mới
 */
export async function createOrderApi(dto: CreateOrderDto): Promise<OrderResponse> {
  if (isMockOrdersActive()) {
    return mockCreateOrder(dto);
  }

  try {
    return await apiFetch<OrderResponse>(ORDER_ENDPOINTS.CREATE, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  } catch (err: unknown) {
    if (err instanceof AuthApiError) {
      const errorData = err.errorData as Record<string, unknown> | undefined;
      const outOfStockItems = Array.isArray(errorData?.outOfStockItems)
        ? (errorData?.outOfStockItems as string[])
        : undefined;

      throw new OrderApiError(err.statusCode, err.message, {
        errorData: err.errorData,
        outOfStockItems,
      });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}

/**
 * Thanh toán đơn hàng kèm header Idempotency-Key
 */
export async function payOrderApi(
  orderId: string,
  dto: PaymentDto,
  idempotencyKey: string
): Promise<PaymentResponse> {
  if (isMockOrdersActive()) {
    return mockPayOrder(orderId, dto, idempotencyKey);
  }

  try {
    return await apiFetch<PaymentResponse>(ORDER_ENDPOINTS.PAY(orderId), {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(dto),
    });
  } catch (err: unknown) {
    if (err instanceof AuthApiError) {
      throw new OrderApiError(err.statusCode, err.message, { errorData: err.errorData });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}

/**
 * Tra cứu đơn hàng theo ID (kiểm tra trạng thái đơn chờ)
 * [CHỜ XÁC NHẬN TỪ BACKEND]: Dùng để đối chiếu khi F5/mở lại trang
 */
export async function getOrderByIdApi(orderId: string): Promise<OrderResponse> {
  if (isMockOrdersActive()) {
    return mockGetOrderById(orderId);
  }

  try {
    return await apiFetch<OrderResponse>(ORDER_ENDPOINTS.GET_BY_ID(orderId), {
      method: 'GET',
    });
  } catch (err: unknown) {
    if (err instanceof AuthApiError) {
      throw new OrderApiError(err.statusCode, err.message, { errorData: err.errorData });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}
