/**
 * HỢP ĐỒNG TẠM: XÁC THỰC (AUTHENTICATION)
 *
 * LƯU Ý QUAN TRỌNG:
 * Đây là hợp đồng API tạm thời do frontend đề xuất trong khi chờ backend chốt chi tiết.
 * Toàn bộ tên endpoint, tên field và thông báo lỗi được gom vào file này.
 * Khi backend có thay đổi hoặc thống nhất hợp đồng chính thức, chỉ cần chỉnh sửa tại đây.
 */

// 1. Danh sách endpoint API
export const AUTH_ENDPOINTS = {
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
  ME: '/auth/me',
} as const;

// 2. Vai trò người dùng (Role) theo SRS FR-04
export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';

// 3. Thông tin người dùng cơ bản
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  loyaltyPoints?: number;
}

// 4. DTO gửi lên server
export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  fullName: string;
  email: string;
  password: string;
}

// 5. Dữ liệu server trả về khi thành công
export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export interface RegisterResponse {
  message: string;
  user: AuthUser;
}

// 6. Định dạng lỗi chuẩn NestJS HttpException
export interface AuthErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// 7. Tên các trường (Field names) để dễ thay đổi nếu backend dùng tên khác
export const AUTH_FIELDS = {
  TOKEN: 'access_token',
  USER: 'user',
  ID: 'id',
  EMAIL: 'email',
  FULL_NAME: 'fullName',
  ROLE: 'role',
  PASSWORD: 'password',
} as const;

// 8. Thông báo lỗi mặc định bằng tiếng Việt
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác',
  EMAIL_ALREADY_EXISTS: 'Email này đã được sử dụng',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  REGISTRATION_SUCCESS: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.',
} as const;

