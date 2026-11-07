/**
 * HỢP ĐỒNG TẠM: ĐẶT ĐƠN HÀNG VÀ THANH TOÁN (ORDERS & PAYMENTS)
 *
 * LƯU Ý QUAN TRỌNG:
 * Đây là hợp đồng API tạm thời do phía Frontend đề xuất trong khi chờ Backend hoàn thiện.
 * Toàn bộ tên endpoint, kiểu dữ liệu, enum trạng thái và thông báo lỗi được gom vào file này.
 * Khi Backend chốt hợp đồng chính thức, chỉ cần chỉnh sửa tại file này.
 */

import { IceLevel, SizeId, SugarLevel } from './api';

// 1. Enum Hình thức nhận hàng (theo class diagram ReceiveType)
export type ReceiveType = 'AT_COUNTER' | 'TAKE_AWAY';

export const RECEIVE_TYPE_LABELS: Record<ReceiveType, string> = {
  AT_COUNTER: 'Tại quầy',
  TAKE_AWAY: 'Mang đi',
};

// 2. Enum Phương thức thanh toán (theo class diagram PaymentMethod)
export type PaymentMethod = 'E_WALLET' | 'BANK_CARD';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  E_WALLET: 'Ví điện tử',
  BANK_CARD: 'Thẻ ngân hàng',
};

// 3. Enum Trạng thái đơn hàng (theo class diagram OrderStatus)
export type OrderStatus =
  | 'PENDING'
  | 'PAYMENT_FAILED'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

// 4. Enum Trạng thái thanh toán (theo class diagram PaymentStatus)
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

// 5. DTO từng món trong đơn khi gửi lên server (TUYỆT ĐỐI KHÔNG GỬI GIÁ TIỀN TỪ CLIENT)
export interface CreateOrderItemDto {
  productId: string;
  size?: SizeId;
  sugarLevel?: SugarLevel;
  iceLevel?: IceLevel;
  toppingIds?: string[];
  note?: string;
  quantity: number;
}

// 6. DTO tạo đơn hàng
export interface CreateOrderDto {
  receiveType: ReceiveType;
  items: CreateOrderItemDto[];
  note?: string;

  // =========================================================================
  // [CHỜ XÁC NHẬN TỪ BACKEND]:
  // Hai trường dưới đây dùng cho form giao diện nhận nước tại quầy/mang đi.
  // Nếu Backend không lưu vào Order, có thể dễ dàng bỏ qua hoặc chuyển vào note.
  // =========================================================================
  customerName?: string;
  customerPhone?: string;
}

// 7. Dữ liệu đơn hàng chi tiết trả về từ server
export interface OrderItemResponse {
  id?: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  size?: SizeId;
  sugarLevel?: SugarLevel;
  iceLevel?: IceLevel;
  toppings?: Array<{ id: string; name: string; price: number }>;
  note?: string;
  lineTotal: number;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  receiveType: ReceiveType;
  totalAmount: number;
  subtotal?: number;
  discountAmount?: number;
  note?: string;
  customerName?: string;
  customerPhone?: string;
  expiresAt: string; // ISO 8601 string
  createdAt: string;
  items: OrderItemResponse[];
}

// 8. DTO yêu cầu thanh toán
export interface PaymentDto {
  method: PaymentMethod;
  accountNumber: string;
  cardHolderName?: string;
}

// 9. Dữ liệu kết quả thanh toán trả về
export interface PaymentResponse {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  orderStatus: OrderStatus;
  idempotencyKey: string;
  gatewayRef?: string;
  createdAt: string;
  message?: string;
}

// 10. Định dạng lỗi server trả về
export interface OrderErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  outOfStockItems?: string[];
}

// 11. Danh sách endpoint API
export const ORDER_ENDPOINTS = {
  CREATE: '/orders',
  PAY: (orderId: string) => `/orders/${orderId}/payments`,
  // [CHỜ XÁC NHẬN TỪ BACKEND]: Endpoint tra cứu trạng thái đơn chờ khi mở lại trang
  GET_BY_ID: (orderId: string) => `/orders/${orderId}`,
} as const;

// 12. Danh sách thông báo lỗi tiếng Việt chuẩn hóa
export const ORDER_ERROR_MESSAGES = {
  CART_EMPTY: 'Giỏ hàng của bạn đang trống. Vui lòng chọn món trước khi đặt đơn.',
  PHONE_REQUIRED: 'Vui lòng nhập số điện thoại nhận hàng.',
  PHONE_INVALID: 'Số điện thoại không hợp lệ (cần 10 chữ số, ví dụ 0901234567).',
  ACCOUNT_NUMBER_REQUIRED: 'Vui lòng nhập số thẻ hoặc số ví.',
  ACCOUNT_NUMBER_INVALID_WALLET: 'Số ví điện tử không hợp lệ (cần 10 chữ số).',
  ACCOUNT_NUMBER_INVALID_CARD: 'Số thẻ ngân hàng không hợp lệ (cần 16 chữ số).',
  OUT_OF_STOCK: 'Một số món trong giỏ hàng đã hết hàng.',
  PAYMENT_REJECTED: 'Thanh toán không thành công. Thẻ hoặc ví bị từ chối (tài khoản không đủ số dư hoặc thông tin không hợp lệ).',
  ORDER_EXPIRED: 'Đơn hàng đã hết hạn thanh toán (quá thời hạn 15 phút).',
  IDEMPOTENCY_MISMATCH: 'Yêu cầu thanh toán không khớp với dữ liệu giao dịch trước đó. Vui lòng thử lại.',
  NETWORK_TIMEOUT: 'Yêu cầu bị quá thời gian chờ (timeout). Vui lòng thử lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra trong quá trình xử lý đơn hàng. Vui lòng thử lại.',
} as const;

