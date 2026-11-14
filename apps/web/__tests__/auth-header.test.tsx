import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthNav from '../app/components/AuthNav';
import { AuthProvider } from '../context/AuthContext';
import { useRequireAuth } from '../context/useRequireAuth';
import { AUTH_STORAGE_KEY, clearAuthSession } from '../utils/auth';
import { CART_STORAGE_KEY } from '../utils/cart';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const loggedInSession = {
  token: 'existing-jwt',
  user: { id: 'u-1', email: 'an@brewlite.vn', displayName: 'Nguyễn Văn An', role: 'CUSTOMER' },
};

const cartData = JSON.stringify([
  { id: 'cart-1', productId: '1', name: 'Cà phê sữa đá', unitPrice: 29000, quantity: 2, toppings: [], note: '' },
]);

function renderHeader() {
  return render(
    <AuthProvider>
      <AuthNav />
    </AuthProvider>
  );
}

describe('Header xác thực (AuthNav)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. Lúc mới tải (đang kiểm tra) chỉ hiện khung trống, không hiện nhầm nút đăng nhập hay tên', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    renderHeader();

    // Lần render đầu: chưa đọc localStorage xong
    expect(screen.getByTestId('auth-nav-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đăng nhập tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument();

    // Sau khi đọc xong thì hiện đúng nội dung
    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-nav-skeleton')).not.toBeInTheDocument();
  });

  it('2. Chưa đăng nhập: hiện liên kết "Đăng nhập" và "Đăng ký" có aria-label tiếng Việt', async () => {
    renderHeader();

    const loginLink = await screen.findByRole('link', { name: 'Đăng nhập tài khoản' });
    const registerLink = screen.getByRole('link', { name: 'Đăng ký tài khoản mới' });

    expect(loginLink).toHaveAttribute('href', '/login');
    expect(registerLink).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('button', { name: 'Đăng xuất khỏi tài khoản' })).not.toBeInTheDocument();
  });

  it('3. Đã đăng nhập: hiện tên người dùng và nút "Đăng xuất", ẩn liên kết đăng nhập/đăng ký', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    renderHeader();

    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất khỏi tài khoản' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đăng nhập tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đăng ký tài khoản mới' })).not.toBeInTheDocument();
  });

  it('4. Đăng xuất: xóa phiên đăng nhập, GIỮ NGUYÊN giỏ hàng, chuyển về Menu', async () => {
    const user = userEvent.setup();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    localStorage.setItem(CART_STORAGE_KEY, cartData);
    renderHeader();

    await user.click(await screen.findByRole('button', { name: 'Đăng xuất khỏi tài khoản' }));

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(cartData);
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(await screen.findByRole('link', { name: 'Đăng nhập tài khoản' })).toBeInTheDocument();
  });

  it('5. Đồng bộ giữa các tab: tab khác đăng xuất thì header tab này cũng chuyển về chưa đăng nhập', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    renderHeader();
    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();

    // Giả lập tab khác xóa khóa auth rồi trình duyệt bắn sự kiện storage
    act(() => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY }));
    });

    expect(await screen.findByRole('link', { name: 'Đăng nhập tài khoản' })).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument();
  });
});

function ProtectedProbe() {
  const { isReady, isChecking, user } = useRequireAuth();
  if (isChecking) return <p>Đang kiểm tra đăng nhập...</p>;
  if (!isReady) return <p>Chưa đăng nhập</p>;
  return <p>Nội dung riêng của {user?.displayName}</p>;
}

describe('Hook bảo vệ trang useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('6. Chưa đăng nhập: chuyển sang /login kèm redirect trỏ về trang hiện tại (cả query)', async () => {
    window.history.pushState({}, '', '/cart?step=2');

    render(
      <AuthProvider>
        <ProtectedProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fcart%3Fstep%3D2');
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('7. Đang kiểm tra trạng thái thì KHÔNG chuyển trang vội', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));

    render(
      <AuthProvider>
        <ProtectedProbe />
      </AuthProvider>
    );

    // Lần render đầu, chưa đọc xong localStorage
    expect(screen.getByText('Đang kiểm tra đăng nhập...')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    // Chờ đọc xong: người đã đăng nhập vẫn ở lại trang, suốt quá trình không bị chuyển đi
    expect(await screen.findByText('Nội dung riêng của Nguyễn Văn An')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('8. Đã đăng nhập: hiển thị nội dung, không chuyển trang', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));

    render(
      <AuthProvider>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByText('Nội dung riêng của Nguyễn Văn An')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('9. Dữ liệu auth hỏng thì coi như chưa đăng nhập và chuyển /login, không làm sập trang', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{hong-json');
    window.history.pushState({}, '', '/orders');

    render(
      <AuthProvider>
        <ProtectedProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Forders');
    });
  });

  it('10. Khi clearAuthSession() phát sự kiện xóa phiên (lỗi 401 giữa phiên), AuthContext xóa ngay user và token về null trong cùng tab', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    renderHeader();

    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();

    act(() => {
      clearAuthSession();
    });

    expect(await screen.findByRole('link', { name: 'Đăng nhập tài khoản' })).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});

function ProtectedProbeSkipRedirect() {
  const { isReady, isChecking } = useRequireAuth({ skipRedirect: true });
  if (isChecking) return <p>Đang kiểm tra đăng nhập...</p>;
  if (!isReady) return <p>Đang chuyển hướng tùy chỉnh</p>;
  return <p>Đã đăng nhập</p>;
}

describe('useRequireAuth với tùy chọn skipRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('11. Khi skipRedirect=true và chưa đăng nhập hoặc bị xóa phiên, hook không tự gọi router.replace đè redirect tùy chỉnh', async () => {
    const firstView = render(
      <AuthProvider>
        <ProtectedProbeSkipRedirect />
      </AuthProvider>
    );

    expect(await screen.findByText('Đang chuyển hướng tùy chỉnh')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    firstView.unmount();

    // Khi đang đăng nhập rồi bị clearAuthSession() cũng không tự gọi replace
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInSession));
    const { unmount } = render(
      <AuthProvider>
        <ProtectedProbeSkipRedirect />
      </AuthProvider>
    );
    expect(await screen.findByText('Đã đăng nhập')).toBeInTheDocument();

    act(() => {
      clearAuthSession();
    });

    await waitFor(() => {
      expect(screen.getByText('Đang chuyển hướng tùy chỉnh')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
    unmount();
  });
});
