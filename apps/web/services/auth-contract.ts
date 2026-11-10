/**
 * HỢP ĐỒNG API: XÁC THỰC (AUTHENTICATION) - PHIÊN BẢN CHÍNH THỨC SPRINT 2
 * Theo đúng chuẩn docs/api-contract.md (POST /auth/register và POST /auth/login)
 */

// 1. Danh sách endpoint API chuẩn (không có /auth/me)
export const AUTH_ENDPOINTS = {
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
} as const;

// 2. Vai trò người dùng (Role) theo hợp đồng
export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';

// 3. Thông tin người dùng cơ bản (không dùng fullName, không có loyaltyPoints)
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
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
export interface AuthErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// 7. Thông báo lỗi chuẩn theo hợp đồng API
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác', // 401
  EMAIL_ALREADY_EXISTS: 'Email này đã được sử dụng', // 409
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.', // 400 mảng
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  REGISTRATION_SUCCESS: 'Đăng ký thành công',
} as const;
