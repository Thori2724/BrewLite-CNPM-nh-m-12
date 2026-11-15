import { ApiHttpError, AUTH_ERROR_MESSAGES, StaffUser } from '../../../services/auth-contract';

/**
 * Công tắc dữ liệu giả riêng cho trang /staff/employees.
 * Mặc định `enabled: false` để không ghi đè khi nối API thật.
 * Có thể bật qua `NEXT_PUBLIC_USE_MOCK_STAFF_EMPLOYEES=true` hoặc `NEXT_PUBLIC_USE_MOCK=true`.
 */
export const STAFF_EMPLOYEES_MOCK_CONFIG = {
  enabled: false,
};

export function isStaffEmployeesMockEnabled(): boolean {
  const localFlag = process.env.NEXT_PUBLIC_USE_MOCK_STAFF_EMPLOYEES;
  if (localFlag !== undefined && localFlag.trim() !== '') {
    return localFlag.trim() === 'true';
  }
  const unifiedFlag = process.env.NEXT_PUBLIC_USE_MOCK;
  if (unifiedFlag !== undefined && unifiedFlag.trim() !== '') {
    return unifiedFlag.trim() === 'true';
  }
  return STAFF_EMPLOYEES_MOCK_CONFIG.enabled;
}

/**
 * Dữ liệu giả danh sách nhân viên (STAFF) theo đúng hình dạng hợp đồng
 * GET /staff và mục 8.3 docs/api-contract.md (chỉ gồm tài khoản role = "STAFF").
 */
export const MOCK_STAFF_EMPLOYEES_SEED: StaffUser[] = [
  {
    id: '55555555-0000-0000-0000-000000000001',
    email: 'nhanvien1@example.com',
    displayName: 'Nhân viên 1',
    role: 'STAFF',
    isActive: true,
    createdAt: '2026-11-01T08:05:00.000Z',
  },
  {
    id: '55555555-0000-0000-0000-000000000002',
    email: 'nhanvien2@example.com',
    displayName: 'Nhân viên 2',
    role: 'STAFF',
    isActive: true,
    createdAt: '2026-11-01T08:10:00.000Z',
  },
  {
    id: '55555555-0000-0000-0000-000000000003',
    email: 'nhanvien3@example.com',
    displayName: 'Nhân viên 3',
    role: 'STAFF',
    isActive: false,
    createdAt: '2026-11-01T08:15:00.000Z',
  },
];

let mockStaffEmployeesStore: StaffUser[] = cloneEmployees(MOCK_STAFF_EMPLOYEES_SEED);

function cloneEmployees(employees: StaffUser[]): StaffUser[] {
  return employees.map((item) => ({ ...item }));
}

function sortEmployeesByDisplayName(employees: StaffUser[]): StaffUser[] {
  return [...employees].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
}

export function resetMockStaffEmployees(): void {
  mockStaffEmployeesStore = cloneEmployees(MOCK_STAFF_EMPLOYEES_SEED);
}

export async function getMockStaffEmployees(): Promise<StaffUser[]> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  return sortEmployeesByDisplayName(
    cloneEmployees(mockStaffEmployeesStore.filter((item) => item.role === 'STAFF'))
  );
}

export async function updateMockStaffEmployeeStatus(
  staffId: string,
  isActive: boolean
): Promise<StaffUser> {
  await new Promise((resolve) => setTimeout(resolve, 30));

  if (typeof isActive !== 'boolean') {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['isActive must be a boolean value'],
      error: 'Bad Request',
    });
  }

  const target = mockStaffEmployeesStore.find(
    (item) => item.id === staffId && item.role === 'STAFF'
  );
  if (!target) {
    throw new ApiHttpError({
      statusCode: 404,
      message: AUTH_ERROR_MESSAGES.STAFF_NOT_FOUND,
      error: 'Not Found',
    });
  }

  target.isActive = isActive;
  return { ...target };
}

