import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountPage from '../app/account/page';
import AccountLockedNotice from '../app/components/AccountLockedNotice';
import RoleRouteGuard from '../app/components/RoleRouteGuard';
import { AuthProvider } from '../context/AuthContext';
import { resetMockLoyaltyDatabase } from '../mocks/mock-loyalty';
import { resetRedirectFlag } from '../services/auth';
import { UserRole } from '../services/auth-contract';
import {
  formatLoyaltyOrderNumber,
  formatSignedLoyaltyPoints,
  getLoyaltyTypeLabel,
  LoyaltyMeResponse,
} from '../services/loyalty';
import { AUTH_STORAGE_KEY, saveAuthSession } from '../utils/auth';
import { CART_STORAGE_KEY } from '../utils/cart';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  }),
  usePathname: () => '/account',
}));

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

function setAccountSession(role: UserRole, overrides?: { displayName?: string; email?: string }) {
  const defaults: Record<UserRole, { displayName: string; email: string }> = {
    CUSTOMER: { displayName: 'Khách demo', email: 'khach@example.com' },
    STAFF: { displayName: 'Nhân viên 1', email: 'nhanvien1@example.com' },
    ADMIN: { displayName: 'Quản lý', email: 'quanly@example.com' },
  };

  saveAuthSession({
    token: `jwt-${role.toLowerCase()}`,
    user: {
      id: `id-${role.toLowerCase()}`,
      email: overrides?.email ?? defaults[role].email,
      displayName: overrides?.displayName ?? defaults[role].displayName,
      role,
    },
  });
}

function renderAccountPage(withRoleGuard = false) {
  return render(
    <AuthProvider>
      <AccountLockedNotice />
      {withRoleGuard ? (
        <RoleRouteGuard>
          <AccountPage />
        </RoleRouteGuard>
      ) : (
        <AccountPage />
      )}
    </AuthProvider>
  );
}

describe('Task 18 & Dòng 27 - Trang Thông tin tài khoản (/account)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockLoyaltyDatabase();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.NEXT_PUBLIC_USE_MOCK_LOYALTY;
    window.history.pushState({}, '', '/account');
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJsonResponse(200, {
        loyaltyPoints: 50,
        transactions: [],
      } satisfies LoyaltyMeResponse)
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('1. Hiển thị trạng thái loading khi đang đọc phiên đăng nhập và chưa chuyển hướng vội', async () => {
    setAccountSession('CUSTOMER');
    renderAccountPage();

    expect(screen.getByTestId('account-loading')).toBeInTheDocument();
    expect(screen.getByText('Đang kiểm tra trạng thái đăng nhập...')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.queryByTestId('account-loading')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('2. Chưa đăng nhập: chuyển hướng về trang đăng nhập kèm redirect=/account', async () => {
    renderAccountPage(true);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Faccount');
    });
    expect(screen.queryByRole('heading', { name: 'Thông tin tài khoản' })).not.toBeInTheDocument();
  });

  it('3. Khách hàng (CUSTOMER): hiện thông tin cơ bản, khối điểm thưởng + lịch sử tối đa 50 dòng giữ nguyên thứ tự server, nhãn & dấu đúng hợp đồng, không có form sửa', async () => {
    // Cố ý đặt thời gian không theo thứ tự giảm dần để chứng minh FE giữ nguyên thứ tự server trả về
    const loyaltyPayload: LoyaltyMeResponse = {
      loyaltyPoints: 56,
      transactions: [
        {
          id: 'tx-1',
          type: 'EARN',
          points: 6,
          orderNumber: 1042,
          createdAt: '2026-11-27T03:00:00.000Z',
        },
        {
          id: 'tx-2',
          type: 'REDEEM',
          points: -10,
          orderNumber: 1042,
          createdAt: '2026-11-27T02:58:00.000Z',
        },
        {
          id: 'tx-3',
          type: 'REFUND',
          points: 15,
          orderNumber: 1041,
          createdAt: '2026-11-28T01:00:00.000Z',
        },
        {
          id: 'tx-4',
          type: 'REVOKE',
          points: -5,
          orderNumber: 1041,
          createdAt: '2026-11-25T10:15:00.000Z',
        },
        {
          id: 'tx-5',
          type: 'EARN',
          points: 50,
          orderNumber: null,
          createdAt: '2026-11-01T08:00:00.000Z',
        },
        // Thêm 50 dòng phụ để kiểm tra giới hạn hiển thị tối đa 50 dòng
        ...Array.from({ length: 50 }, (_, idx) => ({
          id: `tx-extra-${idx}`,
          type: 'EARN' as const,
          points: 1,
          orderNumber: 900 + idx,
          createdAt: '2026-10-01T00:00:00.000Z',
        })),
      ],
    };

    const fetchMock = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, loyaltyPayload));
    globalThis.fetch = fetchMock;

    setAccountSession('CUSTOMER');
    renderAccountPage(true);

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Khách demo')).toBeInTheDocument();
    expect(screen.getByText('khach@example.com')).toBeInTheDocument();
    expect(screen.getByText('Khách hàng')).toBeInTheDocument();

    const ordersLink = screen.getByRole('link', { name: 'Lịch sử đơn' });
    expect(ordersLink).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();

    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('input')).toBeNull();

    // Đã gọi GET /loyalty/me kèm token
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/loyalty\/me$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');

    const loyaltySection = screen.getByTestId('account-loyalty-section');
    expect(within(loyaltySection).getByTestId('account-loyalty-balance')).toHaveTextContent(
      '56 điểm'
    );

    const rows = within(loyaltySection).getAllByTestId(/^loyalty-tx-row-/);
    expect(rows).toHaveLength(50);

    // Kiểm tra giữ nguyên thứ tự server & đúng nhãn + dấu + màu nhẹ + mã đơn + thời gian UTC+7
    expect(rows[0]).toHaveTextContent('Tích điểm');
    expect(rows[0]).toHaveTextContent('+6');
    expect(rows[0]).toHaveTextContent('#1042');
    expect(rows[0]).toHaveTextContent('27/11/2026 10:00');
    expect(within(rows[0]).getByText('+6')).toHaveClass('text-emerald-700');

    expect(rows[1]).toHaveTextContent('Dùng điểm');
    expect(rows[1]).toHaveTextContent('-10');
    expect(rows[1]).toHaveTextContent('#1042');
    expect(within(rows[1]).getByText('-10')).toHaveClass('text-error');

    expect(rows[2]).toHaveTextContent('Hoàn điểm');
    expect(rows[2]).toHaveTextContent('+15');
    expect(rows[2]).toHaveTextContent('#1041');

    expect(rows[3]).toHaveTextContent('Thu hồi điểm');
    expect(rows[3]).toHaveTextContent('-5');
    expect(rows[3]).toHaveTextContent('#1041');

    // orderNumber = null phải hiện "—" và tuyệt đối không hiện chữ "null"
    expect(rows[4]).toHaveTextContent('Tích điểm');
    expect(rows[4]).toHaveTextContent('+50');
    expect(rows[4]).toHaveTextContent('—');
    expect(loyaltySection.textContent).not.toMatch(/\bnull\b/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('4. Nhân viên (STAFF): vào được /account, hiện nhãn "Nhân viên", không có link "Lịch sử đơn", không hiện khối điểm và KHÔNG gọi GET /loyalty/me', async () => {
    setAccountSession('STAFF');
    renderAccountPage(true);

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Nhân viên 1')).toBeInTheDocument();
    expect(screen.getByText('nhanvien1@example.com')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Lịch sử đơn' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-loyalty-section')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('5. Quản lý (ADMIN): vào được /account, hiện nhãn "Quản lý", không có link "Lịch sử đơn", không hiện khối điểm và KHÔNG gọi GET /loyalty/me', async () => {
    setAccountSession('ADMIN', { displayName: 'Trần Quản Lý' });
    renderAccountPage(true);

    expect(await screen.findByRole('heading', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Trần Quản Lý')).toBeInTheDocument();
    expect(screen.getByText('quanly@example.com')).toBeInTheDocument();
    expect(screen.getByText('Quản lý')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Lịch sử đơn' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-loyalty-section')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('6. Bấm "Đăng xuất": xóa phiên đăng nhập, giữ nguyên giỏ hàng, chuyển về trang chủ "/"', async () => {
    const user = userEvent.setup();
    const cartData = JSON.stringify([
      { id: 'c-1', productId: 'p-1', name: 'Trà đào cam sả', unitPrice: 45000, quantity: 1, toppings: [], note: '' },
    ]);
    setAccountSession('STAFF');
    localStorage.setItem(CART_STORAGE_KEY, cartData);

    renderAccountPage(true);

    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(cartData);
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('7. Khối điểm của CUSTOMER: hiển thị trạng thái loading rồi empty khi chưa có giao dịch điểm nào', async () => {
    let resolveLoyalty!: (value: Response) => void;
    globalThis.fetch = vi.fn().mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveLoyalty = resolve;
        })
    );

    setAccountSession('CUSTOMER');
    renderAccountPage(true);

    expect(await screen.findByTestId('account-loyalty-loading')).toHaveTextContent(
      'Đang tải điểm thưởng...'
    );

    resolveLoyalty(
      mockJsonResponse(200, {
        loyaltyPoints: 0,
        transactions: [],
      } satisfies LoyaltyMeResponse)
    );

    expect(await screen.findByTestId('account-loyalty-empty')).toHaveTextContent(
      'Chưa có giao dịch điểm nào.'
    );
    expect(screen.getByTestId('account-loyalty-balance')).toHaveTextContent('0 điểm');
    expect(screen.queryByTestId('account-loyalty-loading')).not.toBeInTheDocument();
  });

  it('8. Khối điểm của CUSTOMER: hiển thị trạng thái error và tải lại được khi bấm "Thử lại"', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(500, { message: 'Internal Server Error' }))
      .mockResolvedValueOnce(
        mockJsonResponse(200, {
          loyaltyPoints: 25,
          transactions: [
            {
              id: 'tx-retry-1',
              type: 'EARN',
              points: 25,
              orderNumber: 1055,
              createdAt: '2026-11-28T03:00:00.000Z',
            },
          ],
        } satisfies LoyaltyMeResponse)
      );
    globalThis.fetch = fetchMock;

    setAccountSession('CUSTOMER');
    renderAccountPage(true);

    const errorBox = await screen.findByTestId('account-loyalty-error');
    expect(errorBox).toHaveTextContent('Không kết nối được máy chủ, vui lòng thử lại');

    await user.click(within(errorBox).getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByTestId('account-loyalty-balance')).toHaveTextContent('25 điểm');
    expect(screen.getByTestId('loyalty-tx-row-0')).toHaveTextContent('+25');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('9. GET /loyalty/me trả 401 thì về đăng nhập; trả 403 "Tài khoản đã bị khóa" thì thông báo và tự đăng xuất', async () => {
    // Case 401
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(401, { message: 'Unauthorized' }));
    setAccountSession('CUSTOMER');
    const { unmount } = renderAccountPage(true);

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/login?redirect=%2Faccount&expired=true');
    });
    unmount();

    // Case 403 bị khóa
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(403, { message: 'Tài khoản đã bị khóa' }));
    setAccountSession('CUSTOMER');
    renderAccountPage();

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(screen.getByTestId('account-locked-notice')).toHaveTextContent(
        'Tài khoản đã bị khóa'
      );
    });
  });

  it('10. Chế độ dữ liệu giả (NEXT_PUBLIC_USE_MOCK=true): hiện 50 điểm, đủ 4 loại EARN/REDEEM/REFUND/REVOKE và 1 dòng orderNumber=null', async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    setAccountSession('CUSTOMER');
    renderAccountPage(true);

    expect(await screen.findByTestId('account-loyalty-balance')).toHaveTextContent('50 điểm');
    const loyaltySection = screen.getByTestId('account-loyalty-section');
    const rows = within(loyaltySection).getAllByTestId(/^loyalty-tx-row-/);
    expect(rows.length).toBeGreaterThanOrEqual(5);

    expect(within(loyaltySection).getAllByText('Tích điểm')).toHaveLength(2);
    expect(within(loyaltySection).getByText('Dùng điểm')).toBeInTheDocument();
    expect(within(loyaltySection).getByText('Hoàn điểm')).toBeInTheDocument();
    expect(within(loyaltySection).getByText('Thu hồi điểm')).toBeInTheDocument();
    expect(within(loyaltySection).getByText('—')).toBeInTheDocument();
    expect(within(loyaltySection).getByText('+50')).toBeInTheDocument();
    expect(loyaltySection.textContent).not.toMatch(/\bnull\b/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('11. Unit test hàm định dạng số điểm có dấu, đổi loại điểm sang nhãn và định dạng mã đơn', () => {
    expect(formatSignedLoyaltyPoints(6)).toBe('+6');
    expect(formatSignedLoyaltyPoints(50)).toBe('+50');
    expect(formatSignedLoyaltyPoints(-10)).toBe('-10');
    expect(formatSignedLoyaltyPoints(-2)).toBe('-2');
    expect(formatSignedLoyaltyPoints(0)).toBe('0');
    expect(formatSignedLoyaltyPoints(Number.NaN)).toBe('0');

    expect(getLoyaltyTypeLabel('EARN')).toBe('Tích điểm');
    expect(getLoyaltyTypeLabel('REDEEM')).toBe('Dùng điểm');
    expect(getLoyaltyTypeLabel('REFUND')).toBe('Hoàn điểm');
    expect(getLoyaltyTypeLabel('REVOKE')).toBe('Thu hồi điểm');

    expect(formatLoyaltyOrderNumber(1042)).toBe('#1042');
    expect(formatLoyaltyOrderNumber(null)).toBe('—');
    expect(formatLoyaltyOrderNumber(undefined)).toBe('—');
  });
});
