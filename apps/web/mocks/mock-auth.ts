import {
  AUTH_ERROR_MESSAGES,
  LoginDto,
  LoginResponse,
  RegisterDto,
  RegisterResponse,
  UserRole,
} from '../services/auth-contract';
import { AuthApiError } from '../services/auth';

/**
 * Kiểm tra xem có đang bật chế độ Mock Auth hay không.
 * Mặc định: true trong môi trường phát triển cục bộ nếu biến NEXT_PUBLIC_USE_MOCK_AUTH=true.
 */
export function isMockAuthActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true';
}

export interface MockUserRecord {
  id: string;
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

/**
 * Dữ liệu người dùng mẫu trong Mock Database.
 * LƯU Ý QUAN TRỌNG:
 * - Tài khoản đăng ký mới trong mock chỉ sống trong bộ nhớ RAM của phiên duyệt web (sẽ mất khi F5 hoặc mở tab mới).
 * - Tài khoản mẫu kiểm thử cố định:
 *   + Email: khachhang@brewlite.vn
 *   + Mật khẩu: password123
 */
export const mockDatabaseUsers: MockUserRecord[] = [
  {
    id: 'mock-user-1',
    email: 'khachhang@brewlite.vn',
    displayName: 'Khách hàng BrewLite',
    password: 'password123',
    role: 'CUSTOMER',
  },
];

export async function mockLogin(dto: LoginDto): Promise<LoginResponse> {
  // Giả lập độ trễ mạng nhẹ 250ms
  await new Promise((resolve) => setTimeout(resolve, 250));

  const normalizedEmail = (dto.email || '').trim().toLowerCase();
  const user = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!user || user.password !== dto.password) {
    throw new AuthApiError(401, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  return {
    accessToken: `mock_jwt_token_${user.id}_${Date.now()}`,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  };
}

export async function mockRegister(dto: RegisterDto): Promise<RegisterResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const normalizedEmail = (dto.email || '').trim().toLowerCase();
  const existing = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (existing) {
    throw new AuthApiError(409, AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
  }

  const newUser: MockUserRecord = {
    id: `mock-user-${Date.now()}`,
    email: normalizedEmail,
    displayName: dto.displayName.trim(),
    password: dto.password,
    role: 'CUSTOMER',
  };

  mockDatabaseUsers.push(newUser);

  // Response 201 trả thẳng thông tin user vừa tạo theo hợp đồng API
  return {
    id: newUser.id,
    email: newUser.email,
    displayName: newUser.displayName,
    role: newUser.role,
  };
}
