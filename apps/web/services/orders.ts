import { apiFetch, AuthApiError } from './auth';
import { AUTH_ERROR_MESSAGES } from './auth-contract';
import {
  CreateOrderDto,
  ORDER_ENDPOINTS,
  ORDER_ERROR_MESSAGES,
  OrderResponse,
  OutOfStockDetail,
  PaymentDto,
  PaymentResponse,
} from './order-contract';
import {
  isMockOrdersActive,
  mockCreateOrder,
  mockPayOrder,
  mockGetOrderById,
  mockGetMyOrders,
  setMockNetworkSimulation,
  setMockEmptyOrdersSimulation,
  isMockEmptyOrdersSimulated,
  resetMockOrdersDatabase,
  clearMockMemoryOnlyForTesting,
  MOCK_ORDERS_STORAGE_KEY,
  MOCK_ORDERS_EMPTY_SIMULATION_KEY,
  MOCK_SEED_ORDERS,
} from '../mocks/mock-orders';

export class OrderApiError extends Error {
  statusCode: number;
  errorData?: unknown;
  details?: OutOfStockDetail[];
  outOfStockItems?: string[];

  constructor(
    statusCode: number,
    message: string,
    options?: {
      errorData?: unknown;
      details?: OutOfStockDetail[];
      outOfStockItems?: string[];
    }
  ) {
    super(message);
    this.name = 'OrderApiError';
    this.statusCode = statusCode;
    this.errorData = options?.errorData;
    this.details = options?.details;
    this.outOfStockItems = options?.outOfStockItems;
  }
}

// Re-export các mock helper để tương thích với các component và test suite
export {
  isMockOrdersActive,
  setMockNetworkSimulation,
  setMockEmptyOrdersSimulation,
  isMockEmptyOrdersSimulated,
  resetMockOrdersDatabase,
  clearMockMemoryOnlyForTesting,
  MOCK_ORDERS_STORAGE_KEY,
  MOCK_ORDERS_EMPTY_SIMULATION_KEY,
  MOCK_SEED_ORDERS,
};

// =========================================================================
// API CALLS (Chuyển tiếp qua mock khi bật cờ hoặc gọi apiFetch tới backend thật)
// =========================================================================

/**
 * Tạo đơn hàng mới POST /orders
 * Server tự tính tiền, client tuyệt đối không gửi giá
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
      const details = Array.isArray(errorData?.details)
        ? (errorData?.details as OutOfStockDetail[])
        : undefined;
      const outOfStockItems = details
        ? details.map((d) => d.name)
        : Array.isArray(errorData?.outOfStockItems)
          ? (errorData?.outOfStockItems as string[])
          : undefined;

      let msg = typeof err.message === 'string' ? err.message : '';
      if (err.statusCode === 409) {
        msg = msg || ORDER_ERROR_MESSAGES.OUT_OF_STOCK;
      } else if (err.statusCode === 400) {
        msg =
          msg && msg !== AUTH_ERROR_MESSAGES.UNKNOWN_ERROR
            ? msg
            : AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
      } else if (!msg) {
        msg = ORDER_ERROR_MESSAGES.UNKNOWN_ERROR;
      }

      throw new OrderApiError(err.statusCode, msg, {
        errorData: err.errorData,
        details,
        outOfStockItems,
      });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}

/**
 * Thanh toán đơn hàng POST /payments kèm header Idempotency-Key
 * Hỗ trợ cả 2 dạng gọi:
 * - payOrderApi(dto, idempotencyKey)
 * - payOrderApi(orderId, dto, idempotencyKey) (tương thích ngược)
 */
export async function payOrderApi(
  orderIdOrDto: string | PaymentDto,
  dtoOrKey: PaymentDto | string,
  maybeKey?: string
): Promise<PaymentResponse> {
  let actualDto: PaymentDto;
  let idempotencyKey: string;

  if (typeof orderIdOrDto === 'string') {
    actualDto = { ...(dtoOrKey as PaymentDto), orderId: orderIdOrDto };
    idempotencyKey = maybeKey || '';
  } else {
    actualDto = orderIdOrDto;
    idempotencyKey = (dtoOrKey as string) || '';
  }

  if (isMockOrdersActive()) {
    return mockPayOrder(actualDto, idempotencyKey);
  }

  try {
    return await apiFetch<PaymentResponse>(ORDER_ENDPOINTS.PAY, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(actualDto),
    });
  } catch (err: unknown) {
    if (err instanceof AuthApiError) {
      let msg = typeof err.message === 'string' ? err.message : '';
      if (err.statusCode === 400) {
        msg = ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID;
      } else if (err.statusCode === 409) {
        msg = msg || ORDER_ERROR_MESSAGES.ORDER_NOT_PAYABLE;
      } else if (!msg) {
        msg = ORDER_ERROR_MESSAGES.UNKNOWN_ERROR;
      }
      throw new OrderApiError(err.statusCode, msg, { errorData: err.errorData });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}

/**
 * Tra cứu đơn hàng theo ID GET /orders/:id (kiểm tra trạng thái đơn khi F5 / mở lại trang)
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
      const msg =
        err.statusCode === 404
          ? ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND
          : typeof err.message === 'string'
            ? err.message
            : ORDER_ERROR_MESSAGES.UNKNOWN_ERROR;
      throw new OrderApiError(err.statusCode, msg, { errorData: err.errorData });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}

/**
 * Lấy danh sách lịch sử đơn hàng của người dùng đang đăng nhập GET /orders/me
 */
export async function getMyOrdersApi(): Promise<OrderResponse[]> {
  if (isMockOrdersActive()) {
    return mockGetMyOrders();
  }

  try {
    return await apiFetch<OrderResponse[]>(ORDER_ENDPOINTS.MY_ORDERS, {
      method: 'GET',
    });
  } catch (err: unknown) {
    if (err instanceof AuthApiError) {
      const msg =
        typeof err.message === 'string' && err.message.trim()
          ? err.message
          : ORDER_ERROR_MESSAGES.UNKNOWN_ERROR;
      throw new OrderApiError(err.statusCode, msg, { errorData: err.errorData });
    }
    throw new OrderApiError(0, ORDER_ERROR_MESSAGES.NETWORK_ERROR, { errorData: err });
  }
}
