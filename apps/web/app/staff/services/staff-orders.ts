import { AUTH_ERROR_MESSAGES } from '../../../services/auth-contract';
import {
  ORDER_ERROR_MESSAGES,
  ORDER_STATUS_LABELS,
  OrderResponse,
  OrderStatus,
  StaffUpdatableOrderStatus,
} from '../../../services/order-contract';
import { getAllOrdersApi, updateOrderStatusApi } from '../../../services/orders';
import { isAccountLockedError } from '../../../utils/auth';
import {
  getMockStaffOrders,
  isStaffOrdersMockEnabled,
  updateMockStaffOrderStatus,
} from '../mocks/staff-orders-mock';

export type StaffOrderStatusFilter = 'ALL' | OrderStatus;

export interface StaffOrderFilterOption {
  value: StaffOrderStatusFilter;
  label: string;
}

export const STAFF_ORDER_FILTER_OPTIONS: StaffOrderFilterOption[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'PENDING', label: ORDER_STATUS_LABELS.PENDING },
  { value: 'PAID', label: ORDER_STATUS_LABELS.PAID },
  { value: 'PREPARING', label: ORDER_STATUS_LABELS.PREPARING },
  { value: 'READY', label: ORDER_STATUS_LABELS.READY },
  { value: 'COMPLETED', label: ORDER_STATUS_LABELS.COMPLETED },
  { value: 'PAYMENT_FAILED', label: ORDER_STATUS_LABELS.PAYMENT_FAILED },
  { value: 'CANCELLED', label: ORDER_STATUS_LABELS.CANCELLED },
];

export interface StaffOrderButtonState {
  enabled: boolean;
  reason: string;
}

export interface StaffOrderActionStates {
  detail: StaffOrderButtonState;
  advance: StaffOrderButtonState & {
    nextStatus: StaffUpdatableOrderStatus | null;
  };
  cancel: StaffOrderButtonState;
}

const ADVANCE_DISABLED_REASONS: Record<
  Exclude<OrderStatus, 'PAID' | 'PREPARING' | 'READY'>,
  string
> = {
  PENDING: 'Đơn chưa thanh toán, chưa thể chuyển bước',
  PAYMENT_FAILED: 'Đơn thanh toán lỗi, chưa thể chuyển bước',
  COMPLETED: 'Đơn đã hoàn thành, không thể chuyển bước',
  CANCELLED: 'Đơn đã hủy, không thể chuyển bước',
};

const CANCEL_DISABLED_REASONS: Record<
  Exclude<OrderStatus, 'PENDING' | 'PAYMENT_FAILED' | 'PAID'>,
  string
> = {
  PREPARING: 'Đơn đã vào pha chế, không thể hủy',
  READY: 'Đơn đã sẵn sàng nhận, không thể hủy',
  COMPLETED: 'Đơn đã hoàn thành, không thể hủy',
  CANCELLED: 'Đơn đã hủy, không thể hủy lại',
};

/**
 * Thứ tự chuyển bước hợp lệ cho nút "Chuyển sang bước tiếp theo":
 * PAID -> PREPARING -> READY -> COMPLETED.
 * PENDING, PAYMENT_FAILED, COMPLETED, CANCELLED không có bước tiếp theo.
 */
export function getNextStaffOrderStatus(
  status: OrderStatus
): StaffUpdatableOrderStatus | null {
  switch (status) {
    case 'PAID':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      return 'COMPLETED';
    default:
      return null;
  }
}

/**
 * Chỉ các đơn ở trạng thái PENDING, PAYMENT_FAILED hoặc PAID mới được hủy.
 * PREPARING, READY, COMPLETED, CANCELLED không hủy được.
 */
export function canStaffCancelOrder(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'PAYMENT_FAILED' || status === 'PAID';
}

/**
 * Hàm thuần xác định trạng thái bật/tắt và chú thích tiếng Việt của 3 nút
 * ("Chi tiết", "Chuyển sang bước tiếp theo", "Hủy đơn") theo mục 5.7 và 5.8 hợp đồng.
 */
export function getStaffOrderActionStates(
  status: OrderStatus
): StaffOrderActionStates {
  const nextStatus = getNextStaffOrderStatus(status);
  const canCancel = canStaffCancelOrder(status);

  const advance: StaffOrderActionStates['advance'] = nextStatus
    ? {
        enabled: true,
        nextStatus,
        reason: `Chuyển sang: ${ORDER_STATUS_LABELS[nextStatus]}`,
      }
    : {
        enabled: false,
        nextStatus: null,
        reason:
          ADVANCE_DISABLED_REASONS[
            status as Exclude<OrderStatus, 'PAID' | 'PREPARING' | 'READY'>
          ] ?? 'Trạng thái hiện tại không thể chuyển bước',
      };

  const cancel: StaffOrderButtonState = canCancel
    ? {
        enabled: true,
        reason:
          status === 'PAID'
            ? 'Hủy đơn đã thanh toán (hoàn tiền mô phỏng)'
            : 'Hủy đơn hàng',
      }
    : {
        enabled: false,
        reason:
          CANCEL_DISABLED_REASONS[
            status as Exclude<OrderStatus, 'PENDING' | 'PAYMENT_FAILED' | 'PAID'>
          ] ?? 'Trạng thái hiện tại không thể hủy',
      };

  return {
    detail: {
      enabled: true,
      reason: 'Xem chi tiết đơn hàng',
    },
    advance,
    cancel,
  };
}

/**
 * Định dạng số nguyên VND nhất quán theo quy ước dự án (ví dụ 136000 -> "136.000đ").
 */
export function formatStaffVnd(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  return `${safe.toLocaleString('vi-VN')}đ`;
}

export async function fetchStaffOrders(
  statusFilter: StaffOrderStatusFilter = 'ALL'
): Promise<OrderResponse[]> {
  const params = statusFilter === 'ALL' ? undefined : { status: statusFilter };

  if (isStaffOrdersMockEnabled()) {
    return getMockStaffOrders(params);
  }

  return getAllOrdersApi(params);
}

/**
 * Gửi yêu cầu đổi trạng thái đơn hàng (PATCH /orders/:id/status).
 * Chỉ gửi duy nhất trường `status` lên server.
 */
export async function updateStaffOrderStatus(
  orderId: string,
  status: StaffUpdatableOrderStatus
): Promise<OrderResponse> {
  if (isStaffOrdersMockEnabled()) {
    return updateMockStaffOrderStatus(orderId, status);
  }

  return updateOrderStatusApi(orderId, { status });
}

export interface ParsedStaffOrderError {
  statusCode: number;
  message: string;
  isUnauthorized: boolean;
  isAccountLocked: boolean;
  isConflict: boolean;
  isNotFound: boolean;
}

export function parseStaffOrderError(err: unknown): ParsedStaffOrderError {
  let statusCode = 0;
  let message = '';

  if (err && typeof err === 'object') {
    const candidate = err as {
      statusCode?: unknown;
      message?: unknown;
      errorData?: unknown;
    };

    if (typeof candidate.statusCode === 'number') {
      statusCode = candidate.statusCode;
    }

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      message = candidate.message.trim();
    } else if (Array.isArray(candidate.message)) {
      const joined = candidate.message
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(', ');
      if (statusCode === 400) {
        message = AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
      } else {
        message = joined;
      }
    }
  }

  const isAccountLocked = isAccountLockedError(err);
  const isUnauthorized = statusCode === 401;
  const isConflict = statusCode === 409;
  const isNotFound = statusCode === 404;

  if (isAccountLocked) {
    message = AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED;
  } else if (isUnauthorized && !message) {
    message = AUTH_ERROR_MESSAGES.SESSION_EXPIRED;
  } else if (statusCode === 403 && !message) {
    message = AUTH_ERROR_MESSAGES.FORBIDDEN;
  } else if (statusCode === 0 && !message) {
    message = ORDER_ERROR_MESSAGES.NETWORK_ERROR;
  } else if (!message) {
    message = ORDER_ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  return {
    statusCode,
    message,
    isUnauthorized,
    isAccountLocked,
    isConflict,
    isNotFound,
  };
}

