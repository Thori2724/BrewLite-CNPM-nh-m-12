/**
 * HỢP ĐỒNG API: XÁC THỰC (AUTHENTICATION) - PHIÊN BẢN CHÍNH THỨC SPRINT 2
 * Theo đúng chuẩn docs/api-contract.md (POST /auth/register và POST /auth/login)
 */

// 1. Danh sách endpoint API chuẩn (không có /auth/me)
export const AUTH_ENDPOINTS = {
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
} as const;

export const STAFF_ENDPOINTS = {
  LIST: '/staff',
  UPDATE_STATUS: (id: string) => `/staff/${encodeURIComponent(id)}/status`,
} as const;

// 2. Vai trò người dùng (Role) theo hợp đồng
export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type Role = UserRole;

// Nhãn tiếng Việt cho vai trò và trạng thái nhân viên (mục 9.3 hợp đồng)
export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: 'Khách hàng',
  STAFF: 'Nhân viên',
  ADMIN: 'Quản lý',
};

export const STAFF_STATUS_LABELS = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
} as const;

export function getStaffStatusLabel(isActive: boolean): string {
  return isActive ? STAFF_STATUS_LABELS.ACTIVE : STAFF_STATUS_LABELS.LOCKED;
}

// 3. Thông tin người dùng cơ bản (không dùng fullName, không có loyaltyPoints)
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface StaffUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface UpdateStaffStatusDto {
  isActive: boolean;
}

// 4. DTO gửi lên server
export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
}

// 5. Dữ liệu server trả về khi thành công
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// Response 201 Created của POST /auth/register trả thẳng thông tin user vừa tạo (không bọc message/user)
export interface RegisterResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

// 6. Định dạng lỗi chuẩn NestJS HttpException
export interface ApiErrorDetail {
  productId: string;
  name: string;
  available?: number;
}

export interface AuthErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  details?: ApiErrorDetail[];
}

/**
 * Lớp lỗi chuẩn hóa cho các API nền mới (giữ nguyên statusCode, message dạng string | string[], details).
 */
export class ApiHttpError {
  readonly name = 'ApiHttpError';
  readonly statusCode: number;
  readonly message: string | string[];
  readonly error?: string;
  readonly details?: ApiErrorDetail[];
  readonly errorData?: unknown;

  constructor(params: {
    statusCode: number;
    message: string | string[];
    error?: string;
    details?: ApiErrorDetail[];
    errorData?: unknown;
  }) {
    this.statusCode = params.statusCode;
    this.message = params.message;
    this.error = params.error;
    this.details = params.details;
    this.errorData = params.errorData;
  }
}

// 7. Thông báo lỗi chuẩn theo hợp đồng API
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác', // 401
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này', // 403 sai vai trò
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa', // 403 tài khoản bị khóa
  STAFF_NOT_FOUND: 'Không tìm thấy nhân viên', // 404
  EMAIL_ALREADY_EXISTS: 'Email này đã được sử dụng', // 409
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.', // 400 mảng
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  REGISTRATION_SUCCESS: 'Đăng ký thành công',
} as const;
