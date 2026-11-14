import { apiFetch, apiRequest, AuthApiError } from './auth';
import { AUTH_ERROR_MESSAGES } from './auth-contract';
import {
  CreateOrderDto,
  CreateOrderItemDto,
  GetOrdersParams,
  ORDER_ENDPOINTS,
  ORDER_ERROR_MESSAGES,
  OrderResponse,
  OutOfStockDetail,
  PaymentDto,
  PaymentResponse,
  StaffUpdatableOrderStatus,
  UpdateOrderStatusDto,
} from './order-contract';
import { isMockOrdersActive } from '../mocks/mock-config';
import {
  mockCreateOrder,
  mockPayOrder,
  mockGetOrderById,
  mockGetMyOrders,
  mockGetAllOrders,
  mockUpdateOrderStatus,
  mockCancelOrder,
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

function sanitizeCreateOrderDto(dto: CreateOrderDto): CreateOrderDto {
  const sanitizedItems: CreateOrderItemDto[] = (dto.items || []).map((item) => {
    const cleanItem: CreateOrderItemDto = {
      productId: item.productId,
      quantity: item.quantity,
    };
    if (item.size !== undefined) cleanItem.size = item.size;
    if (item.sugarLevel !== undefined) cleanItem.sugarLevel = item.sugarLevel;
    if (item.iceLevel !== undefined) cleanItem.iceLevel = item.iceLevel;
    if (item.toppingIds !== undefined) cleanItem.toppingIds = item.toppingIds;
    if (item.note !== undefined) cleanItem.note = item.note;
    return cleanItem;
  });

  const cleanDto: CreateOrderDto = {
    items: sanitizedItems,
  };
  if (dto.receiveType !== undefined) cleanDto.receiveType = dto.receiveType;
  if (dto.note !== undefined) cleanDto.note = dto.note;
  return cleanDto;
}

/**
 * Tạo đơn hàng mới POST /orders
 * Server tự tính tiền, client tuyệt đối không gửi giá
 */
export async function createOrderApi(dto: CreateOrderDto): Promise<OrderResponse> {
  const sanitizedDto = sanitizeCreateOrderDto(dto);

  if (isMockOrdersActive()) {
    return mockCreateOrder(sanitizedDto);
  }

  try {
    return await apiFetch<OrderResponse>(ORDER_ENDPOINTS.CREATE, {
      method: 'POST',
      body: JSON.stringify(sanitizedDto),
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

/**
 * Lấy toàn bộ đơn hàng của mọi khách (nhân viên/quản lý) GET /orders
 * Hỗ trợ lọc theo trạng thái tùy chọn `?status=...`
 */
export async function getAllOrdersApi(
  params?: GetOrdersParams
): Promise<OrderResponse[]> {
  if (isMockOrdersActive()) {
    return mockGetAllOrders(params);
  }

  const searchParams = new URLSearchParams();
  if (params?.status) {
    searchParams.set('status', params.status);
  }
  const queryString = searchParams.toString();
  const endpoint = `${ORDER_ENDPOINTS.LIST}${queryString ? `?${queryString}` : ''}`;

  return apiRequest<OrderResponse[]>(endpoint, {
    method: 'GET',
  });
}

/**
 * Cập nhật trạng thái đơn hàng (nhân viên/quản lý) PATCH /orders/:id/status
 */
export async function updateOrderStatusApi(
  orderId: string,
  statusOrDto: StaffUpdatableOrderStatus | UpdateOrderStatusDto
): Promise<OrderResponse> {
  const status = typeof statusOrDto === 'string' ? statusOrDto : statusOrDto.status;

  if (isMockOrdersActive()) {
    return mockUpdateOrderStatus(orderId, status);
  }

  return apiRequest<OrderResponse>(ORDER_ENDPOINTS.UPDATE_STATUS(orderId), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * Hủy đơn hàng POST /orders/:id/cancel (không có body, không kiểm tra quyền ở tầng hàm gọi API)
 */
export async function cancelOrderApi(orderId: string): Promise<OrderResponse> {
  if (isMockOrdersActive()) {
    return mockCancelOrder(orderId);
  }

  return apiRequest<OrderResponse>(ORDER_ENDPOINTS.CANCEL(orderId), {
    method: 'POST',
  });
}
