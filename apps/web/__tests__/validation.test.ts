import { describe, it, expect } from 'vitest';
import {
  classifyApiError,
  formatVnd,
  validateAccountNumber,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validateLoginPassword,
  validateNote,
  validateOrderCart,
  validatePassword,
  validatePaymentMethod,
  validateQuantity,
  validateReceiveType,
  validateToppings,
} from '../utils/validation';
import { AUTH_ERROR_MESSAGES } from '../services/auth-contract';
import { ORDER_ERROR_MESSAGES } from '../services/order-contract';
import { CartItem } from '../utils/cart';

describe('Bộ hàm validate dùng chung và phân loại lỗi API (utils/validation.ts)', () => {
  describe('1. Định dạng tiền tệ formatVnd', () => {
    it('Hiển thị số nguyên VND có dấu chấm ngăn nghìn và viết liền chữ đ ("29.000đ")', () => {
      expect(formatVnd(29000)).toBe('29.000đ');
      expect(formatVnd(136000)).toBe('136.000đ');
      expect(formatVnd(1250000)).toBe('1.250.000đ');
      expect(formatVnd(0)).toBe('0đ');
    });
  });

  describe('2. Validate Đăng ký & Đăng nhập (email, password, displayName)', () => {
    it('validateEmail: cắt khoảng trắng đầu cuối, kiểm tra bắt buộc và đúng định dạng', () => {
      expect(validateEmail('  nguyenan@gmail.com  ').isValid).toBe(true);
      expect(validateEmail('').isValid).toBe(false);
      expect(validateEmail('   ').isValid).toBe(false);
      expect(validateEmail('sai-dinh-dang').isValid).toBe(false);
      expect(validateEmail('missing@domain').isValid).toBe(false);
    });

    it('validatePassword (Đăng ký): bắt buộc và tối thiểu 6 ký tự', () => {
      expect(validatePassword('').isValid).toBe(false);
      expect(validatePassword('12345').isValid).toBe(false);
      expect(validatePassword('123456').isValid).toBe(true);
    });

    it('validateLoginPassword (Đăng nhập): chỉ bắt buộc nhập, không chặn mật khẩu ngắn', () => {
      expect(validateLoginPassword('').isValid).toBe(false);
      expect(validateLoginPassword('123').isValid).toBe(true);
    });

    it('validateDisplayName: bắt buộc 1..50 ký tự sau khi trim, từ chối chuỗi toàn dấu cách', () => {
      expect(validateDisplayName('').isValid).toBe(false);
      expect(validateDisplayName('     ').isValid).toBe(false);
      expect(validateDisplayName('  An  ').isValid).toBe(true);
      expect(validateDisplayName('A'.repeat(50)).isValid).toBe(true);
      expect(validateDisplayName('A'.repeat(51)).isValid).toBe(false);
    });

    it('validateConfirmPassword: bắt buộc và khớp mật khẩu gốc', () => {
      expect(validateConfirmPassword('123456', '').isValid).toBe(false);
      expect(validateConfirmPassword('123456', '654321').isValid).toBe(false);
      expect(validateConfirmPassword('123456', '123456').isValid).toBe(true);
    });
  });

  describe('3. Validate Đặt đơn (ghi chú, số lượng, topping, giỏ hàng)', () => {
    it('validateNote: cho phép rỗng hoặc tối đa 200 ký tự, vượt 200 ký tự báo lỗi tiếng Việt', () => {
      expect(validateNote('').isValid).toBe(true);
      expect(validateNote('Ít đá, nhiều sữa').isValid).toBe(true);
      expect(validateNote('a'.repeat(200)).isValid).toBe(true);

      const over = validateNote('a'.repeat(201));
      expect(over.isValid).toBe(false);
      expect(over.error).toContain('200 ký tự');
    });

    it('validateQuantity: bắt buộc là số nguyên từ 1 đến 10', () => {
      expect(validateQuantity(1).isValid).toBe(true);
      expect(validateQuantity(10).isValid).toBe(true);
      expect(validateQuantity(0).isValid).toBe(false);
      expect(validateQuantity(11).isValid).toBe(false);
      expect(validateQuantity(1.5).isValid).toBe(false);
    });

    it('validateToppings: tối đa 3 topping và không trùng nhau', () => {
      expect(validateToppings([]).isValid).toBe(true);
      expect(validateToppings(['t1', 't2', 't3']).isValid).toBe(true);
      expect(validateToppings(['t1', 't2', 't3', 't4']).isValid).toBe(false);
      expect(validateToppings(['t1', 't1']).isValid).toBe(false);
    });

    it('validateReceiveType & validatePaymentMethod: chỉ chấp nhận enum hợp đồng', () => {
      expect(validateReceiveType('AT_COUNTER').isValid).toBe(true);
      expect(validateReceiveType('TAKE_AWAY').isValid).toBe(true);
      expect(validateReceiveType('DELIVERY').isValid).toBe(false);

      expect(validatePaymentMethod('WALLET').isValid).toBe(true);
      expect(validatePaymentMethod('CARD').isValid).toBe(true);
      expect(validatePaymentMethod('CASH').isValid).toBe(false);
    });

    it('validateOrderCart: kiểm tra giỏ từ 1..20 dòng, ghi chú và từng dòng hợp lệ', () => {
      const sampleItem: CartItem = {
        id: 'line-1',
        productId: 'prod-1',
        name: 'Cà phê sữa đá',
        imageUrl: 'https://example.com/img.jpg',
        size: 'M',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        toppings: [{ id: 'top-1', name: 'Trân châu', price: 5000 }],
        note: 'Ít đá',
        unitPrice: 35000,
        quantity: 2,
      };

      expect(validateOrderCart([], 'AT_COUNTER').isValid).toBe(false);
      expect(validateOrderCart([sampleItem], 'AT_COUNTER', 'Ghi chú hợp lệ').isValid).toBe(true);
      expect(validateOrderCart([sampleItem], 'AT_COUNTER', 'x'.repeat(201)).isValid).toBe(false);
    });
  });

  describe('4. Validate Số tài khoản thanh toán (8 đến 19 chữ số)', () => {
    it('Chấp nhận chuỗi chỉ gồm chữ số từ 8 đến 19 ký tự (cho phép dán có dấu cách)', () => {
      expect(validateAccountNumber('12345678').isValid).toBe(true); // 8 chữ số
      expect(validateAccountNumber('1234567890123456789').isValid).toBe(true); // 19 chữ số
      expect(validateAccountNumber('9704 1234 5678 0000').isValid).toBe(true); // Dán có dấu cách
    });

    it('Báo lỗi khi rỗng, chứa chữ/ký tự đặc biệt, hoặc dài 7 hay 20 chữ số', () => {
      expect(validateAccountNumber('').isValid).toBe(false);
      expect(validateAccountNumber('1234567').isValid).toBe(false); // 7 chữ số
      expect(validateAccountNumber('12345678901234567890').isValid).toBe(false); // 20 chữ số
      expect(validateAccountNumber('1234567a').isValid).toBe(false); // Chứa chữ
      expect(validateAccountNumber('1234-5678').isValid).toBe(false); // Chứa dấu gạch ngang
      expect(validateAccountNumber('12345678@').isValid).toBe(false); // Ký tự đặc biệt
    });
  });

  describe('5. Hàm đọc và phân loại lỗi API dùng chung (classifyApiError)', () => {
    it('5.1. Phân loại lỗi 400 validation (message là mảng tiếng Anh): trả câu tiếng Việt chung và gắn fieldErrors', () => {
      const apiErr = {
        statusCode: 400,
        message: [
          'email must be an email',
          'password must be longer than or equal to 6 characters',
          'displayName should not be empty',
        ],
        error: 'Bad Request',
      };

      const classified = classifyApiError(apiErr);
      expect(classified.kind).toBe('validation');
      expect(classified.statusCode).toBe(400);
      expect(classified.message).toBe(AUTH_ERROR_MESSAGES.VALIDATION_ERROR);
      expect(classified.fieldErrors.email).toBe('Địa chỉ email không đúng định dạng');
      expect(classified.fieldErrors.password).toBe('Mật khẩu phải có ít nhất 6 ký tự');
      expect(classified.fieldErrors.displayName).toBe('Tên hiển thị phải từ 1 đến 50 ký tự');
    });

    it('5.2. Phân loại lỗi 409 hết hàng (có details): giữ nguyên message và danh sách details', () => {
      const stockErr = {
        statusCode: 409,
        message: "Sản phẩm 'Bạc xỉu' không đủ số lượng trong kho",
        details: [
          {
            productId: '11111111-0000-0000-0000-000000000003',
            name: 'Bạc xỉu',
            available: 0,
          },
        ],
      };

      const classified = classifyApiError(stockErr);
      expect(classified.kind).toBe('out_of_stock');
      expect(classified.statusCode).toBe(409);
      expect(classified.message).toBe("Sản phẩm 'Bạc xỉu' không đủ số lượng trong kho");
      expect(classified.details).toHaveLength(1);
      expect(classified.details?.[0].name).toBe('Bạc xỉu');
      expect(classified.details?.[0].available).toBe(0);
    });

    it('5.3. Phân loại lỗi 409 trùng email: gắn vào fieldErrors.email', () => {
      const conflictErr = {
        statusCode: 409,
        message: 'Email này đã được sử dụng',
      };

      const classified = classifyApiError(conflictErr);
      expect(classified.kind).toBe('conflict');
      expect(classified.statusCode).toBe(409);
      expect(classified.message).toBe('Email này đã được sử dụng');
      expect(classified.fieldErrors.email).toBe('Email này đã được sử dụng');
    });

    it('5.4. Phân loại lỗi 401 và lỗi mạng / 5xx', () => {
      const unauth = classifyApiError({
        statusCode: 401,
        message: 'Email hoặc mật khẩu không chính xác',
      });
      expect(unauth.kind).toBe('unauthorized');
      expect(unauth.message).toBe('Email hoặc mật khẩu không chính xác');

      const serverErr = classifyApiError({
        statusCode: 500,
        message: 'Internal Server Error',
      });
      expect(serverErr.kind).toBe('network');
      expect(serverErr.message).toBe('Không kết nối được máy chủ, vui lòng thử lại');

      const netErr = classifyApiError(new TypeError('Failed to fetch'));
      expect(netErr.kind).toBe('network');
      expect(netErr.message).toBe('Không kết nối được máy chủ, vui lòng thử lại');
      expect(ORDER_ERROR_MESSAGES.OUT_OF_STOCK).toBeDefined();
    });
  });
});

