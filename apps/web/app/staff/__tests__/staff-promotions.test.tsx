import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { resetMockPromotionsDatabase } from '../../../mocks/mock-promotions';
import { resetRedirectFlag } from '../../../services/auth';
import { UserRole } from '../../../services/auth-contract';
import { Promotion } from '../../../services/promotions';
import {
  AUTH_ACCOUNT_LOCKED_EVENT,
  AUTH_STORAGE_KEY,
  saveAuthSession,
} from '../../../utils/auth';
import StaffLayout from '../layout';
import StaffPromotionsPage from '../promotions/page';
import {
  formatStaffPromotionMaxDiscount,
  formatStaffPromotionValue,
  getStaffPromotionStatusLabel,
  getStaffPromotionTypeLabel,
} from '../services/staff-promotions';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

let mockPathname = '/staff/promotions';

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

const SAMPLE_PROMOTIONS: Promotion[] = [
  {
    id: '77777777-0000-0000-0000-000000000004',
    code: 'BREW5',
    type: 'PERCENT',
    value: 5,
    maxDiscount: null,
    isActive: true,
    createdAt: '2026-11-01T08:15:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000003',
    code: 'TAMNGUNG',
    type: 'PERCENT',
    value: 15,
    maxDiscount: 20000,
    isActive: false,
    createdAt: '2026-11-01T08:10:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000002',
    code: 'GIAM20K',
    type: 'FIXED',
    value: 20000,
    maxDiscount: null,
    isActive: true,
    createdAt: '2026-11-01T08:05:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000001',
    code: 'BREW10',
    type: 'PERCENT',
    value: 10,
    maxDiscount: 15000,
    isActive: true,
    createdAt: '2026-11-01T08:00:00.000Z',
  },
];

function cloneSamplePromotions(): Promotion[] {
  return SAMPLE_PROMOTIONS.map((item) => ({ ...item }));
}

function setAuthSession(role: UserRole = 'ADMIN') {
  saveAuthSession({
    token: `jwt-${role.toLowerCase()}-promotions-test`,
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

function renderStaffPromotionsPage() {
  return render(
    <AuthProvider>
      <StaffPromotionsPage />
    </AuthProvider>
  );
}

describe('Dòng 28 - Trang /staff/promotions (Quản lý mã giảm giá - chỉ ADMIN)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockPromotionsDatabase();
    mockPathname = '/staff/promotions';

    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    delete process.env.NEXT_PUBLIC_USE_MOCK_PROMOTIONS;
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

  it('0. Helper nhãn và định dạng giá trị / trần giảm hiển thị đúng theo hợp đồng', () => {
    expect(getStaffPromotionTypeLabel('PERCENT')).toBe('Giảm theo %');
    expect(getStaffPromotionTypeLabel('FIXED')).toBe('Giảm số tiền');
    expect(getStaffPromotionStatusLabel(true)).toBe('Đang bật');
    expect(getStaffPromotionStatusLabel(false)).toBe('Đã tắt');

    expect(formatStaffPromotionValue({ type: 'PERCENT', value: 10 })).toBe('10%');
    expect(formatStaffPromotionValue({ type: 'FIXED', value: 20000 })).toBe('20.000đ');
    expect(formatStaffPromotionMaxDiscount(15000)).toBe('15.000đ');
    expect(formatStaffPromotionMaxDiscount(null)).toBe('—');
  });

  it('1. Hiển thị loading rồi tải bảng mã giảm giá đủ cột, đúng nhãn/định dạng, giữ nguyên thứ tự server và có nút Thêm mã / Sửa (không có Xóa)', async () => {
    const promotions = cloneSamplePromotions();
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = vi.fn().mockReturnValueOnce(pendingFetch);

    renderStaffPromotionsPage();

    expect(await screen.findByTestId('staff-promotions-loading')).toBeInTheDocument();

    resolveFetch(mockJsonResponse(200, promotions));

    // Đủ cột tiêu đề
    expect(await screen.findByRole('columnheader', { name: 'Mã' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Loại' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Giá trị' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Trần giảm' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Trạng thái' })).toBeInTheDocument();

    // Thứ tự giữ nguyên từ server (mới nhất trước)
    const rows = screen.getAllByTestId(/^staff-promotion-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'staff-promotion-row-77777777-0000-0000-0000-000000000004',
      'staff-promotion-row-77777777-0000-0000-0000-000000000003',
      'staff-promotion-row-77777777-0000-0000-0000-000000000002',
      'staff-promotion-row-77777777-0000-0000-0000-000000000001',
    ]);

    // PERCENT không trần
    const noCapRow = rows[0];
    expect(within(noCapRow).getByText('BREW5')).toBeInTheDocument();
    expect(within(noCapRow).getByText('Giảm theo %')).toBeInTheDocument();
    expect(within(noCapRow).getByText('5%')).toBeInTheDocument();
    expect(within(noCapRow).getByText('—')).toBeInTheDocument();
    expect(within(noCapRow).getByText('Đang bật')).toBeInTheDocument();
    expect(within(noCapRow).getByRole('button', { name: 'Tắt' })).toBeInTheDocument();

    // Đã tắt
    const inactiveRow = rows[1];
    expect(within(inactiveRow).getByText('TAMNGUNG')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('15%')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('20.000đ')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Đã tắt')).toBeInTheDocument();
    expect(within(inactiveRow).getByRole('button', { name: 'Bật' })).toBeInTheDocument();

    // FIXED
    const fixedRow = rows[2];
    expect(within(fixedRow).getByText('GIAM20K')).toBeInTheDocument();
    expect(within(fixedRow).getByText('Giảm số tiền')).toBeInTheDocument();
    expect(within(fixedRow).getByText('20.000đ')).toBeInTheDocument();
    expect(within(fixedRow).getByText('—')).toBeInTheDocument();
    expect(within(fixedRow).getByText('Đang bật')).toBeInTheDocument();

    // PERCENT có trần
    const percentCapRow = rows[3];
    expect(within(percentCapRow).getByText('BREW10')).toBeInTheDocument();
    expect(within(percentCapRow).getByText('10%')).toBeInTheDocument();
    expect(within(percentCapRow).getByText('15.000đ')).toBeInTheDocument();

    // Có nút Thêm mã, Sửa và không có nút Xóa
    expect(screen.getByRole('button', { name: 'Thêm mã' })).toBeInTheDocument();
    expect(within(noCapRow).getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa/i })).not.toBeInTheDocument();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(calledUrl)).toBe('http://localhost:3001/promotions');
    expect(calledInit?.method).toBe('GET');
  });

  it('2. Bấm Tắt mở ConfirmDialog; Đóng không gọi API; Xác nhận khóa nút khi đang gọi, gửi PATCH /promotions/:id { isActive: false }, cập nhật dòng và hiện thông báo', async () => {
    const user = userEvent.setup();
    const promotions = cloneSamplePromotions();
    const target = promotions[3]; // BREW10 (isActive: true)
    const disabledRes: Promotion = { ...target, isActive: false };

    let resolvePatch!: (value: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, promotions))
      .mockReturnValueOnce(pendingPatch);
    globalThis.fetch = fetchMock;

    renderStaffPromotionsPage();

    const targetRow = await screen.findByTestId(`staff-promotion-row-${target.id}`);
    const inactiveRow = screen.getByTestId(
      'staff-promotion-row-77777777-0000-0000-0000-000000000003'
    );

    // Bấm Tắt -> mở hộp xác nhận, chưa gọi PATCH
    await user.click(within(targetRow).getByRole('button', { name: 'Tắt' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`Tắt mã giảm giá "${target.code}"?`)).toBeInTheDocument();

    // Bấm Đóng -> hủy
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mở lại và Xác nhận tắt
    await user.click(within(targetRow).getByRole('button', { name: 'Tắt' }));
    const dialogAgain = await screen.findByRole('dialog');
    await user.click(within(dialogAgain).getByRole('button', { name: 'Xác nhận tắt' }));

    // Khóa nút khi đang gọi API
    await waitFor(() => {
      expect(within(dialogAgain).getByRole('button', { name: 'Đang tắt...' })).toBeDisabled();
    });
    expect(within(dialogAgain).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    expect(within(targetRow).getByRole('button', { name: 'Đang tắt...' })).toBeDisabled();
    expect(within(inactiveRow).getByRole('button', { name: 'Bật' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /tải lại/i })).toBeDisabled();

    resolvePatch(mockJsonResponse(200, disabledRes));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(within(targetRow).getByText('Đã tắt')).toBeInTheDocument();
    expect(within(targetRow).getByRole('button', { name: 'Bật' })).toBeInTheDocument();
    expect(screen.getByTestId('staff-promotions-action-success')).toHaveTextContent(
      `Đã tắt mã "${target.code}".`
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/promotions/${target.id}`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isActive: false,
    });
  });

  it('3. Bấm Bật KHÔNG mở hộp xác nhận, khóa nút tránh bấm đúp, gửi PATCH /promotions/:id { isActive: true }, cập nhật dòng và hiện thông báo', async () => {
    const user = userEvent.setup();
    const promotions = cloneSamplePromotions();
    const inactiveTarget = promotions[1]; // TAMNGUNG (isActive: false)
    const enabledRes: Promotion = { ...inactiveTarget, isActive: true };

    let resolvePatch!: (value: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, promotions))
      .mockReturnValueOnce(pendingPatch);
    globalThis.fetch = fetchMock;

    renderStaffPromotionsPage();

    const targetRow = await screen.findByTestId(`staff-promotion-row-${inactiveTarget.id}`);
    const otherActiveRow = screen.getByTestId(
      'staff-promotion-row-77777777-0000-0000-0000-000000000001'
    );

    // Bấm Bật -> gọi thẳng API, không có ConfirmDialog
    const enableBtn = within(targetRow).getByRole('button', { name: 'Bật' });
    await user.click(enableBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(within(targetRow).getByRole('button', { name: 'Đang bật...' })).toBeDisabled();
    });
    expect(within(otherActiveRow).getByRole('button', { name: 'Tắt' })).toBeDisabled();

    // Bấm đúp khi đang chờ không gửi thêm request
    await user.click(within(targetRow).getByRole('button', { name: 'Đang bật...' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvePatch(mockJsonResponse(200, enabledRes));

    await waitFor(() => {
      expect(within(targetRow).getByText('Đang bật')).toBeInTheDocument();
    });
    expect(within(targetRow).getByRole('button', { name: 'Tắt' })).toBeInTheDocument();
    expect(screen.getByTestId('staff-promotions-action-success')).toHaveTextContent(
      `Đã bật mã "${inactiveTarget.code}".`
    );

    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3001/promotions/${inactiveTarget.id}`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      isActive: true,
    });
  });

  it('4. Phân quyền: mục Khuyến mãi chỉ ADMIN thấy; STAFF gõ vào chuyển về /staff; Khách/CUSTOMER chuyển về /', async () => {
    // 4a. STAFF: ẩn mục Khuyến mãi trên điều hướng và chuyển về /staff
    setAuthSession('STAFF');
    globalThis.fetch = vi.fn();

    const staffView = render(
      <AuthProvider>
        <StaffLayout>
          <StaffPromotionsPage />
        </StaffLayout>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/staff');
    });
    expect(screen.queryByRole('link', { name: 'Khuyến mãi' })).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    staffView.unmount();

    // 4b. CUSTOMER: chuyển về / và không gọi API
    vi.clearAllMocks();
    setAuthSession('CUSTOMER');
    const customerView = renderStaffPromotionsPage();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    customerView.unmount();

    // 4c. Chưa đăng nhập: chuyển về / và không gọi API
    vi.clearAllMocks();
    localStorage.clear();
    const guestView = renderStaffPromotionsPage();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    guestView.unmount();

    // 4d. ADMIN: thấy mục Khuyến mãi và tải bảng thành công
    vi.clearAllMocks();
    setAuthSession('ADMIN');
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, cloneSamplePromotions()));
    render(
      <AuthProvider>
        <StaffLayout>
          <StaffPromotionsPage />
        </StaffLayout>
      </AuthProvider>
    );
    expect(await screen.findByRole('link', { name: 'Khuyến mãi' })).toHaveAttribute(
      'href',
      '/staff/promotions'
    );
    expect(
      await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000001')
    ).toBeInTheDocument();
  });

  it('5. Hiển thị đúng trạng thái Error kèm nút Thử lại và trạng thái Empty', async () => {
    const user = userEvent.setup();
    const promotions = cloneSamplePromotions();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network fail'))
      .mockResolvedValueOnce(mockJsonResponse(200, []))
      .mockResolvedValueOnce(mockJsonResponse(200, promotions));
    globalThis.fetch = fetchMock;

    renderStaffPromotionsPage();

    const errorBox = await screen.findByTestId('staff-promotions-error');
    expect(errorBox).toHaveTextContent('Không thể kết nối đến máy chủ');

    // Thử lại -> nhận [] -> Empty
    await user.click(within(errorBox).getByRole('button', { name: 'Thử lại' }));
    const emptyBox = await screen.findByTestId('staff-promotions-empty');
    expect(emptyBox).toHaveTextContent('Chưa có mã giảm giá nào');

    // Tải lại -> có dữ liệu
    await user.click(within(emptyBox).getByRole('button', { name: 'Tải lại' }));
    expect(
      await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000001')
    ).toBeInTheDocument();
  });

  it('6. Xử lý 401 (về đăng nhập), 403 "Tài khoản đã bị khóa" (thông báo + tự đăng xuất), 403 sai vai trò và 404 "Không tìm thấy mã giảm giá"', async () => {
    const user = userEvent.setup();
    const originalLocation = window.location;
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = {
      pathname: '/staff/promotions',
      search: '',
      href: '/staff/promotions',
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

    const { unmount } = renderStaffPromotionsPage();
    const lockedErrorBox = await screen.findByTestId('staff-promotions-error');
    expect(lockedErrorBox).toHaveTextContent('Tài khoản đã bị khóa');
    expect(lockedMessages).toEqual(['Tài khoản đã bị khóa']);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    unmount();

    // 6b. 403 sai vai trò (giữ phiên) & 404 "Không tìm thấy mã giảm giá" khi thao tác
    setAuthSession('ADMIN');
    const promotions = cloneSamplePromotions();
    const targetInactive = promotions[1]; // TAMNGUNG (isActive: false -> bấm Bật)
    const remainingPromotions = promotions.filter((p) => p.id !== targetInactive.id);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, promotions))
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
          message: 'Không tìm thấy mã giảm giá',
          error: 'Not Found',
        })
      )
      .mockResolvedValueOnce(mockJsonResponse(200, remainingPromotions));

    const { unmount: unmountActionErr } = renderStaffPromotionsPage();
    const row = await screen.findByTestId(`staff-promotion-row-${targetInactive.id}`);

    // 403 sai vai trò
    await user.click(within(row).getByRole('button', { name: 'Bật' }));
    const actionForbidden = await screen.findByTestId('staff-promotions-action-error');
    expect(actionForbidden).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();

    // 404 Không tìm thấy mã giảm giá -> hiện đúng message và tải lại danh sách
    await user.click(within(row).getByRole('button', { name: 'Bật' }));
    const actionNotFound = await screen.findByTestId('staff-promotions-action-error');
    expect(actionNotFound).toHaveTextContent('Không tìm thấy mã giảm giá');
    await waitFor(() => {
      expect(
        screen.queryByTestId(`staff-promotion-row-${targetInactive.id}`)
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

    renderStaffPromotionsPage();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(window.location.href).toBe('/login?redirect=%2Fstaff%2Fpromotions&expired=true');
    });

    window.removeEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);
    (window as unknown as Record<string, unknown>).location = originalLocation;
  });

  it('7. Khi bật dữ liệu giả (NEXT_PUBLIC_USE_MOCK=true) chạy hoàn toàn bằng mock (đủ PERCENT có trần, PERCENT không trần, FIXED, đã tắt) và không gọi fetch', async () => {
    const user = userEvent.setup();
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    globalThis.fetch = vi.fn();

    renderStaffPromotionsPage();

    // Đủ 4 mã mock
    const rowBrew10 = await screen.findByTestId(
      'staff-promotion-row-77777777-0000-0000-0000-000000000001'
    );
    const rowGiam20k = screen.getByTestId(
      'staff-promotion-row-77777777-0000-0000-0000-000000000002'
    );
    const rowTamNgung = screen.getByTestId(
      'staff-promotion-row-77777777-0000-0000-0000-000000000003'
    );
    const rowBrew5 = screen.getByTestId(
      'staff-promotion-row-77777777-0000-0000-0000-000000000004'
    );

    expect(within(rowBrew10).getByText('15.000đ')).toBeInTheDocument();
    expect(within(rowBrew5).getByText('5%')).toBeInTheDocument();
    expect(within(rowBrew5).getByText('—')).toBeInTheDocument();
    expect(within(rowGiam20k).getByText('20.000đ')).toBeInTheDocument();
    expect(within(rowTamNgung).getByText('Đã tắt')).toBeInTheDocument();

    // Tắt BREW10 qua mock (có ConfirmDialog)
    await user.click(within(rowBrew10).getByRole('button', { name: 'Tắt' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận tắt' }));
    await waitFor(() => {
      expect(within(rowBrew10).getByText('Đã tắt')).toBeInTheDocument();
    });

    // Bật TAMNGUNG qua mock (không có ConfirmDialog)
    await user.click(within(rowTamNgung).getByRole('button', { name: 'Bật' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(rowTamNgung).getByText('Đang bật')).toBeInTheDocument();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
