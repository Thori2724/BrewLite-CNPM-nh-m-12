import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearMockMemoryOnlyForTesting,
  createOrderApi,
  getOrderByIdApi,
  MOCK_ORDERS_STORAGE_KEY,
  OrderApiError,
  payOrderApi,
  resetMockOrdersDatabase,
  setMockNetworkSimulation,
} from '../services/orders';
import {
  CreateOrderDto,
  ORDER_ERROR_MESSAGES,
  PaymentDto,
} from '../services/order-contract';

describe('Lớp gọi API Đơn hàng và Thanh toán (services/orders.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetMockOrdersDatabase();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK_ORDERS = 'true';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // 1. Tạo đơn hàng (createOrderApi)
  describe('Tạo đơn hàng (createOrderApi)', () => {
    const validDto: CreateOrderDto = {
      receiveType: 'AT_COUNTER',
      items: [
        {
          productId: '1', // Cà phê sữa đá (29.000đ)
          size: 'M', // +5.000đ -> 34.000đ
          sugarLevel: '50%',
          iceLevel: 'NORMAL',
          quantity: 2, // 34.000 x 2 = 68.000đ
        },
      ],
      customerName: 'Nguyễn Văn A',
      customerPhone: '0901234567',
    };

    it('1.1. Tạo đơn thành công: Server tự tính tổng tiền, trạng thái ban đầu PENDING và có hạn 15 phút', async () => {
      const order = await createOrderApi(validDto);

      expect(order.id).toBeDefined();
      expect(order.orderNumber).toMatch(/^#BL-\d+$/);
      expect(order.status).toBe('PENDING');
      expect(order.receiveType).toBe('AT_COUNTER');
      expect(order.totalAmount).toBe(68000); // 34.000 x 2
      expect(order.items).toHaveLength(1);
      expect(order.items[0].productName).toBe('Cà phê sữa đá');

      // Hạn thanh toán sau 15 phút
      const expiry = new Date(order.expiresAt).getTime();
      const created = new Date(order.createdAt).getTime();
      expect(expiry - created).toBe(15 * 60 * 1000);
    });

    it('1.2. Hết hàng (409 Conflict): Server trả về lỗi kèm danh sách món hết hàng outOfStockItems', async () => {
      const outOfStockDto: CreateOrderDto = {
        receiveType: 'TAKE_AWAY',
        items: [
          {
            productId: '3', // Trà đào cam sả (trong MOCK_PRODUCTS isAvailable: false)
            quantity: 1,
          },
        ],
      };

      try {
        await createOrderApi(outOfStockDto);
        expect.unreachable('Phải ném lỗi 409');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.message).toBe(ORDER_ERROR_MESSAGES.OUT_OF_STOCK);
        expect(orderErr.outOfStockItems).toContain('Trà đào cam sả');
      }
    });
  });

  // 2. Thanh toán đơn hàng (payOrderApi) và kiểm soát Idempotency
  describe('Thanh toán và quy tắc Idempotency', () => {
    let createdOrderId = '';

    beforeEach(async () => {
      const order = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: '1', quantity: 1 }],
      });
      createdOrderId = order.id;
    });

    it('2.1. Thanh toán thành công với số tài khoản hợp lệ (không kết thúc bằng 0)', async () => {
      const paymentDto: PaymentDto = {
        method: 'E_WALLET',
        accountNumber: '0901234567',
      };
      const key = 'idemp-key-success-1';

      const res = await payOrderApi(createdOrderId, paymentDto, key);

      expect(res.status).toBe('SUCCESS');
      expect(res.orderStatus).toBe('PAID');
      expect(res.idempotencyKey).toBe(key);
      expect(res.gatewayRef).toBeDefined();

      // Kiểm tra đơn đã chuyển sang PAID
      const updatedOrder = await getOrderByIdApi(createdOrderId);
      expect(updatedOrder.status).toBe('PAID');
    });

    it('2.2. Thanh toán thất bại khi số tài khoản kết thúc bằng 0: Đơn chuyển PAYMENT_FAILED', async () => {
      const paymentDto: PaymentDto = {
        method: 'BANK_CARD',
        accountNumber: '9704000000000000', // Đuôi 0 -> giả lập bị từ chối
      };
      const key = 'idemp-key-fail-1';

      await expect(payOrderApi(createdOrderId, paymentDto, key)).rejects.toThrow(
        ORDER_ERROR_MESSAGES.PAYMENT_REJECTED
      );

      // Đơn hàng vẫn được lưu giữ và ở trạng thái PAYMENT_FAILED (để khách có thể thử lại)
      const updatedOrder = await getOrderByIdApi(createdOrderId);
      expect(updatedOrder.status).toBe('PAYMENT_FAILED');
    });

    it('2.3. IDEMPOTENCY: Cùng key gửi lại thì trả đúng kết quả cũ, không tạo thanh toán mới', async () => {
      const paymentDto: PaymentDto = {
        method: 'E_WALLET',
        accountNumber: '0901234567',
      };
      const sameKey = 'idemp-key-repeat-1';

      // Lần gửi 1
      const res1 = await payOrderApi(createdOrderId, paymentDto, sameKey);

      // Lần gửi 2 (giả lập bấm đúp hoặc F5 gửi lại cùng key)
      const res2 = await payOrderApi(createdOrderId, paymentDto, sameKey);

      expect(res2.id).toBe(res1.id);
      expect(res2.idempotencyKey).toBe(sameKey);
      expect(res2.gatewayRef).toBe(res1.gatewayRef);
      expect(res2.status).toBe('SUCCESS');
    });

    it('2.4. IDEMPOTENCY: Cùng key nhưng body thanh toán khác (đổi số tài khoản) thì trả lỗi 409 Mismatch và không trừ tiền lần 2', async () => {
      const initialDto: PaymentDto = {
        method: 'E_WALLET',
        accountNumber: '0901234567',
      };
      const sameKey = 'idemp-key-mismatch-test';

      // Lần gửi 1 thành công
      await payOrderApi(createdOrderId, initialDto, sameKey);

      // Lần gửi 2 cùng key nhưng đổi số tài khoản khác
      const alteredDto: PaymentDto = {
        method: 'E_WALLET',
        accountNumber: '0908888888',
      };

      try {
        await payOrderApi(createdOrderId, alteredDto, sameKey);
        expect.unreachable('Phải ném lỗi 409 Mismatch');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.message).toBe(ORDER_ERROR_MESSAGES.IDEMPOTENCY_MISMATCH);
      }
    });

    it('2.5. IDEMPOTENCY: Sau thất bại rõ ràng (PAYMENT_FAILED), thử lại với key mới thì xử lý độc lập và thành công', async () => {
      const keyFail = 'idemp-key-rejected-1';
      const failedDto: PaymentDto = {
        method: 'E_WALLET',
        accountNumber: '0901234560', // Đuôi 0 -> giả lập bị từ chối rõ ràng
      };

      // Lần 1: Bị từ chối
      await expect(payOrderApi(createdOrderId, failedDto, keyFail)).rejects.toThrow(
        ORDER_ERROR_MESSAGES.PAYMENT_REJECTED
      );

      // Lần 2: Sinh key mới sau thất bại rõ ràng, dùng số tài khoản mới hợp lệ
      const keyNew = 'idemp-key-retry-success-2';
      const validRetryDto: PaymentDto = {
        method: 'E_WALLET',
        accountNumber: '0901234567',
      };

      const resRetry = await payOrderApi(createdOrderId, validRetryDto, keyNew);
      expect(resRetry.status).toBe('SUCCESS');
      expect(resRetry.orderStatus).toBe('PAID');
      expect(resRetry.idempotencyKey).toBe(keyNew);
    });
  });

  // 3. Giả lập Timeout và Mất mạng
  describe('Giả lập sự cố mạng', () => {
    it('3.1. Giả lập timeout: Ném lỗi NETWORK_TIMEOUT', async () => {
      setMockNetworkSimulation('timeout');

      await expect(
        createOrderApi({
          receiveType: 'AT_COUNTER',
          items: [{ productId: '1', quantity: 1 }],
        })
      ).rejects.toThrow(ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
    });

    it('3.2. Giả lập mất mạng: Ném lỗi NETWORK_ERROR', async () => {
      setMockNetworkSimulation('offline');

      await expect(
        createOrderApi({
          receiveType: 'AT_COUNTER',
          items: [{ productId: '1', quantity: 1 }],
        })
      ).rejects.toThrow(ORDER_ERROR_MESSAGES.NETWORK_ERROR);
    });
  });

  // 4. Lưu trữ Mock DB sống qua F5 (Mô phỏng F5 bằng cách xóa bộ nhớ RAM nhưng giữ localStorage)
  describe('Lưu trữ Mock DB qua localStorage', () => {
    it('4.1. Mock giữ đơn sau khi tải lại: Tạo đơn, xóa bộ nhớ RAM, gọi API thì tự nạp từ localStorage và thanh toán thành công với CÙNG id đơn', async () => {
      // 1. Tạo đơn mới
      const order = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: '1', quantity: 1 }],
        customerPhone: '0901234567',
      });

      expect(order.id).toBeDefined();
      const storedRaw = localStorage.getItem(MOCK_ORDERS_STORAGE_KEY);
      expect(storedRaw).not.toBeNull();
      const parsedStored = JSON.parse(storedRaw!);
      expect(parsedStored.orders[order.id]).toBeDefined();

      // 2. Giả lập F5: XÓA SẠCH BỘ NHỚ RAM CỦA MOCK
      clearMockMemoryOnlyForTesting();

      // 3. Tra cứu lại đơn: Phải tự động nạp từ localStorage
      const reloadedOrder = await getOrderByIdApi(order.id);
      expect(reloadedOrder.id).toBe(order.id);
      expect(reloadedOrder.orderNumber).toBe(order.orderNumber);
      expect(reloadedOrder.status).toBe('PENDING');

      // 4. Tiến hành thanh toán tiếp: Vẫn tìm thấy đơn và thanh toán thành công với CÙNG id đơn
      const payRes = await payOrderApi(
        order.id,
        {
          method: 'E_WALLET',
          accountNumber: '0901234567',
        },
        'idemp-key-survives-f5'
      );

      expect(payRes.orderId).toBe(order.id);
      expect(payRes.status).toBe('SUCCESS');
      expect(payRes.orderStatus).toBe('PAID');

      // 5. Kiểm tra localStorage: Trạng thái đơn đã được cập nhật thành PAID
      const updatedRaw = localStorage.getItem(MOCK_ORDERS_STORAGE_KEY);
      const updatedParsed = JSON.parse(updatedRaw!);
      expect(updatedParsed.orders[order.id].status).toBe('PAID');
    });

    it('4.2. Tự dọn các bản ghi mock quá 15 phút: bản ghi quá hạn không được nạp lại', async () => {
      // Giả lập lưu đơn mock đã quá hạn 20 phút trước vào localStorage
      const expiredMockData = {
        orders: {
          'order-expired-1': {
            id: 'order-expired-1',
            orderNumber: '#BL-EXPIRED',
            status: 'PENDING',
            receiveType: 'AT_COUNTER',
            totalAmount: 50000,
            expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
            items: [],
          },
        },
        payments: {},
        payloads: {},
      };
      localStorage.setItem(MOCK_ORDERS_STORAGE_KEY, JSON.stringify(expiredMockData));
      clearMockMemoryOnlyForTesting();

      // Khi tra cứu đơn quá hạn -> không tìm thấy (404) vì đã bị dọn
      await expect(getOrderByIdApi('order-expired-1')).rejects.toThrow('Không tìm thấy đơn hàng');
    });
  });
});

