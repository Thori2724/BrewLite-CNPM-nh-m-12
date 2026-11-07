import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildCreateOrderPayload,
  checkPendingOrderStatus,
  clearPendingOrder,
  generateIdempotencyKey,
  isPendingOrderExpired,
  loadPendingOrder,
  maskAccountNumber,
  PendingOrderRecord,
  PENDING_ORDER_STORAGE_KEY,
  resolveIdempotencyKey,
  savePendingOrder,
  validateAccountNumber,
  validateCustomerPhone,
} from '../utils/checkout';
import { CartItem } from '../utils/cart';

describe('Hàm thuần xử lý đơn hàng và thanh toán (utils/checkout.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // 1. Sinh Idempotency-Key chuẩn UUID v4
  describe('Hàm generateIdempotencyKey', () => {
    it('1.1. Sinh chuỗi đúng định dạng UUID v4', () => {
      const key = generateIdempotencyKey();
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(key).toMatch(uuidV4Regex);
    });

    it('1.2. Các lần sinh liên tiếp phải trả về giá trị khác nhau', () => {
      const key1 = generateIdempotencyKey();
      const key2 = generateIdempotencyKey();
      const key3 = generateIdempotencyKey();

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });
  });

  // 2. Chuyển đổi giỏ hàng sang payload gửi server (TUYỆT ĐỐI KHÔNG GỬI GIÁ)
  describe('Hàm buildCreateOrderPayload', () => {
    const mockCartItems: CartItem[] = [
      {
        id: 'cart-1',
        productId: 'prod-101',
        name: 'Trà sen vàng',
        image: 'https://example.com/tra.jpg',
        size: 'L',
        sugarLevel: '50%',
        iceLevel: 'NORMAL',
        toppings: [
          { id: 'top-1', name: 'Trân châu', price: 5000 },
          { id: 'top-2', name: 'Thạch', price: 5000 },
        ],
        note: 'ít ngọt',
        unitPrice: 45000, // Giá do client tính tạm
        quantity: 2,
      },
      {
        id: 'cart-2',
        productId: 'prod-102',
        name: 'Bánh sừng bò',
        image: 'https://example.com/banh.jpg',
        size: undefined,
        sugarLevel: undefined,
        iceLevel: undefined,
        toppings: [],
        note: '',
        unitPrice: 25000,
        quantity: 1,
      },
    ];

    it('2.1. Payload gửi lên server TUYỆT ĐỐI KHÔNG chứa giá (unitPrice, lineTotal)', () => {
      const payload = buildCreateOrderPayload(mockCartItems, 'TAKE_AWAY', {
        note: 'Giao nhanh giúp mình',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0901234567',
      });

      expect(payload.receiveType).toBe('TAKE_AWAY');
      expect(payload.customerName).toBe('Nguyễn Văn A');
      expect(payload.customerPhone).toBe('0901234567');
      expect(payload.note).toBe('Giao nhanh giúp mình');
      expect(payload.items).toHaveLength(2);

      // Kiểm tra món 1
      const item1 = payload.items[0];
      expect(item1.productId).toBe('prod-101');
      expect(item1.size).toBe('L');
      expect(item1.sugarLevel).toBe('50%');
      expect(item1.iceLevel).toBe('NORMAL');
      expect(item1.toppingIds).toEqual(['top-1', 'top-2']);
      expect(item1.quantity).toBe(2);
      expect(item1.note).toBe('ít ngọt');

      // TUYỆT ĐỐI KHÔNG CÓ GIÁ TIỀN
      expect((item1 as unknown as Record<string, unknown>).unitPrice).toBeUndefined();
      expect((item1 as unknown as Record<string, unknown>).lineTotal).toBeUndefined();
      expect((item1 as unknown as Record<string, unknown>).price).toBeUndefined();

      // Kiểm tra món 2 (bánh không có size/topping)
      const item2 = payload.items[1];
      expect(item2.productId).toBe('prod-102');
      expect(item2.quantity).toBe(1);
      expect(item2.toppingIds).toBeUndefined();
      expect((item2 as unknown as Record<string, unknown>).unitPrice).toBeUndefined();
    });
  });

  // 3. Che số tài khoản thẻ / ví
  describe('Hàm maskAccountNumber', () => {
    it('3.1. Che số thẻ/ví chỉ hiện 4 chữ số cuối', () => {
      expect(maskAccountNumber('9704123456789012')).toBe('•••• 9012');
      expect(maskAccountNumber('0901234567')).toBe('•••• 4567');
      expect(maskAccountNumber('9704 1234 5678 9012')).toBe('•••• 9012');
    });

    it('3.2. Chuỗi quá ngắn hoặc rỗng thì hiển thị an toàn', () => {
      expect(maskAccountNumber('')).toBe('••••');
      expect(maskAccountNumber('12')).toBe('••••');
    });
  });

  // 4. Validate số điện thoại và số thẻ/ví
  describe('Validate thông tin thanh toán & nhận hàng', () => {
    it('4.1. validateCustomerPhone: Kiểm tra định dạng số điện thoại Việt Nam', () => {
      expect(validateCustomerPhone('0901234567').isValid).toBe(true);
      expect(validateCustomerPhone('0389998888').isValid).toBe(true);
      expect(validateCustomerPhone('0771234567').isValid).toBe(true);

      expect(validateCustomerPhone('').isValid).toBe(false);
      expect(validateCustomerPhone('1234567890').isValid).toBe(false); // Không bắt đầu bằng 03,05,07,08,09
      expect(validateCustomerPhone('090123456').isValid).toBe(false); // Thiếu số (9 số)
      expect(validateCustomerPhone('09012345678').isValid).toBe(false); // Thừa số (11 số)
      expect(validateCustomerPhone('090123abcd').isValid).toBe(false); // Có chữ cái
    });

    it('4.2. validateAccountNumber: Kiểm tra số ví điện tử (10 chữ số)', () => {
      expect(validateAccountNumber('0901234567', 'E_WALLET').isValid).toBe(true);
      expect(validateAccountNumber('090 123 4567', 'E_WALLET').isValid).toBe(true);

      expect(validateAccountNumber('', 'E_WALLET').isValid).toBe(false);
      expect(validateAccountNumber('090123', 'E_WALLET').isValid).toBe(false);
      expect(validateAccountNumber('090123456789', 'E_WALLET').isValid).toBe(false);
      expect(validateAccountNumber('090123456a', 'E_WALLET').isValid).toBe(false);
    });

    it('4.3. validateAccountNumber: Kiểm tra số thẻ ngân hàng (16 chữ số)', () => {
      expect(validateAccountNumber('9704123456789012', 'BANK_CARD').isValid).toBe(true);
      expect(validateAccountNumber('9704 1234 5678 9012', 'BANK_CARD').isValid).toBe(true);
      expect(validateAccountNumber('9704-1234-5678-9012', 'BANK_CARD').isValid).toBe(true);

      expect(validateAccountNumber('', 'BANK_CARD').isValid).toBe(false);
      expect(validateAccountNumber('970412345678', 'BANK_CARD').isValid).toBe(false); // 12 số
      expect(validateAccountNumber('970412345678901234', 'BANK_CARD').isValid).toBe(false); // 18 số
      expect(validateAccountNumber('970412345678901a', 'BANK_CARD').isValid).toBe(false);
    });
  });

  // 5. Quản lý bản ghi đơn chờ thanh toán trong localStorage
  describe('Quản lý đơn chờ thanh toán (PendingOrderRecord)', () => {
    const validFutureOrder: PendingOrderRecord = {
      orderId: 'order-123',
      orderNumber: '#BL-1001',
      totalAmount: 95000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'key-uuid-1',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // Còn 10 phút
      createdAt: new Date().toISOString(),
      itemCount: 2,
    };

    it('5.1. Lưu và nạp đơn chờ thanh toán hợp lệ (TUYỆT ĐỐI không lưu số thẻ/ví)', () => {
      savePendingOrder(validFutureOrder);

      const loaded = loadPendingOrder();
      expect(loaded).not.toBeNull();
      expect(loaded?.orderId).toBe('order-123');
      expect(loaded?.orderNumber).toBe('#BL-1001');
      expect(loaded?.totalAmount).toBe(95000);
      expect(loaded?.idempotencyKey).toBe('key-uuid-1');

      // Kiểm tra trong raw localStorage đảm bảo không có trường số thẻ/ví
      const rawStored = localStorage.getItem(PENDING_ORDER_STORAGE_KEY) || '';
      expect(rawStored).not.toContain('accountNumber');
      expect(rawStored).not.toContain('cvv');
      expect(rawStored).not.toContain('cardNumber');
    });

    it('5.2. Đơn chờ đã quá hạn (expiresAt <= hiện tại): Tự động xóa và coi như không có đơn chờ', () => {
      const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // Quá hạn 5 phút trước
      const expiredOrder: PendingOrderRecord = {
        ...validFutureOrder,
        expiresAt: pastTime,
      };

      savePendingOrder(expiredOrder);

      // loadPendingOrder phát hiện hết hạn -> tự xóa và trả về null
      expect(isPendingOrderExpired(expiredOrder)).toBe(true);
      expect(loadPendingOrder()).toBeNull();
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });

    it('5.3. checkPendingOrderStatus: Báo cờ wasExpired = true khi đơn vừa quá hạn', () => {
      const pastTime = new Date(Date.now() - 60 * 1000).toISOString();
      const expiredOrder: PendingOrderRecord = {
        ...validFutureOrder,
        expiresAt: pastTime,
      };

      savePendingOrder(expiredOrder);

      const status = checkPendingOrderStatus();
      expect(status.pendingOrder).toBeNull();
      expect(status.wasExpired).toBe(true);
      // Đã được tự động dọn dẹp khỏi storage
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });

    it('5.5. clearPendingOrder xóa sạch dữ liệu đơn chờ trong storage', () => {
      savePendingOrder(validFutureOrder);
      expect(loadPendingOrder()).not.toBeNull();

      clearPendingOrder();
      expect(loadPendingOrder()).toBeNull();
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });
  });

  // 6. Quyết định giữ hay đổi Idempotency-Key (resolveIdempotencyKey)
  describe('Hàm quyết định Idempotency-Key (resolveIdempotencyKey)', () => {
    const existingKey = '88888888-4444-4333-8222-111111111111';

    it('6.1. Khi kết quả chưa rõ (isUncertainResult = true: timeout, mất mạng): BẮT BUỘC GIỮ NGUYÊN key', () => {
      const result = resolveIdempotencyKey({
        currentKey: existingKey,
        isUncertainResult: true,
      });

      expect(result.key).toBe(existingKey);
      expect(result.isNewKey).toBe(false);
    });

    it('6.2. Khi thông tin thanh toán thay đổi (hasPaymentInfoChanged = true): BẮT BUỘC ĐỔI SANG key MỚI', () => {
      const result = resolveIdempotencyKey({
        currentKey: existingKey,
        hasPaymentInfoChanged: true,
      });

      expect(result.key).not.toBe(existingKey);
      expect(result.isNewKey).toBe(true);
      expect(result.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('6.3. Khi bị từ chối rõ ràng (isPaymentRejectedClearly = true): BẮT BUỘC ĐỔI SANG key MỚI để thử lại', () => {
      const result = resolveIdempotencyKey({
        currentKey: existingKey,
        isPaymentRejectedClearly: true,
      });

      expect(result.key).not.toBe(existingKey);
      expect(result.isNewKey).toBe(true);
    });

    it('6.4. Khi chưa có key (currentKey rỗng hoặc chỉ có khoảng trắng): BẮT BUỘC SINH key MỚI', () => {
      const resultEmpty = resolveIdempotencyKey({ currentKey: '' });
      expect(resultEmpty.isNewKey).toBe(true);
      expect(resultEmpty.key).toBeDefined();

      const resultWhitespace = resolveIdempotencyKey({ currentKey: '   ' });
      expect(resultWhitespace.isNewKey).toBe(true);
      expect(resultWhitespace.key).toBeDefined();
    });

    it('6.5. Mặc định khi không có biến động bất thường: GIỮ NGUYÊN key', () => {
      const result = resolveIdempotencyKey({ currentKey: existingKey });
      expect(result.key).toBe(existingKey);
      expect(result.isNewKey).toBe(false);
    });
  });
});
