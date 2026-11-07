import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AUTH_STORAGE_KEY,
  clearAuthSession,
  extractErrorMessage,
  getSafeRedirectUrl,
  loadAuthSession,
  saveAuthSession,
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validatePassword,
} from '../utils/auth';
import { AuthUser, AUTH_ERROR_MESSAGES } from '../services/auth-contract';

describe('Logic xác thực thuần túy (utils/auth.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // 1. Kiểm tra chống Open Redirect
  describe('Hàm getSafeRedirectUrl (Chống Open Redirect)', () => {
    it('1.1. Chấp nhận các đường dẫn nội bộ hợp lệ', () => {
      expect(getSafeRedirectUrl('/cart')).toBe('/cart');
      expect(getSafeRedirectUrl('/menu/1')).toBe('/menu/1');
      expect(getSafeRedirectUrl('/order/history?tab=all')).toBe('/order/history?tab=all');
      expect(getSafeRedirectUrl('/')).toBe('/');
    });

    it('1.2. Từ chối URL dạng protocol-relative (//evil.com)', () => {
      expect(getSafeRedirectUrl('//evil.com')).toBe('/');
      expect(getSafeRedirectUrl('//google.com/phishing')).toBe('/');
      expect(getSafeRedirectUrl('///evil.com')).toBe('/');
    });

    it('1.3. Từ chối URL tuyệt đối (http://, https://)', () => {
      expect(getSafeRedirectUrl('https://evil.com')).toBe('/');
      expect(getSafeRedirectUrl('http://attacker.com/cart')).toBe('/');
      expect(getSafeRedirectUrl('https://evil.com/login')).toBe('/');
    });

    it('1.4. Từ chối URL nguy hiểm (javascript:, data:)', () => {
      expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/');
      expect(getSafeRedirectUrl('data:text/html;base64,...')).toBe('/');
    });

    it('1.5. Từ chối URL chứa backslash (bypass qua /\\evil.com)', () => {
      expect(getSafeRedirectUrl('/\\evil.com')).toBe('/');
      expect(getSafeRedirectUrl('/path\\with\\backslash')).toBe('/');
    });

    it('1.6. Xử lý an toàn khi giá trị null, undefined hoặc chuỗi rỗng', () => {
      expect(getSafeRedirectUrl(null)).toBe('/');
      expect(getSafeRedirectUrl(undefined)).toBe('/');
      expect(getSafeRedirectUrl('')).toBe('/');
      expect(getSafeRedirectUrl('   ')).toBe('/');
      expect(getSafeRedirectUrl('', '/cart')).toBe('/cart');
    });
  });

  // 2. Kiểm tra validate form
  describe('Validate form nhập liệu', () => {
    it('2.1. validateEmail: hợp lệ và không hợp lệ', () => {
      expect(validateEmail('test@brewlite.vn').isValid).toBe(true);
      expect(validateEmail('user.name+tag@gmail.com').isValid).toBe(true);

      const emptyRes = validateEmail('');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toBe('Vui lòng nhập địa chỉ email');

      const invalidRes = validateEmail('not-an-email');
      expect(invalidRes.isValid).toBe(false);
      expect(invalidRes.error).toBe('Địa chỉ email không đúng định dạng');

      expect(validateEmail('test@').isValid).toBe(false);
      expect(validateEmail('@domain.com').isValid).toBe(false);
    });

    it('2.2. validatePassword: độ dài tối thiểu 6 ký tự', () => {
      expect(validatePassword('123456').isValid).toBe(true);
      expect(validatePassword('matkhau_manh_123').isValid).toBe(true);

      const emptyRes = validatePassword('');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toBe('Vui lòng nhập mật khẩu');

      const shortRes = validatePassword('12345');
      expect(shortRes.isValid).toBe(false);
      expect(shortRes.error).toBe('Mật khẩu phải có ít nhất 6 ký tự');
    });

    it('2.3. validateFullName: tối thiểu 2 ký tự', () => {
      expect(validateFullName('Nguyễn Văn A').isValid).toBe(true);
      expect(validateFullName('An').isValid).toBe(true);

      const emptyRes = validateFullName('');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toBe('Vui lòng nhập họ và tên');

      const shortRes = validateFullName('A');
      expect(shortRes.isValid).toBe(false);
      expect(shortRes.error).toBe('Họ và tên phải có ít nhất 2 ký tự');
    });

    it('2.4. validateConfirmPassword: phải trùng khớp với mật khẩu', () => {
      expect(validateConfirmPassword('secret123', 'secret123').isValid).toBe(true);

      const emptyRes = validateConfirmPassword('secret123', '');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toBe('Vui lòng nhập lại mật khẩu');

      const mismatchRes = validateConfirmPassword('secret123', 'secret456');
      expect(mismatchRes.isValid).toBe(false);
      expect(mismatchRes.error).toBe('Mật khẩu nhập lại không khớp');
    });
  });

  // 3. Kiểm tra lưu trữ token an toàn và đọc dữ liệu hỏng
  describe('Quản lý phiên đăng nhập trong localStorage', () => {
    const mockUser: AuthUser = {
      id: 'user-uuid-1',
      email: 'customer@brewlite.vn',
      fullName: 'Nguyễn Khách Hàng',
      role: 'CUSTOMER',
      loyaltyPoints: 100,
    };

    it('3.1. Lưu và nạp phiên đăng nhập hợp lệ', () => {
      saveAuthSession({ token: 'mock-jwt-token', user: mockUser });

      const loaded = loadAuthSession();
      expect(loaded).not.toBeNull();
      expect(loaded?.token).toBe('mock-jwt-token');
      expect(loaded?.user.email).toBe('customer@brewlite.vn');
      expect(loaded?.user.fullName).toBe('Nguyễn Khách Hàng');
      expect(loaded?.user.role).toBe('CUSTOMER');
    });

    it('3.2. Không làm sập ứng dụng và trả về null khi dữ liệu JSON bị hỏng', () => {
      localStorage.setItem(AUTH_STORAGE_KEY, 'invalid-json-{[(');
      expect(loadAuthSession()).toBeNull();
    });

    it('3.3. Trả về null khi cấu trúc dữ liệu thiếu token hoặc user', () => {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: '' }));
      expect(loadAuthSession()).toBeNull();

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'abc', user: null }));
      expect(loadAuthSession()).toBeNull();

      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: 'abc', user: { id: '1' } }) // thiếu email, fullName, role
      );
      expect(loadAuthSession()).toBeNull();
    });

    it('3.4. clearAuthSession xóa token auth nhưng giữ nguyên dữ liệu khác (như giỏ hàng)', () => {
      localStorage.setItem('brewlite_cart_v1', JSON.stringify([{ id: 'cart-1', name: 'Trà đào' }]));
      saveAuthSession({ token: 'mock-jwt-token', user: mockUser });

      clearAuthSession();

      expect(loadAuthSession()).toBeNull();
      // Giỏ hàng vẫn phải còn nguyên
      expect(localStorage.getItem('brewlite_cart_v1')).toContain('Trà đào');
    });
  });

  // 4. Trích xuất thông báo lỗi
  describe('extractErrorMessage', () => {
    it('4.1. Trích xuất đúng mảng lỗi từ NestJS ValidationPipe', () => {
      const nestJsError = {
        statusCode: 400,
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
      };
      expect(extractErrorMessage(nestJsError)).toBe('email must be an email, password is too short');
    });

    it('4.2. Trích xuất chuỗi message đơn lẻ hoặc chuỗi trực tiếp', () => {
      expect(extractErrorMessage({ message: 'Tài khoản đã bị khóa' })).toBe('Tài khoản đã bị khóa');
      expect(extractErrorMessage('Lỗi hệ thống')).toBe('Lỗi hệ thống');
      expect(extractErrorMessage(new Error('Lỗi timeout'))).toBe('Lỗi timeout');
    });

    it('4.3. Dùng thông báo fallback khi dữ liệu lỗi rỗng', () => {
      expect(extractErrorMessage(null, 'Lỗi mặc định')).toBe('Lỗi mặc định');
      expect(extractErrorMessage({})).toBe(AUTH_ERROR_MESSAGES.UNKNOWN_ERROR);
    });
  });
});

