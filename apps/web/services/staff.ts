import { apiRequest } from './auth';
import {
  getStaffStatusLabel,
  Role,
  ROLE_LABELS,
  STAFF_ENDPOINTS,
  STAFF_STATUS_LABELS,
  StaffUser,
  UpdateStaffStatusDto,
} from './auth-contract';
import { isMockStaffActive } from '../mocks/mock-config';
import { mockGetStaffList, mockUpdateStaffStatus } from '../mocks/mock-auth';

export {
  getStaffStatusLabel,
  ROLE_LABELS,
  STAFF_ENDPOINTS,
  STAFF_STATUS_LABELS,
};
export type { Role, StaffUser, UpdateStaffStatusDto };

/**
 * Lấy danh sách nhân viên (STAFF).
 * Endpoint: GET /staff (ADMIN)
 */
export async function getStaffListApi(): Promise<StaffUser[]> {
  if (isMockStaffActive()) {
    return mockGetStaffList();
  }

  return apiRequest<StaffUser[]>(STAFF_ENDPOINTS.LIST, {
    method: 'GET',
  });
}

/**
 * Khóa hoặc mở khóa tài khoản nhân viên.
 * Endpoint: PATCH /staff/:id/status (ADMIN)
 */
export async function updateStaffStatusApi(
  staffId: string,
  isActiveOrDto: boolean | UpdateStaffStatusDto
): Promise<StaffUser> {
  const isActive =
    typeof isActiveOrDto === 'boolean' ? isActiveOrDto : isActiveOrDto.isActive;

  if (isMockStaffActive()) {
    return mockUpdateStaffStatus(staffId, isActive);
  }

  return apiRequest<StaffUser>(STAFF_ENDPOINTS.UPDATE_STATUS(staffId), {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

