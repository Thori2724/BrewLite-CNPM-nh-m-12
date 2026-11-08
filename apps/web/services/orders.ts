import { apiFetch, AuthApiError } from './auth';
import {
  CreateOrderDto,
  ORDER_ENDPOINTS,
  ORDER_ERROR_MESSAGES,
  OrderResponse,
  PaymentDto,
  PaymentResponse,
} from './order-contract';
import {
  isMockOrdersActive,
  mockCreateOrder,
  mockPayOrder,
  mockGetOrderById,
  setMockNetworkSimulation,
  resetMockOrdersDatabase,
  clearMockMemoryOnlyForTesting,
  MOCK_ORDERS_STORAGE_KEY,
} from '../mocks/mock-orders';

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

// Re-export các mock helper để tương thích với các component và test suite hiện hữu
export {
  isMockOrdersActive,
  setMockNetworkSimulation,
  resetMockOrdersDatabase,
  clearMockMemoryOnlyForTesting,
  MOCK_ORDERS_STORAGE_KEY,
};

// =========================================================================
// API CALLS (Chuyển tiếp qua mock khi bật cờ hoặc gọi apiFetch tới backend thật)
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
