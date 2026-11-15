import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildCreateOrderPayload,
  clearPendingOrder,
  generateIdempotencyKey,
  loadPendingOrder,
  maskAccountNumber,
  PendingOrderRecord,
  PENDING_ORDER_STORAGE_KEY,
  resolveIdempotencyKey,
  savePendingOrder,
  validateAccountNumber,
} from '../utils/checkout';
import { CartItem } from '../utils/cart';

describe('Hàm thuần xử lý đơn hàng và thanh toán (utils/checkout.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // 1. Sinh Idempotency-Key chuẩn UUID v4
  describe('Hàm generateIdempotencyKey', () => {
    it('1.1. Sinh chuỗi đúng định dạng UUID v4 (8..100 ký tự)', () => {
      const key = generateIdempotencyKey();
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(key).toMatch(uuidV4Regex);
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(100);
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
        productId: '11111111-0000-0000-0000-000000000001',
        name: 'Trà sen vàng',
        imageUrl: 'https://example.com/tra.jpg',
        size: 'L',
        sugarLevel: 'P50',
        iceLevel: 'NORMAL',
        toppings: [
          { id: '44444444-0000-0000-0000-000000000001', name: 'Trân châu', price: 5000 },
          { id: '44444444-0000-0000-0000-000000000002', name: 'Thạch', price: 5000 },
        ],
        note: 'ít ngọt',
        unitPrice: 45000,
        quantity: 2,
      },
      {
        id: 'cart-2',
        productId: '11111111-0000-0000-0000-000000000002',
        name: 'Bánh sừng bò',
        imageUrl: 'https://example.com/banh.jpg',
        size: undefined,
        sugarLevel: undefined,
        iceLevel: undefined,
        toppings: [],
        note: '',
        unitPrice: 25000,
        quantity: 1,
      },
    ];

    it('2.1. Payload gửi lên server TUYỆT ĐỐI KHÔNG chứa giá, không có customerName/Phone; Món CAKE không gửi size/topping', () => {
      const payload = buildCreateOrderPayload(mockCartItems, 'TAKE_AWAY', {
        note: 'Giao nhanh giúp mình',
      });

      expect(payload.receiveType).toBe('TAKE_AWAY');
      expect(payload.note).toBe('Giao nhanh giúp mình');
      expect(payload.items).toHaveLength(2);

      // BỎ HẲN customerName và customerPhone
      expect((payload as unknown as Record<string, unknown>).customerName).toBeUndefined();
      expect((payload as unknown as Record<string, unknown>).customerPhone).toBeUndefined();

      // Kiểm tra món 1 (nước)
      const item1 = payload.items[0];
      expect(item1.productId).toBe('11111111-0000-0000-0000-000000000001');
      expect(item1.size).toBe('L');
      expect(item1.sugarLevel).toBe('P50');
      expect(item1.iceLevel).toBe('NORMAL');
      expect(item1.toppingIds).toEqual([
        '44444444-0000-0000-0000-000000000001',
        '44444444-0000-0000-0000-000000000002',
      ]);
      expect(item1.quantity).toBe(2);
      expect(item1.note).toBe('ít ngọt');

      // TUYỆT ĐỐI KHÔNG CÓ GIÁ TIỀN
      expect((item1 as unknown as Record<string, unknown>).unitPrice).toBeUndefined();
      expect((item1 as unknown as Record<string, unknown>).lineTotal).toBeUndefined();
      expect((item1 as unknown as Record<string, unknown>).price).toBeUndefined();

      // Kiểm tra món 2 (bánh không có size/đường/đá/topping: undefined, KHÔNG chuỗi hay mảng rỗng)
      const item2 = payload.items[1];
      expect(item2.productId).toBe('11111111-0000-0000-0000-000000000002');
      expect(item2.quantity).toBe(1);
      expect(item2.size).toBeUndefined();
      expect(item2.sugarLevel).toBeUndefined();
      expect(item2.iceLevel).toBeUndefined();
      expect(item2.toppingIds).toBeUndefined();
      expect(item2.note).toBeUndefined();
      expect((item2 as unknown as Record<string, unknown>).unitPrice).toBeUndefined();
    });
  });

  // 3. Che số tài khoản thẻ / ví
  describe('Hàm maskAccountNumber', () => {
    it('3.1. Che số thẻ/ví chỉ hiện 4 chữ số cuối', () => {
      expect(maskAccountNumber('9704123456789012')).toBe('•••• 9012');
      expect(maskAccountNumber('0901234567')).toBe('•••• 4567');
      expect(maskAccountNumber('9704 1234 5678 9012')).toBe('•••• 9012');
      expect(maskAccountNumber('12345678')).toBe('•••• 5678');
    });

    it('3.2. Chuỗi quá ngắn hoặc rỗng thì hiển thị an toàn', () => {
      expect(maskAccountNumber('')).toBe('••••');
      expect(maskAccountNumber('12')).toBe('••••');
    });
  });

  // 4. Validate số thẻ/ví (8..19 chữ số)
  describe('Validate số tài khoản thanh toán', () => {
    it('4.1. validateAccountNumber: Hợp lệ với 8 đến 19 chữ số cho cả WALLET và CARD', () => {
      expect(validateAccountNumber('12345678', 'WALLET').isValid).toBe(true);
      expect(validateAccountNumber('0901234567', 'WALLET').isValid).toBe(true);
      expect(validateAccountNumber('9704123456789012', 'CARD').isValid).toBe(true);
      expect(validateAccountNumber('9704 1234 5678 9012', 'CARD').isValid).toBe(true);
      expect(validateAccountNumber('1234567890123456789', 'CARD').isValid).toBe(true); // 19 số
    });

    it('4.2. validateAccountNumber: Không hợp lệ nếu rỗng, chứa chữ cái, ngắn hơn 8 số hoặc dài hơn 19 số', () => {
      expect(validateAccountNumber('', 'WALLET').isValid).toBe(false);
      expect(validateAccountNumber('1234567', 'WALLET').isValid).toBe(false); // 7 số
      expect(validateAccountNumber('12345678901234567890', 'CARD').isValid).toBe(false); // 20 số
      expect(validateAccountNumber('12345678a', 'WALLET').isValid).toBe(false); // Có chữ
      expect(validateAccountNumber('abcd-efgh', 'CARD').isValid).toBe(false);
    });
  });

  // 5. Quản lý bản ghi đơn chờ thanh toán trong localStorage (brewlite_pending_order_v2)
  describe('Quản lý đơn chờ thanh toán (PendingOrderRecord)', () => {
    const validPendingOrder: PendingOrderRecord = {
      orderId: 'order-123',
      orderNumber: 1001,
      totalAmount: 95000,
      receiveType: 'AT_COUNTER',
      idempotencyKey: 'key-uuid-1',
      createdAt: new Date().toISOString(),
      itemCount: 2,
    };

    it('5.1. Lưu và nạp đơn chờ thanh toán hợp lệ (TUYỆT ĐỐI không lưu số thẻ/ví, orderNumber là số)', () => {
      savePendingOrder(validPendingOrder);

      const loaded = loadPendingOrder();
      expect(loaded).not.toBeNull();
      expect(loaded?.orderId).toBe('order-123');
      expect(loaded?.orderNumber).toBe(1001);
      expect(typeof loaded?.orderNumber).toBe('number');
      expect(loaded?.totalAmount).toBe(95000);
      expect(loaded?.idempotencyKey).toBe('key-uuid-1');

      // Kiểm tra trong raw localStorage đảm bảo dùng v2 và không có trường nhạy cảm
      const rawStored = localStorage.getItem(PENDING_ORDER_STORAGE_KEY) || '';
      expect(rawStored).not.toContain('accountNumber');
      expect(rawStored).not.toContain('cvv');
      expect(rawStored).not.toContain('cardNumber');
      expect(rawStored).not.toContain('expiresAt');
    });

    it('5.2. clearPendingOrder xóa sạch dữ liệu đơn chờ trong storage', () => {
      savePendingOrder(validPendingOrder);
      expect(loadPendingOrder()).not.toBeNull();

      clearPendingOrder();
      expect(loadPendingOrder()).toBeNull();
      expect(localStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    });

    it('5.3. Tự động dọn dẹp key cũ brewlite_pending_order_v1 khi nạp đơn', () => {
      localStorage.setItem('brewlite_pending_order_v1', JSON.stringify({ old: true }));
      loadPendingOrder();
      expect(localStorage.getItem('brewlite_pending_order_v1')).toBeNull();
    });
  });

  // 6. Quyết định giữ hay đổi Idempotency-Key (resolveIdempotencyKey)
  describe('Hàm quyết định Idempotency-Key (resolveIdempotencyKey)', () => {
    const existingKey = '88888888-4444-4333-8222-111111111111';

    it('6.1. Khi kết quả chưa rõ (isUncertainResult = true: timeout, mất mạng, 5xx): BẮT BUỘC GIỮ NGUYÊN key', () => {
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
      expect(result.key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('6.3. Khi thanh toán thất bại rõ ràng (isPaymentFailed = true): BẮT BUỘC ĐỔI SANG key MỚI để thử lại', () => {
      const result = resolveIdempotencyKey({
        currentKey: existingKey,
        isPaymentFailed: true,
      });

      expect(result.key).not.toBe(existingKey);
      expect(result.isNewKey).toBe(true);
    });

    it('6.4. Khi chưa có key: BẮT BUỘC SINH key MỚI', () => {
      const resultEmpty = resolveIdempotencyKey({ currentKey: '' });
      expect(resultEmpty.isNewKey).toBe(true);
      expect(resultEmpty.key).toBeDefined();

      const resultWhitespace = resolveIdempotencyKey({ currentKey: '   ' });
      expect(resultWhitespace.isNewKey).toBe(true);
      expect(resultWhitespace.key).toBeDefined();
    });

    it('6.5. Mặc định: GIỮ NGUYÊN key', () => {
      const result = resolveIdempotencyKey({ currentKey: existingKey });
      expect(result.key).toBe(existingKey);
      expect(result.isNewKey).toBe(false);
    });
  });
});
