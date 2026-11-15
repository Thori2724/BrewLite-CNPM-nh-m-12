import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '../app/login/page';
import RegisterPage from '../app/register/page';
import { AuthProvider } from '../context/AuthContext';
import * as authService from '../services/auth';
import { AUTH_ERROR_MESSAGES } from '../services/auth-contract';
import * as navigation from 'next/navigation';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

// Mock services/auth
vi.mock('../services/auth', async () => {
  const actual = await vi.importActual<typeof import('../services/auth')>('../services/auth');
  return {
    ...actual,
    loginApi: vi.fn(),
    registerApi: vi.fn(),
  };
});

describe('Giao diện và nghiệp vụ trang Đăng nhập (/login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSearchParams = new URLSearchParams();
    vi.mocked(navigation.useSearchParams).mockImplementation(
      () => mockSearchParams as unknown as ReturnType<typeof navigation.useSearchParams>
    );
    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);
  });

  it('1. Hiển thị đầy đủ các trường nhập liệu, nút bấm và liên kết đăng ký', async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /đăng nhập tài khoản/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/địa chỉ email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^mật khẩu$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^đăng nhập$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /đăng ký ngay/i })).toBeInTheDocument();
    });
  });

  it('2. Hiển thị thông báo phiên hết hạn khi URL có tham số expired=true', async () => {
    mockSearchParams = new URLSearchParams('expired=true');

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(AUTH_ERROR_MESSAGES.SESSION_EXPIRED)).toBeInTheDocument();
    });
  });

  it('3. Hiển thị thông báo đăng ký thành công khi URL có tham số registered=true', async () => {
    mockSearchParams = new URLSearchParams('registered=true');

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(AUTH_ERROR_MESSAGES.REGISTRATION_SUCCESS)).toBeInTheDocument();
    });
  });

  it('4. Validate phía client: Báo lỗi khi để trống hoặc nhập sai định dạng email (không áp >= 6 ở đăng nhập)', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    const submitBtn = await screen.findByRole('button', { name: /^đăng nhập$/i });

    // Submit form rỗng
    await user.click(submitBtn);

    expect(await screen.findByText('Vui lòng nhập địa chỉ email')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument();

    // Nhập email sai định dạng
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'sai-email');
    await user.click(submitBtn);

    expect(await screen.findByText('Địa chỉ email không đúng định dạng')).toBeInTheDocument();

    // Không được gọi loginApi khi validate lỗi
    expect(authService.loginApi).not.toHaveBeenCalled();
  });

  it('5. Hiển thị thông báo lỗi chung khi đăng nhập thất bại từ server (sai tài khoản/mật khẩu)', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.loginApi).mockRejectedValue(
      new authService.AuthApiError(401, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS)
    );

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/địa chỉ email/i), 'user@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /^đăng nhập$/i }));

    expect(await screen.findByText(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS)).toBeInTheDocument();
  });

  it('6. Nút Đăng nhập bị vô hiệu hóa trong khi đang gửi để chống bấm nhiều lần', async () => {
    const user = userEvent.setup();

    let resolvePromise: (val: { accessToken: string; user: { id: string; email: string; displayName: string; role: 'CUSTOMER' } }) => void = () => {};
    const pendingPromise = new Promise<{ accessToken: string; user: { id: string; email: string; displayName: string; role: 'CUSTOMER' } }>((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(authService.loginApi).mockReturnValue(pendingPromise);

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/địa chỉ email/i), 'user@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), 'correct123');

    const submitBtn = screen.getByRole('button', { name: /^đăng nhập$/i });
    await user.click(submitBtn);

    // Kiểm tra nút bị disabled và hiển thị text đang tải
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText('Đang đăng nhập...')).toBeInTheDocument();

    // Hoàn tất promise
    resolvePromise({
      accessToken: 'fake-jwt',
      user: { id: '1', email: 'user@brewlite.vn', displayName: 'User', role: 'CUSTOMER' },
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it('7. Chuyển đổi ẩn/hiện mật khẩu khi bấm nút mắt', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    const passwordInput = await screen.findByLabelText(/^mật khẩu$/i);
    const toggleBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' });

    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('8. Đăng nhập thành công thì chuyển hướng về đúng trang redirect an toàn', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams('redirect=/cart');

    vi.mocked(authService.loginApi).mockResolvedValue({
      accessToken: 'valid-jwt',
      user: { id: 'user-1', email: 'khachhang@brewlite.vn', displayName: 'Khách Hàng', role: 'CUSTOMER' },
    });

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/địa chỉ email/i), 'khachhang@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^đăng nhập$/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/cart');
    });
  });

  it('9. Người dùng đã đăng nhập từ trước vào /login thì tự động chuyển hướng về trang chủ', async () => {
    localStorage.setItem(
      'brewlite_auth_v2',
      JSON.stringify({
        token: 'existing-jwt',
        user: { id: '1', email: 'logged@brewlite.vn', displayName: 'Logged In', role: 'CUSTOMER' },
      })
    );

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});

describe('Giao diện và nghiệp vụ trang Đăng ký (/register)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSearchParams = new URLSearchParams();
    vi.mocked(navigation.useSearchParams).mockImplementation(
      () => mockSearchParams as unknown as ReturnType<typeof navigation.useSearchParams>
    );
    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);
  });

  it('10. Hiển thị đầy đủ các trường: tên hiển thị, email, mật khẩu, nhập lại mật khẩu', async () => {
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /đăng ký tài khoản/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/tên hiển thị/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/địa chỉ email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^mật khẩu$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/nhập lại mật khẩu/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /đăng ký tài khoản/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /đăng nhập ngay/i })).toBeInTheDocument();
    });
  });

  it('11. Validate phía client: Báo lỗi khi thông tin không hợp lệ (displayName rỗng hoặc toàn dấu cách, mật khẩu < 6)', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    const submitBtn = await screen.findByRole('button', { name: /đăng ký tài khoản/i });

    // Submit form rỗng
    await user.click(submitBtn);

    expect(await screen.findByText('Vui lòng nhập tên hiển thị')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập địa chỉ email')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập lại mật khẩu')).toBeInTheDocument();

    // Nhập tên toàn dấu cách, mật khẩu < 6 ký tự, nhập lại không khớp
    await user.type(screen.getByLabelText(/tên hiển thị/i), '    ');
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'user@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), '12345');
    await user.type(screen.getByLabelText(/nhập lại mật khẩu/i), '654321');
    await user.click(submitBtn);

    expect(await screen.findByText('Vui lòng nhập tên hiển thị')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu phải có ít nhất 6 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();

    expect(authService.registerApi).not.toHaveBeenCalled();
  });

  it('12. Hiển thị thông báo khi email đã tồn tại (lỗi 409 Conflict) ngay dưới ô email', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.registerApi).mockRejectedValue(
      new authService.AuthApiError(409, AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS)
    );

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    const emailInput = await screen.findByLabelText(/địa chỉ email/i);
    await user.type(screen.getByLabelText(/tên hiển thị/i), 'Nguyễn Văn A');
    await user.type(emailInput, 'duplicate@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), '123456');
    await user.type(screen.getByLabelText(/nhập lại mật khẩu/i), '123456');
    await user.click(screen.getByRole('button', { name: /đăng ký tài khoản/i }));

    const emailErr = await screen.findByText(AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    expect(emailErr).toBeInTheDocument();
    expect(emailErr).toHaveAttribute('id', 'register-email-error');
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'register-email-error');
  });

  it('13. Đăng ký thành công thì chuyển hướng sang /login kèm registered=true (không tự đăng nhập)', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.registerApi).mockResolvedValue({
      id: 'new-id',
      email: 'new@brewlite.vn',
      displayName: 'Người Mới',
      role: 'CUSTOMER',
    });

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/tên hiển thị/i), 'Nguyễn Văn A');
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'new@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), '123456');
    await user.type(screen.getByLabelText(/nhập lại mật khẩu/i), '123456');
    await user.click(screen.getByRole('button', { name: /đăng ký tài khoản/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?registered=true');
    });
  });

  it('14. Nút Đăng ký bị vô hiệu hóa trong khi đang gửi để chống bấm nhiều lần', async () => {
    const user = userEvent.setup();

    let resolvePromise: (val: { id: string; email: string; displayName: string; role: 'CUSTOMER' }) => void = () => {};
    const pendingPromise = new Promise<{ id: string; email: string; displayName: string; role: 'CUSTOMER' }>((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(authService.registerApi).mockReturnValue(pendingPromise);

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/tên hiển thị/i), 'Nguyễn Văn A');
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'new@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), '123456');
    await user.type(screen.getByLabelText(/nhập lại mật khẩu/i), '123456');

    const submitBtn = screen.getByRole('button', { name: /đăng ký tài khoản/i });
    await user.click(submitBtn);

    expect(submitBtn).toBeDisabled();
    expect(screen.getByText('Đang tạo tài khoản...')).toBeInTheDocument();

    resolvePromise({
      id: 'new-id',
      email: 'new@brewlite.vn',
      displayName: 'Nguyễn Văn A',
      role: 'CUSTOMER',
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it('15. Lỗi 400 có message dạng mảng tiếng Anh từ server: giao diện chỉ hiện câu chung tiếng Việt, chuỗi tiếng Anh KHÔNG xuất hiện trên màn hình', async () => {
    const user = userEvent.setup();
    const rawEnglishMessages = ['email must be an email', 'password must be at least 6 characters'];
    vi.mocked(authService.registerApi).mockRejectedValue(
      new authService.AuthApiError(400, AUTH_ERROR_MESSAGES.VALIDATION_ERROR, {
        statusCode: 400,
        message: rawEnglishMessages,
      })
    );

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/tên hiển thị/i), 'Nguyễn Văn A');
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'test@brewlite.vn');
    await user.type(screen.getByLabelText(/^mật khẩu$/i), '123456');
    await user.type(screen.getByLabelText(/nhập lại mật khẩu/i), '123456');
    await user.click(screen.getByRole('button', { name: /đăng ký tài khoản/i }));

    // Chỉ hiện thông báo chung tiếng Việt và gắn lỗi tiếng Việt vào đúng ô
    expect(await screen.findByText(AUTH_ERROR_MESSAGES.VALIDATION_ERROR)).toBeInTheDocument();
    expect(screen.getByText('Địa chỉ email không đúng định dạng')).toHaveAttribute(
      'id',
      'register-email-error'
    );
    expect(screen.getByText('Mật khẩu phải có ít nhất 6 ký tự')).toHaveAttribute(
      'id',
      'register-password-error'
    );

    // Khẳng định chuỗi tiếng Anh của server KHÔNG xuất hiện trên màn hình
    expect(screen.queryByText('email must be an email')).not.toBeInTheDocument();
    expect(screen.queryByText('password must be at least 6 characters')).not.toBeInTheDocument();
  });
});
