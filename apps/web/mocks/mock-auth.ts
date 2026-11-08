import {
  AUTH_ERROR_MESSAGES,
  AuthUser,
  LoginDto,
  LoginResponse,
  RegisterDto,
  RegisterResponse,
} from '../services/auth-contract';
import { AuthApiError } from '../services/auth';

/**
 * Kiểm tra xem có đang bật chế độ Mock Auth hay không
 */
export function isMockAuthActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true';
}

export interface MockUserRecord {
  id: string;
  email: string;
  fullName: string;
  password: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
}

export const mockDatabaseUsers: MockUserRecord[] = [
  {
    id: 'mock-user-1',
    email: 'khachhang@brewlite.vn',
    fullName: 'Khách hàng BrewLite',
    password: 'password123',
    role: 'CUSTOMER',
  },
];

export async function mockLogin(dto: LoginDto): Promise<LoginResponse> {
  // Giả lập độ trễ mạng 250ms
  await new Promise((resolve) => setTimeout(resolve, 250));

  const normalizedEmail = dto.email.trim().toLowerCase();
  const user = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!user || user.password !== dto.password) {
    throw new AuthApiError(401, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    loyaltyPoints: 50,
  };

  return {
    access_token: `mock_jwt_token_${user.id}_${Date.now()}`,
    user: authUser,
  };
}

export async function mockRegister(dto: RegisterDto): Promise<RegisterResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const normalizedEmail = dto.email.trim().toLowerCase();
  const existing = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (existing) {
    throw new AuthApiError(409, AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
  }

  const newUser: MockUserRecord = {
    id: `mock-user-${Date.now()}`,
    email: dto.email.trim(),
    fullName: dto.fullName.trim(),
    password: dto.password,
    role: 'CUSTOMER',
  };

  mockDatabaseUsers.push(newUser);

  return {
    message: AUTH_ERROR_MESSAGES.REGISTRATION_SUCCESS,
    user: {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role,
      loyaltyPoints: 0,
    },
  };
}

