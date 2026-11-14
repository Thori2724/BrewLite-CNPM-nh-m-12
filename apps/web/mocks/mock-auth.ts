import {
  ApiHttpError,
  AUTH_ERROR_MESSAGES,
  LoginDto,
  LoginResponse,
  RegisterDto,
  RegisterResponse,
  Role,
  StaffUser,
} from '../services/auth-contract';
import { AuthApiError } from '../services/auth';
import { isMockAuthActive, isMockStaffActive } from './mock-config';

export { isMockAuthActive, isMockStaffActive };

export interface MockUserRecord {
  id: string;
  email: string;
  displayName: string;
  password: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/**
 * Dữ liệu tài khoản demo cố định theo mục 8.3 docs/api-contract.md (bản 2)
 * cộng thêm tài khoản `khachhang@brewlite.vn` cũ để giữ tương thích các test hiện có.
 * - Có đủ 3 STAFF (trong đó Nhân viên 3 có isActive = false) và 1 ADMIN.
 */
export const MOCK_SEED_USERS: MockUserRecord[] = [
  {
    id: 'mock-user-1',
    email: 'khachhang@brewlite.vn',
    displayName: 'Khách hàng BrewLite',
    password: 'password123',
    role: 'CUSTOMER',
    isActive: true,
    createdAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: '44444444-0000-0000-0000-000000000001',
    email: 'khach@example.com',
    displayName: 'Khách demo',
    password: 'password123',
    role: 'CUSTOMER',
    isActive: true,
    createdAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: '55555555-0000-0000-0000-000000000001',
    email: 'nhanvien1@example.com',
    displayName: 'Nhân viên 1',
    password: 'password123',
    role: 'STAFF',
    isActive: true,
    createdAt: '2026-11-01T08:05:00.000Z',
  },
  {
    id: '55555555-0000-0000-0000-000000000002',
    email: 'nhanvien2@example.com',
    displayName: 'Nhân viên 2',
    password: 'password123',
    role: 'STAFF',
    isActive: true,
    createdAt: '2026-11-01T08:10:00.000Z',
  },
  {
    id: '55555555-0000-0000-0000-000000000003',
    email: 'nhanvien3@example.com',
    displayName: 'Nhân viên 3',
    password: 'password123',
    role: 'STAFF',
    isActive: false,
    createdAt: '2026-11-01T08:15:00.000Z',
  },
  {
    id: '66666666-0000-0000-0000-000000000001',
    email: 'quanly@example.com',
    displayName: 'Quản lý',
    password: 'password123',
    role: 'ADMIN',
    isActive: true,
    createdAt: '2026-11-01T07:55:00.000Z',
  },
];

export const mockDatabaseUsers: MockUserRecord[] = MOCK_SEED_USERS.map((user) => ({ ...user }));

export function resetMockAuthDatabase(): void {
  mockDatabaseUsers.splice(
    0,
    mockDatabaseUsers.length,
    ...MOCK_SEED_USERS.map((user) => ({ ...user }))
  );
}

function toStaffUser(record: MockUserRecord): StaffUser {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    isActive: record.isActive,
    createdAt: record.createdAt,
  };
}

export async function mockLogin(dto: LoginDto): Promise<LoginResponse> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const normalizedEmail = (dto.email || '').trim().toLowerCase();
  const user = mockDatabaseUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!user || user.password !== dto.password) {
    throw new AuthApiError(401, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    throw new AuthApiError(403, AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED, {
      statusCode: 403,
      message: AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED,
      error: 'Forbidden',
    });
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
  await new Promise((resolve) => setTimeout(resolve, 100));

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
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  mockDatabaseUsers.push(newUser);

  return {
    id: newUser.id,
    email: newUser.email,
    displayName: newUser.displayName,
    role: newUser.role,
  };
}

/**
 * Giả lập GET /staff (trả danh sách 3 STAFF sắp xếp theo displayName)
 */
export async function mockGetStaffList(): Promise<StaffUser[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  return mockDatabaseUsers
    .filter((u) => u.role === 'STAFF')
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))
    .map(toStaffUser);
}

/**
 * Giả lập PATCH /staff/:id/status (chỉ khóa/mở khóa tài khoản STAFF)
 */
export async function mockUpdateStaffStatus(
  staffId: string,
  isActive: boolean
): Promise<StaffUser> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (typeof isActive !== 'boolean') {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['isActive must be a boolean value'],
      error: 'Bad Request',
    });
  }

  const user = mockDatabaseUsers.find((u) => u.id === staffId && u.role === 'STAFF');
  if (!user) {
    throw new ApiHttpError({
      statusCode: 404,
      message: AUTH_ERROR_MESSAGES.STAFF_NOT_FOUND,
      error: 'Not Found',
    });
  }

  user.isActive = isActive;
  return toStaffUser(user);
}
