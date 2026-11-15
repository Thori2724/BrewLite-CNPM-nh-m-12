import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { resetRedirectFlag } from '../../../services/auth';
import { StaffUser, UserRole } from '../../../services/auth-contract';
import {
  AUTH_ACCOUNT_LOCKED_EVENT,
  AUTH_STORAGE_KEY,
  saveAuthSession,
} from '../../../utils/auth';
import StaffLayout from '../layout';
import StaffEmployeesPage from '../employees/page';
import {
  MOCK_STAFF_EMPLOYEES_SEED,
  resetMockStaffEmployees,
} from '../mocks/staff-employees-mock';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

let mockPathname = '/staff/employees';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => mockPathname),
}));

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

function cloneSeedEmployees(): StaffUser[] {
  return MOCK_STAFF_EMPLOYEES_SEED.map((item) => ({ ...item }));
}

function setAuthSession(role: UserRole = 'ADMIN') {
  saveAuthSession({
    token: `jwt-${role.toLowerCase()}-employees-test`,
    user: {
      id:
        role === 'ADMIN'
          ? '66666666-0000-0000-0000-000000000001'
          : role === 'STAFF'
            ? '55555555-0000-0000-0000-000000000001'
            : '44444444-0000-0000-0000-000000000001',
      email:
        role === 'ADMIN'
          ? 'quanly@example.com'
          : role === 'STAFF'
            ? 'nhanvien1@example.com'
            : 'khach@example.com',
      displayName:
        role === 'ADMIN'
          ? 'Quản lý'
          : role === 'STAFF'
            ? 'Nhân viên 1'
            : 'Khách demo',
      role,
    },
  });
}

function renderStaffEmployeesPage() {
  return render(
    <AuthProvider>
      <StaffEmployeesPage />
    </AuthProvider>
  );
}

describe('Dòng 23 - Trang /staff/employees (Quản lý nhân viên - chỉ ADMIN)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockStaffEmployees();
    mockPathname = '/staff/employees';

    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    delete process.env.NEXT_PUBLIC_USE_MOCK_AUTH;
    delete process.env.NEXT_PUBLIC_USE_MOCK_STAFF_EMPLOYEES;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

    vi.mocked(navigation.usePathname).mockImplementation(() => mockPathname);
    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    setAuthSession('ADMIN');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('1. Hiển thị loading rồi tải bảng nhân viên đủ cột (tên, email, vai trò tiếng Việt, ngày giờ VN, trạng thái, nút Khóa/Mở khóa)', async () => {
    const employees = cloneSeedEmployees();
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = vi.fn().mockReturnValueOnce(pendingFetch);

    renderStaffEmployeesPage();

    expect(await screen.findByTestId('staff-employees-loading')).toBeInTheDocument();

    resolveFetch(mockJsonResponse(200, employees));

    const activeRow = await screen.findByTestId(
      'staff-employee-row-55555555-0000-0000-0000-000000000001'
    );
    expect(within(activeRow).getByText('Nhân viên 1')).toBeInTheDocument();
    expect(within(activeRow).getByText('nhanvien1@example.com')).toBeInTheDocument();
    expect(within(activeRow).getByText('Nhân viên')).toBeInTheDocument();
    expect(within(activeRow).getByText('01/11/2026 15:05')).toBeInTheDocument();
    expect(within(activeRow).getByText('Hoạt động')).toBeInTheDocument();
    expect(within(activeRow).getByRole('button', { name: 'Khóa' })).toBeInTheDocument();
    expect(within(activeRow).queryByRole('button', { name: 'Mở khóa' })).not.toBeInTheDocument();

    const lockedRow = screen.getByTestId(
      'staff-employee-row-55555555-0000-0000-0000-000000000003'
    );
    expect(within(lockedRow).getByText('Nhân viên 3')).toBeInTheDocument();
    expect(within(lockedRow).getByText('nhanvien3@example.com')).toBeInTheDocument();
    expect(within(lockedRow).getByText('01/11/2026 15:15')).toBeInTheDocument();
    expect(within(lockedRow).getByText('Đã khóa')).toBeInTheDocument();
    expect(within(lockedRow).getByRole('button', { name: 'Mở khóa' })).toBeInTheDocument();
    expect(within(lockedRow).queryByRole('button', { name: 'Khóa' })).not.toBeInTheDocument();

    // Không có nút tạo, sửa, xóa nhân viên
    expect(screen.queryByRole('button', { name: /thêm|tạo|sửa|xóa/i })).not.toBeInTheDocument();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(calledUrl)).toBe('http://localhost:3001/staff');
    expect(calledInit?.method).toBe('GET');
  });

  it('2. Bấm Khóa mở ConfirmDialog, khóa nút khi đang gọi, gửi PATCH /staff/:id/status { isActive: false }, cập nhật dòng và hiện thông báo', async () => {
    const user = userEvent.setup();
    const employees = cloneSeedEmployees();
    const target = employees[0];
    const lockedRes: StaffUser = { ...target, isActive: false };

    let resolvePatch!: (value: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, employees))
      .mockReturnValueOnce(pendingPatch);
    globalThis.fetch = fetchMock;

    renderStaffEmployeesPage();

    const targetRow = await screen.findByTestId(`staff-employee-row-${target.id}`);
    const otherRow = screen.getByTestId(
      'staff-employee-row-55555555-0000-0000-0000-000000000003'
    );

    // Bấm Khóa -> mở hộp xác nhận
    await user.click(within(targetRow).getByRole('button', { name: 'Khóa' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(`Khóa tài khoản "${target.displayName}"?`)
    ).toBeInTheDocument();

    // Bấm Đóng -> hủy, không gọi PATCH
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mở lại và Xác nhận khóa
    await user.click(within(targetRow).getByRole('button', { name: 'Khóa' }));
    const dialogAgain = await screen.findByRole('dialog');
    await user.click(within(dialogAgain).getByRole('button', { name: 'Xác nhận khóa' }));

    // Trong lúc đang gọi API: khóa các nút thao tác
    await waitFor(() => {
      expect(within(dialogAgain).getByRole('button', { name: 'Đang khóa...' })).toBeDisabled();
    });
    expect(within(dialogAgain).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    expect(within(otherRow).getByRole('button', { name: 'Mở khóa' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /tải lại/i })).toBeDisabled();

    resolvePatch(mockJsonResponse(200, lockedRes));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(within(targetRow).getByText('Đã khóa')).toBeInTheDocument();
    expect(within(targetRow).getByRole('button', { name: 'Mở khóa' })).toBeInTheDocument();
    expect(screen.getByTestId('staff-employees-action-success')).toHaveTextContent(
      `Đã khóa tài khoản "${target.displayName}".`
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/staff/${target.id}/status`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isActive: false,
    });
  });

  it('3. Bấm Mở khóa khóa nút khi đang gọi, gửi PATCH /staff/:id/status { isActive: true }, cập nhật dòng và hiện thông báo', async () => {
    const user = userEvent.setup();
    const employees = cloneSeedEmployees();
    const lockedTarget = employees[2]; // isActive: false
    const unlockedRes: StaffUser = { ...lockedTarget, isActive: true };

    let resolvePatch!: (value: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, employees))
      .mockReturnValueOnce(pendingPatch);
    globalThis.fetch = fetchMock;

    renderStaffEmployeesPage();

    const targetRow = await screen.findByTestId(`staff-employee-row-${lockedTarget.id}`);
    const otherRow = screen.getByTestId(
      'staff-employee-row-55555555-0000-0000-0000-000000000001'
    );

    await user.click(within(targetRow).getByRole('button', { name: 'Mở khóa' }));

    await waitFor(() => {
      expect(within(targetRow).getByRole('button', { name: 'Đang mở khóa...' })).toBeDisabled();
    });
    expect(within(otherRow).getByRole('button', { name: 'Khóa' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /tải lại/i })).toBeDisabled();

    resolvePatch(mockJsonResponse(200, unlockedRes));

    await waitFor(() => {
      expect(within(targetRow).getByText('Hoạt động')).toBeInTheDocument();
    });
    expect(within(targetRow).getByRole('button', { name: 'Khóa' })).toBeInTheDocument();
    expect(screen.getByTestId('staff-employees-action-success')).toHaveTextContent(
      `Đã mở khóa tài khoản "${lockedTarget.displayName}".`
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/staff/${lockedTarget.id}/status`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isActive: true,
    });
  });

  it('4. Phân quyền: mục Nhân viên trên thanh điều hướng chỉ ADMIN thấy; STAFF gõ vào chuyển về /staff; Khách/CUSTOMER chuyển về /', async () => {
    // 4a. STAFF: ẩn mục Nhân viên trên thanh điều hướng và chuyển hướng từ /staff/employees về /staff
    setAuthSession('STAFF');
    globalThis.fetch = vi.fn();

    const staffView = render(
      <AuthProvider>
        <StaffLayout>
          <StaffEmployeesPage />
        </StaffLayout>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/staff');
    });
    expect(screen.queryByRole('link', { name: 'Nhân viên' })).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    staffView.unmount();

    // 4b. CUSTOMER: chuyển về / và không gọi API
    vi.clearAllMocks();
    setAuthSession('CUSTOMER');
    const customerView = renderStaffEmployeesPage();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    customerView.unmount();

    // 4c. Khách chưa đăng nhập: chuyển về / và không gọi API
    vi.clearAllMocks();
    localStorage.clear();
    const guestView = renderStaffEmployeesPage();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    guestView.unmount();

    // 4d. ADMIN: hiện mục Nhân viên trên thanh điều hướng
    vi.clearAllMocks();
    setAuthSession('ADMIN');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, cloneSeedEmployees()));
    render(
      <AuthProvider>
        <StaffLayout>
          <StaffEmployeesPage />
        </StaffLayout>
      </AuthProvider>
    );
    expect(await screen.findByRole('link', { name: 'Nhân viên' })).toHaveAttribute(
      'href',
      '/staff/employees'
    );
    expect(
      await screen.findByTestId('staff-employee-row-55555555-0000-0000-0000-000000000001')
    ).toBeInTheDocument();
  });

  it('5. Hiển thị đúng trạng thái Error kèm nút Thử lại và trạng thái Empty', async () => {
    const user = userEvent.setup();
    const employees = cloneSeedEmployees();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network fail'))
      .mockResolvedValueOnce(mockJsonResponse(200, []))
      .mockResolvedValueOnce(mockJsonResponse(200, employees));
    globalThis.fetch = fetchMock;

    renderStaffEmployeesPage();

    const errorBox = await screen.findByTestId('staff-employees-error');
    expect(errorBox).toHaveTextContent('Không thể kết nối đến máy chủ');

    // Thử lại -> nhận [] -> Empty
    await user.click(within(errorBox).getByRole('button', { name: 'Thử lại' }));
    const emptyBox = await screen.findByTestId('staff-employees-empty');
    expect(emptyBox).toHaveTextContent('Chưa có nhân viên nào');

    // Tải lại -> có dữ liệu
    await user.click(within(emptyBox).getByRole('button', { name: 'Tải lại' }));
    expect(
      await screen.findByTestId('staff-employee-row-55555555-0000-0000-0000-000000000001')
    ).toBeInTheDocument();
  });

  it('6. Xử lý 401 (về đăng nhập), 403 "Tài khoản đã bị khóa" (thông báo + tự đăng xuất), 403 sai vai trò và 404 "Không tìm thấy nhân viên"', async () => {
    const user = userEvent.setup();
    const originalLocation = window.location;
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = {
      pathname: '/staff/employees',
      search: '',
      href: '/staff/employees',
    };

    const lockedMessages: string[] = [];
    const handleLockedEvent = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string }>;
      lockedMessages.push(custom.detail?.message || '');
    };
    window.addEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);

    // 6a. 403 Tài khoản đã bị khóa -> thông báo + tự đăng xuất
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse(403, {
        statusCode: 403,
        message: 'Tài khoản đã bị khóa',
        error: 'Forbidden',
      })
    );

    const { unmount } = renderStaffEmployeesPage();
    const lockedErrorBox = await screen.findByTestId('staff-employees-error');
    expect(lockedErrorBox).toHaveTextContent('Tài khoản đã bị khóa');
    expect(lockedMessages).toEqual(['Tài khoản đã bị khóa']);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    unmount();

    // 6b. 403 sai vai trò (giữ phiên) & 404 "Không tìm thấy nhân viên" khi thao tác
    setAuthSession('ADMIN');
    const employees = cloneSeedEmployees();
    const targetLocked = employees[2]; // Đã khóa -> bấm Mở khóa trực tiếp
    const remainingEmployees = employees.slice(0, 2);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, employees))
      .mockResolvedValueOnce(
        mockJsonResponse(403, {
          statusCode: 403,
          message: 'Bạn không có quyền thực hiện thao tác này',
          error: 'Forbidden',
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse(404, {
          statusCode: 404,
          message: 'Không tìm thấy nhân viên',
          error: 'Not Found',
        })
      )
      .mockResolvedValueOnce(mockJsonResponse(200, remainingEmployees));

    const { unmount: unmountActionErr } = renderStaffEmployeesPage();
    const row = await screen.findByTestId(`staff-employee-row-${targetLocked.id}`);

    // 403 sai vai trò
    await user.click(within(row).getByRole('button', { name: 'Mở khóa' }));
    const actionForbidden = await screen.findByTestId('staff-employees-action-error');
    expect(actionForbidden).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();

    // 404 Không tìm thấy nhân viên -> hiện thông báo và tải lại danh sách
    await user.click(within(row).getByRole('button', { name: 'Mở khóa' }));
    const actionNotFound = await screen.findByTestId('staff-employees-action-error');
    expect(actionNotFound).toHaveTextContent('Không tìm thấy nhân viên');
    await waitFor(() => {
      expect(
        screen.queryByTestId(`staff-employee-row-${targetLocked.id}`)
      ).not.toBeInTheDocument();
    });
    unmountActionErr();

    // 6c. 401 hết phiên -> xóa phiên và chuyển về đăng nhập
    setAuthSession('ADMIN');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse(401, {
        statusCode: 401,
        message: 'Unauthorized',
      })
    );

    renderStaffEmployeesPage();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(window.location.href).toBe('/login?redirect=%2Fstaff%2Femployees&expired=true');
    });

    window.removeEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);
    (window as unknown as Record<string, unknown>).location = originalLocation;
  });

  it('7. Khi bật dữ liệu giả (NEXT_PUBLIC_USE_MOCK=true) chạy hoàn toàn bằng mock và không gọi fetch', async () => {
    const user = userEvent.setup();
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    globalThis.fetch = vi.fn();

    renderStaffEmployeesPage();

    const row1 = await screen.findByTestId(
      'staff-employee-row-55555555-0000-0000-0000-000000000001'
    );
    const row3 = screen.getByTestId(
      'staff-employee-row-55555555-0000-0000-0000-000000000003'
    );
    expect(within(row1).getByText('Hoạt động')).toBeInTheDocument();
    expect(within(row3).getByText('Đã khóa')).toBeInTheDocument();

    // Khóa Nhân viên 1 qua mock
    await user.click(within(row1).getByRole('button', { name: 'Khóa' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận khóa' }));
    await waitFor(() => {
      expect(within(row1).getByText('Đã khóa')).toBeInTheDocument();
    });

    // Mở khóa Nhân viên 3 qua mock
    await user.click(within(row3).getByRole('button', { name: 'Mở khóa' }));
    await waitFor(() => {
      expect(within(row3).getByText('Hoạt động')).toBeInTheDocument();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

