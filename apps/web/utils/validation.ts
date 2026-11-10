import { AUTH_ERROR_MESSAGES } from '../services/auth-contract';
import {
  ORDER_ERROR_MESSAGES,
  OutOfStockDetail,
  PaymentMethod,
  ReceiveType,
} from '../services/order-contract';
import { CartItem, MAX_CART_ITEMS, MAX_ITEM_QUANTITY } from './cart';
import { calculatePrice } from './price';

export const MAX_NOTE_LENGTH = 200;
export const MAX_TOPPINGS_COUNT = 3;

export interface FieldValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Định dạng tiền tệ số nguyên VND chuẩn hợp đồng: "29.000đ" (dấu chấm ngăn nghìn, viết liền chữ đ)
 */
export function formatVnd(amount: number): string {
  const safeValue = calculatePrice({ basePrice: amount || 0, toppings: [], quantity: 1 });
  return `${safeValue.toLocaleString('vi-VN')}đ`;
}

/**
 * 1. Validate định dạng Email (cắt khoảng trắng đầu cuối trước khi kiểm tra)
 */
export function validateEmail(email: string): FieldValidationResult {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Vui lòng nhập địa chỉ email' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Địa chỉ email không đúng định dạng' };
  }

  return { isValid: true };
}

/**
 * 2. Validate Mật khẩu cho form Đăng nhập: chỉ bắt buộc nhập (không áp tối thiểu 6 ký tự)
 */
export function validateLoginPassword(password: string): FieldValidationResult {
  if (!password) {
    return { isValid: false, error: 'Vui lòng nhập mật khẩu' };
  }
  return { isValid: true };
}

/**
 * 3. Validate Mật khẩu cho form Đăng ký: bắt buộc, tối thiểu 6 ký tự
 */
export function validatePassword(password: string): FieldValidationResult {
  if (!password) {
    return { isValid: false, error: 'Vui lòng nhập mật khẩu' };
  }

  if (password.length < 6) {
    return { isValid: false, error: 'Mật khẩu phải có ít nhất 6 ký tự' };
  }

  return { isValid: true };
}

/**
 * 4. Validate Tên hiển thị (displayName):
 * Hợp lệ khi từ 1 đến 50 ký tự sau khi cắt khoảng trắng; không chấp nhận chuỗi toàn dấu cách.
 */
export function validateDisplayName(displayName: string): FieldValidationResult {
  const trimmed = (displayName || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Vui lòng nhập tên hiển thị' };
  }

  if (trimmed.length > 50) {
    return { isValid: false, error: 'Tên hiển thị không được vượt quá 50 ký tự' };
  }

  return { isValid: true };
}

/**
 * 5. Validate Xác nhận mật khẩu
 */
export function validateConfirmPassword(
  password: string,
  confirmPassword: string
): FieldValidationResult {
  if (!confirmPassword) {
    return { isValid: false, error: 'Vui lòng nhập lại mật khẩu' };
  }

  if (password !== confirmPassword) {
    return { isValid: false, error: 'Mật khẩu nhập lại không khớp' };
  }

  return { isValid: true };
}

/**
 * 6. Validate Ghi chú (ghi chú đơn hoặc ghi chú từng món): tối đa 200 ký tự
 */
export function validateNote(note?: string | null): FieldValidationResult {
  if (!note) return { isValid: true };
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      isValid: false,
      error: `Ghi chú không được vượt quá ${MAX_NOTE_LENGTH} ký tự`,
    };
  }
  return { isValid: true };
}

/**
 * 7. Validate Số lượng món: số nguyên từ 1 đến 10
 */
export function validateQuantity(quantity: number): FieldValidationResult {
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    return {
      isValid: false,
      error: `Số lượng mỗi món phải là số nguyên từ 1 đến ${MAX_ITEM_QUANTITY}`,
    };
  }
  return { isValid: true };
}

/**
 * 8. Validate Danh sách Topping của 1 món: tối đa 3 loại và không trùng nhau
 */
export function validateToppings(toppingIds?: string[]): FieldValidationResult {
  if (!toppingIds || toppingIds.length === 0) return { isValid: true };

  if (toppingIds.length > MAX_TOPPINGS_COUNT) {
    return {
      isValid: false,
      error: `Chỉ được chọn tối đa ${MAX_TOPPINGS_COUNT} loại topping cho mỗi món`,
    };
  }

  const uniqueIds = new Set(toppingIds);
  if (uniqueIds.size !== toppingIds.length) {
    return {
      isValid: false,
      error: 'Danh sách topping không được trùng nhau',
    };
  }

  return { isValid: true };
}

/**
 * 9. Validate Hình thức nhận hàng (receiveType): chỉ AT_COUNTER hoặc TAKE_AWAY
 */
export function validateReceiveType(receiveType?: string): FieldValidationResult {
  if (receiveType !== 'AT_COUNTER' && receiveType !== 'TAKE_AWAY') {
    return {
      isValid: false,
      error: 'Hình thức nhận hàng không hợp lệ',
    };
  }
  return { isValid: true };
}

/**
 * 10. Validate toàn bộ Giỏ hàng trước khi gửi POST /orders
 */
export function validateOrderCart(
  items: CartItem[],
  receiveType: ReceiveType,
  orderNote?: string
): FieldValidationResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.CART_EMPTY };
  }

  if (items.length > MAX_CART_ITEMS) {
    return {
      isValid: false,
      error: `Giỏ hàng chỉ được chứa tối đa ${MAX_CART_ITEMS} dòng món`,
    };
  }

  const receiveCheck = validateReceiveType(receiveType);
  if (!receiveCheck.isValid) return receiveCheck;

  const noteCheck = validateNote(orderNote);
  if (!noteCheck.isValid) return noteCheck;

  for (const item of items) {
    const qtyCheck = validateQuantity(item.quantity);
    if (!qtyCheck.isValid) return qtyCheck;

    const itemNoteCheck = validateNote(item.note);
    if (!itemNoteCheck.isValid) return itemNoteCheck;

    const toppingIds = (item.toppings || []).map((t) => t.id);
    const toppingCheck = validateToppings(toppingIds);
    if (!toppingCheck.isValid) return toppingCheck;
  }

  return { isValid: true };
}

/**
 * 11. Validate Phương thức thanh toán (WALLET hoặc CARD)
 */
export function validatePaymentMethod(method?: string): FieldValidationResult {
  if (method !== 'WALLET' && method !== 'CARD') {
    return {
      isValid: false,
      error: 'Vui lòng chọn phương thức thanh toán hợp lệ',
    };
  }
  return { isValid: true };
}

/**
 * 12. Validate Số tài khoản / Số thẻ thanh toán mô phỏng:
 * - Cho phép người dùng dán số có khoảng trắng (tự loại bỏ dấu cách trước khi kiểm tra).
 * - Bắt buộc CHỈ gồm chữ số (0-9), độ dài từ 8 đến 19 ký tự.
 * - Nếu nhập chữ cái hoặc ký tự đặc biệt (ngoài khoảng trắng) sẽ báo lỗi rõ ràng.
 */
export function validateAccountNumber(
  accountNumber: string,
  method?: PaymentMethod
): FieldValidationResult {
  void method;
  const clean = (accountNumber || '').replace(/\s+/g, '');

  if (!clean) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_REQUIRED };
  }

  if (!/^\d+$/.test(clean)) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID };
  }

  if (clean.length < 8 || clean.length > 19) {
    return { isValid: false, error: ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID };
  }

  return { isValid: true };
}

// ============================================================================
// PHÂN LOẠI VÀ TRÍCH XUẤT LỖI API TẬP TRUNG (A6)
// ============================================================================

export type ApiErrorKind =
  | 'validation'
  | 'business'
  | 'out_of_stock'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'network'
  | 'unknown';

export interface ClassifiedApiError {
  kind: ApiErrorKind;
  statusCode: number;
  message: string;
  fieldErrors: Record<string, string>;
  details?: OutOfStockDetail[];
}

/**
 * Nhận diện tên trường bị lỗi từ mảng chuỗi tiếng Anh của class-validator (NestJS 400)
 * và chuyển thành thông báo tiếng Việt thân thiện gắn vào đúng ô nhập.
 */
export function mapValidationMessagesToFieldErrors(messages: string[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const rawMsg of messages) {
    if (typeof rawMsg !== 'string') continue;
    const lower = rawMsg.toLowerCase();

    if (lower.includes('email')) {
      fieldErrors.email = 'Địa chỉ email không đúng định dạng';
    } else if (lower.includes('password')) {
      fieldErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    } else if (lower.includes('displayname')) {
      fieldErrors.displayName = 'Tên hiển thị phải từ 1 đến 50 ký tự';
    } else if (lower.includes('accountnumber')) {
      fieldErrors.accountNumber = ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID;
    } else if (lower.includes('note')) {
      fieldErrors.note = `Ghi chú không được vượt quá ${MAX_NOTE_LENGTH} ký tự`;
    } else if (lower.includes('quantity')) {
      fieldErrors.quantity = `Số lượng mỗi món phải từ 1 đến ${MAX_ITEM_QUANTITY}`;
    } else if (lower.includes('receivetype')) {
      fieldErrors.receiveType = 'Hình thức nhận hàng không hợp lệ';
    } else if (lower.includes('method')) {
      fieldErrors.method = 'Phương thức thanh toán không hợp lệ';
    }
  }

  return fieldErrors;
}

/**
 * Kiểm tra xem một chuỗi có phải là câu lỗi tiếng Anh mặc định từ server/fetch hay không
 * để tránh hiển thị tiếng Anh thô cho người dùng.
 */
function isRawEnglishMessage(msg: string): boolean {
  const trimmed = msg.trim();
  if (!trimmed) return false;
  const englishPatterns = [
    /^bad request$/i,
    /^unauthorized$/i,
    /^not found$/i,
    /^conflict$/i,
    /^internal server error$/i,
    /^failed to fetch$/i,
    /^networkerror/i,
    /^load failed$/i,
    /\bmust be\b/i,
    /\bshould not be empty\b/i,
    /\bmust not be\b/i,
  ];
  return englishPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Hàm tiện ích duy nhất đọc lỗi từ API và phân loại:
 * - validation (400 có message là mảng chuỗi tiếng Anh -> đổi sang câu tiếng Việt chung + fieldErrors)
 * - out_of_stock (409 có mảng details chứa productId, name, available)
 * - unauthorized (401)
 * - not_found (404)
 * - conflict (409 nghiệp vụ khác)
 * - network (statusCode 0, lỗi kết nối hoặc 5xx)
 * - business (message là chuỗi tiếng Việt từ server)
 */
export function classifyApiError(
  error: unknown,
  fallbackMessage: string = AUTH_ERROR_MESSAGES.UNKNOWN_ERROR
): ClassifiedApiError {
  if (!error) {
    return {
      kind: 'unknown',
      statusCode: 0,
      message: fallbackMessage,
      fieldErrors: {},
    };
  }

  const errObj = typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const statusCode = typeof errObj.statusCode === 'number' ? errObj.statusCode : 0;

  // Lấy body gốc từ errorData (nếu là AuthApiError / OrderApiError) hoặc từ chính object đó
  const rawBody =
    errObj.errorData && typeof errObj.errorData === 'object'
      ? (errObj.errorData as Record<string, unknown>)
      : errObj;

  const rawMessage = rawBody?.message ?? errObj.message;
  const rawDetails = Array.isArray(rawBody?.details)
    ? (rawBody.details as OutOfStockDetail[])
    : Array.isArray(errObj.details)
      ? (errObj.details as OutOfStockDetail[])
      : undefined;

  // 1. Lỗi 401 Unauthorized
  if (statusCode === 401 || rawBody?.statusCode === 401) {
    const serverMsg =
      typeof rawMessage === 'string' && !isRawEnglishMessage(rawMessage)
        ? rawMessage
        : fallbackMessage;
    return {
      kind: 'unauthorized',
      statusCode: 401,
      message: serverMsg,
      fieldErrors: {},
    };
  }

  // 2. Lỗi 409 Hết hàng (có mảng details)
  if ((statusCode === 409 || rawBody?.statusCode === 409) && rawDetails && rawDetails.length > 0) {
    const serverMsg =
      typeof rawMessage === 'string' && rawMessage.trim() && !isRawEnglishMessage(rawMessage)
        ? rawMessage
        : ORDER_ERROR_MESSAGES.OUT_OF_STOCK;
    return {
      kind: 'out_of_stock',
      statusCode: 409,
      message: serverMsg,
      fieldErrors: {},
      details: rawDetails,
    };
  }

  // 3. Lỗi Validate 400 có message là MẢNG chuỗi tiếng Anh
  if (Array.isArray(rawMessage) && rawMessage.length > 0) {
    const stringMessages = rawMessage.filter((m): m is string => typeof m === 'string');
    return {
      kind: 'validation',
      statusCode: statusCode || 400,
      message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors: mapValidationMessagesToFieldErrors(stringMessages),
    };
  }

  // 4. Lỗi 400 có message là chuỗi đơn
  if (statusCode === 400 || rawBody?.statusCode === 400) {
    if (typeof rawMessage === 'string' && rawMessage.trim()) {
      if (isRawEnglishMessage(rawMessage)) {
        return {
          kind: 'validation',
          statusCode: 400,
          message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
          fieldErrors: mapValidationMessagesToFieldErrors([rawMessage]),
        };
      }
      return {
        kind: 'business',
        statusCode: 400,
        message: rawMessage,
        fieldErrors: {},
      };
    }
    return {
      kind: 'validation',
      statusCode: 400,
      message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors: {},
    };
  }

  // 5. Lỗi 404 Not Found
  if (statusCode === 404 || rawBody?.statusCode === 404) {
    const msg =
      typeof rawMessage === 'string' && rawMessage.trim() && !isRawEnglishMessage(rawMessage)
        ? rawMessage
        : fallbackMessage;
    return {
      kind: 'not_found',
      statusCode: 404,
      message: msg,
      fieldErrors: {},
    };
  }

  // 6. Lỗi 409 Conflict (ví dụ trùng email hoặc đơn không ở trạng thái cho phép thanh toán)
  if (statusCode === 409 || rawBody?.statusCode === 409) {
    const msg =
      typeof rawMessage === 'string' && rawMessage.trim() && !isRawEnglishMessage(rawMessage)
        ? rawMessage
        : fallbackMessage;
    const fieldErrors: Record<string, string> = {};
    if (msg.toLowerCase().includes('email')) {
      fieldErrors.email = msg;
    }
    return {
      kind: 'conflict',
      statusCode: 409,
      message: msg,
      fieldErrors,
    };
  }

  // 7. Lỗi mạng (statusCode = 0) hoặc máy chủ (5xx)
  if (statusCode >= 500) {
    return {
      kind: 'network',
      statusCode,
      message: 'Không kết nối được máy chủ, vui lòng thử lại',
      fieldErrors: {},
    };
  }

  if (
    statusCode === 0 &&
    (error instanceof TypeError ||
      (typeof rawMessage === 'string' &&
        (rawMessage.includes('kết nối') ||
          rawMessage.includes('mạng') ||
          rawMessage.includes('timeout') ||
          isRawEnglishMessage(rawMessage))))
  ) {
    const msg =
      typeof rawMessage === 'string' && !isRawEnglishMessage(rawMessage)
        ? rawMessage
        : 'Không kết nối được máy chủ, vui lòng thử lại';
    return {
      kind: 'network',
      statusCode: 0,
      message: msg,
      fieldErrors: {},
    };
  }

  // 8. Các trường hợp còn lại (string trực tiếp hoặc Error thông thường)
  if (typeof error === 'string' && error.trim()) {
    return {
      kind: 'business',
      statusCode,
      message: isRawEnglishMessage(error) ? fallbackMessage : error,
      fieldErrors: {},
    };
  }

  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    return {
      kind: 'business',
      statusCode,
      message: isRawEnglishMessage(rawMessage) ? fallbackMessage : rawMessage,
      fieldErrors: {},
    };
  }

  if (typeof rawBody?.error === 'string' && rawBody.error.trim()) {
    return {
      kind: 'business',
      statusCode,
      message: isRawEnglishMessage(rawBody.error) ? fallbackMessage : rawBody.error,
      fieldErrors: {},
    };
  }

  return {
    kind: 'unknown',
    statusCode,
    message: fallbackMessage,
    fieldErrors: {},
  };
}

