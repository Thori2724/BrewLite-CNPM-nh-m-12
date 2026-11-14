/**
 * HỢP ĐỒNG API: ĐẶT ĐƠN HÀNG VÀ THANH TOÁN (ORDERS & PAYMENTS)
 * Phiên bản chính thức chuẩn hóa theo docs/api-contract.md (Sprint 2)
 */

import { IceLevel, SizeId, SugarLevel } from './api';

// 1. Enum Hình thức nhận hàng (ReceiveType)
export type ReceiveType = 'AT_COUNTER' | 'TAKE_AWAY';

export const RECEIVE_TYPE_LABELS: Record<ReceiveType, string> = {
  AT_COUNTER: 'Tại quầy',
  TAKE_AWAY: 'Mang đi',
};

// 2. Enum Phương thức thanh toán (PaymentMethod)
export type PaymentMethod = 'WALLET' | 'CARD';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  WALLET: 'Ví điện tử (ZaloPay/Momo)',
  CARD: 'Thẻ ngân hàng',
};

// 3. Enum Trạng thái đơn hàng (OrderStatus)
export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PREPARING: 'Đang pha chế',
  READY: 'Sẵn sàng nhận',
  COMPLETED: 'Hoàn thành',
  PAYMENT_FAILED: 'Thanh toán lỗi',
  CANCELLED: 'Đã hủy',
};

export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  PAID: 'bg-moss text-kombu font-bold',
  COMPLETED: 'bg-moss text-kombu font-bold',
  PENDING: 'bg-warning text-noir font-bold',
  PREPARING: 'bg-warning text-noir font-bold',
  READY: 'bg-tan/50 text-noir border border-tan font-bold',
  PAYMENT_FAILED: 'bg-error/15 text-error border border-error/30 font-bold',
  CANCELLED: 'bg-neutral-200 text-neutral-800 border border-neutral-300 font-bold',
};

export function getOrderStatusBadgeClass(status: OrderStatus): string {
  return ORDER_STATUS_BADGE_CLASSES[status] || 'bg-tan/40 text-noir font-semibold';
}

// 4. Enum Trạng thái thanh toán (PaymentStatus)
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

// Ghi chú: Hợp đồng API (mục 7) chưa có bảng nhãn cho PaymentStatus, đây là nhãn tiếng Việt do FE tự đặt để hiển thị trên UI
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  SUCCESS: 'Thành công',
  FAILED: 'Thất bại',
  PENDING: 'Đang xử lý',
};

// Các bước luồng tiến trình chính của đơn hàng (Stepper)
export const ORDER_MAIN_FLOW_STEPS: OrderStatus[] = [
  'PENDING',
  'PAID',
  'PREPARING',
  'READY',
  'COMPLETED',
];

// Cấu hình Banner đầu trang chi tiết đơn theo từng trạng thái OrderStatus
export interface OrderStatusBannerConfig {
  title: string;
  description: string;
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export const ORDER_STATUS_BANNERS: Record<OrderStatus, OrderStatusBannerConfig> = {
  PAID: {
    title: 'Đặt hàng thành công',
    description: `Trạng thái: ${ORDER_STATUS_LABELS.PAID}. Đơn hàng của bạn đã được ghi nhận và đang chờ quầy chuẩn bị.`,
    variant: 'success',
  },
  PENDING: {
    title: 'Đơn đang chờ thanh toán',
    description: `Trạng thái: ${ORDER_STATUS_LABELS.PENDING}. Vui lòng hoàn tất thanh toán để quán bắt đầu pha chế.`,
    variant: 'warning',
  },
  PAYMENT_FAILED: {
    title: 'Thanh toán không thành công',
    description: `Trạng thái: ${ORDER_STATUS_LABELS.PAYMENT_FAILED}. Vui lòng kiểm tra lại và bấm Thử lại thanh toán.`,
    variant: 'error',
  },
  PREPARING: {
    title: ORDER_STATUS_LABELS.PREPARING,
    description: 'Quầy đang pha chế đồ uống và chuẩn bị món cho bạn.',
    variant: 'info',
  },
  READY: {
    title: ORDER_STATUS_LABELS.READY,
    description: 'Món của bạn đã sẵn sàng! Vui lòng đến quầy để nhận đồ uống.',
    variant: 'success',
  },
  COMPLETED: {
    title: ORDER_STATUS_LABELS.COMPLETED,
    description: 'Đơn hàng đã hoàn thành. Cảm ơn bạn đã ủng hộ BrewLite!',
    variant: 'success',
  },
  CANCELLED: {
    title: ORDER_STATUS_LABELS.CANCELLED,
    description: 'Đơn hàng này đã bị hủy.',
    variant: 'neutral',
  },
};

/**
 * Chuyển đổi thời gian ISO 8601 UTC sang giờ Việt Nam (UTC+7), định dạng dd/MM/yyyy HH:mm
 */
export function formatVietnamDateTime(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  // Đổi sang giờ Việt Nam (UTC+7) ổn định trên mọi môi trường (trình duyệt & Node/Vitest)
  const vnTimeMs = date.getTime() + 7 * 60 * 60 * 1000;
  const vnDate = new Date(vnTimeMs);

  const day = String(vnDate.getUTCDate()).padStart(2, '0');
  const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const year = vnDate.getUTCFullYear();
  const hours = String(vnDate.getUTCHours()).padStart(2, '0');
  const minutes = String(vnDate.getUTCMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Tóm tắt danh sách món của đơn hàng trên trang lịch sử
 * Ví dụ: "Trà sữa truyền thống x2, Bánh Croissant x1" hoặc "... và 2 món khác" nếu quá 2 món
 */
export function summarizeOrderItems(items?: OrderItemResponse[]): string {
  if (!items || items.length === 0) return 'Không có món';
  const maxShown = 2;
  const shown = items
    .slice(0, maxShown)
    .map((item) => `${item.productName} x${item.quantity}`)
    .join(', ');
  const remaining = items.length - maxShown;
  if (remaining > 0) {
    return `${shown} ... và ${remaining} món khác`;
  }
  return shown;
}

// 5. DTO từng món khi gửi lên POST /orders
// TUYỆT ĐỐI KHÔNG GỬI GIÁ TIỀN (unitPrice, lineTotal, totalAmount) TỪ CLIENT
export interface CreateOrderItemDto {
  productId: string;
  quantity: number; // 1..10
  size?: SizeId; // Món nước: S, M, L. Món bánh: không gửi
  sugarLevel?: SugarLevel; // Món nước: P0..P100. Món bánh: không gửi
  iceLevel?: IceLevel; // Món nước: NONE..FULL. Món bánh: không gửi
  toppingIds?: string[]; // Món nước: tối đa 3 UUID. Món bánh: không gửi
  note?: string; // Tối đa 200 ký tự
}

// 6. DTO tạo đơn hàng POST /orders
// KHÔNG có customerName và customerPhone
export interface CreateOrderDto {
  receiveType?: ReceiveType; // Mặc định: AT_COUNTER
  note?: string; // Tối đa 200 ký tự
  items: CreateOrderItemDto[]; // 1..20 dòng món
}

// 7. Dữ liệu chi tiết topping trong đơn hàng
export interface OrderItemToppingResponse {
  id: string;
  name: string;
  price: number;
}
export type OrderItemTopping = OrderItemToppingResponse;

// 8. Dữ liệu chi tiết từng món trong đơn hàng trả về từ server
export interface OrderItemResponse {
  id?: string;
  productId: string;
  productName: string;
  size?: SizeId | null;
  sugarLevel?: SugarLevel | null;
  iceLevel?: IceLevel | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note?: string | null;
  toppings?: OrderItemToppingResponse[];
}
export type OrderItem = OrderItemResponse;

// 9. Lịch sử thanh toán kèm theo đơn
export interface PaymentDetailResponse {
  id: string;
  orderId?: string;
  method: PaymentMethod;
  accountLast4: string;
  amount?: number;
  status: PaymentStatus;
  failureReason?: string | null;
  createdAt: string;
}
export type Payment = PaymentDetailResponse;

export interface OrderCustomer {
  id: string;
  displayName: string;
  email: string;
}

// 10. Dữ liệu đơn hàng chi tiết trả về từ POST /orders, GET /orders/:id, GET /orders/me, GET /orders, PATCH /orders/:id/status, POST /orders/:id/cancel
export interface OrderResponse {
  id: string;
  orderNumber: number; // SỐ NGUYÊN (ví dụ: 1001) -> UI hiển thị `#${orderNumber}`
  status: OrderStatus;
  receiveType: ReceiveType;
  note?: string | null;
  totalAmount: number;
  createdAt: string;
  items: OrderItemResponse[];
  payments?: PaymentDetailResponse[];
  customer?: OrderCustomer;
}
export type Order = OrderResponse;

export type StaffUpdatableOrderStatus = 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export interface GetOrdersParams {
  status?: OrderStatus;
}

export interface UpdateOrderStatusDto {
  status: StaffUpdatableOrderStatus;
}

// 11. DTO thanh toán gửi lên POST /payments
export interface PaymentDto {
  orderId: string;
  method: PaymentMethod;
  accountNumber: string; // Chỉ gồm chữ số, 8..19 ký tự
}

// 12. Dữ liệu kết quả thanh toán trả về từ POST /payments (mã 201 hoặc 200)
export interface PaymentResponse {
  id: string;
  orderId: string;
  method: PaymentMethod;
  accountLast4: string;
  amount: number;
  status: PaymentStatus; // 'SUCCESS' hoặc 'FAILED'
  failureReason?: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: number;
    status: OrderStatus;
  };
}

// 13. Chi tiết món tạm hết khi lỗi 409 (bản 2 chỉ có productId, name; giữ available? tùy chọn để tương thích trang cũ)
export interface OutOfStockDetail {
  productId: string;
  name: string;
  available?: number;
}

// 14. Định dạng lỗi server trả về
export interface OrderErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  details?: OutOfStockDetail[];
}

// 15. Danh sách endpoint API chuẩn theo hợp đồng
export const ORDER_ENDPOINTS = {
  CREATE: '/orders',
  LIST: '/orders',
  PAY: '/payments', // POST /payments trực tiếp
  GET_BY_ID: (orderId: string) => `/orders/${encodeURIComponent(orderId)}`,
  MY_ORDERS: '/orders/me',
  UPDATE_STATUS: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/status`,
  CANCEL: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/cancel`,
} as const;

// 16. Danh sách thông báo lỗi tiếng Việt chuẩn hóa
export const ORDER_ERROR_MESSAGES = {
  CART_EMPTY: 'Giỏ hàng của bạn đang trống. Vui lòng chọn món trước khi đặt đơn.',
  ACCOUNT_NUMBER_REQUIRED: 'Vui lòng nhập số thẻ hoặc số ví.',
  ACCOUNT_NUMBER_INVALID: 'Số tài khoản không hợp lệ (chỉ gồm 8 đến 19 chữ số).',
  OUT_OF_STOCK: 'Một số món trong giỏ hàng không đủ số lượng trong kho.',
  PAYMENT_REJECTED: 'Giao dịch bị từ chối (mô phỏng).',
  ORDER_NOT_PAYABLE: 'Đơn hàng không ở trạng thái cho phép thanh toán.',
  IDEMPOTENCY_MISMATCH: 'Yêu cầu thanh toán không khớp với dữ liệu giao dịch trước đó. Vui lòng thử lại.',
  NETWORK_TIMEOUT: 'Yêu cầu bị quá thời gian chờ (timeout). Vui lòng thử lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra trong quá trình xử lý đơn hàng. Vui lòng thử lại.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng',
  ORDER_CANCEL_INVALID: 'Không thể hủy đơn ở trạng thái hiện tại',
  ORDER_STATUS_CONFLICT: 'Trạng thái đơn đã thay đổi, vui lòng tải lại',
  INVALID_ORDER_STATUS: 'Trạng thái không hợp lệ',
} as const;
