import { AuthUser } from '../../../services/auth-contract';

export type StaffMockRole = 'STAFF' | 'ADMIN';

/**
 * Công tắc dữ liệu giả riêng cho khung /staff khi web chưa có trạng thái đăng nhập.
 * Đặt enabled = false (hoặc NEXT_PUBLIC_USE_MOCK_STAFF_SHELL=false) để tắt nhanh.
 */
export const STAFF_SHELL_MOCK_CONFIG = {
  enabled: true,
  defaultRole: 'ADMIN' as StaffMockRole,
};

export function isStaffShellMockEnabled(): boolean {
  const envFlag = process.env.NEXT_PUBLIC_USE_MOCK_STAFF_SHELL;
  if (envFlag !== undefined && envFlag.trim() !== '') {
    return envFlag.trim() === 'true';
  }
  return STAFF_SHELL_MOCK_CONFIG.enabled;
}

/**
 * Dữ liệu giả người dùng đúng hình dạng AuthUser theo hợp đồng API (mục 4.2 & 8.3).
 */
export const MOCK_STAFF_SHELL_USERS: Record<StaffMockRole, AuthUser> = {
  STAFF: {
    id: '55555555-0000-0000-0000-000000000001',
    email: 'nhanvien1@example.com',
    displayName: 'Nhân viên 1',
    role: 'STAFF',
  },
  ADMIN: {
    id: '66666666-0000-0000-0000-000000000001',
    email: 'quanly@example.com',
    displayName: 'Quản lý',
    role: 'ADMIN',
  },
};

export function getMockStaffShellUser(role: StaffMockRole): AuthUser {
  return MOCK_STAFF_SHELL_USERS[role];
}

