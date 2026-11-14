import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createOrderApi,
  getOrderByIdApi,
  OrderApiError,
  payOrderApi,
} from '../services/orders';
import {
  clearMockMemoryOnlyForTesting,
  MOCK_ORDERS_STORAGE_KEY,
  resetMockOrdersDatabase,
  setMockNetworkSimulation,
} from '../mocks/mock-orders';
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
          productId: '11111111-0000-0000-0000-000000000001', // Cà phê sữa đá (29.000đ)
          size: 'M', // +6.000đ -> 35.000đ
          sugarLevel: 'P50',
          iceLevel: 'NORMAL',
          quantity: 2, // 35.000 x 2 = 70.000đ
        },
      ],
      note: 'Mang đi giúp mình',
    };

    it('1.1. Tạo đơn thành công: Server tự tính tổng tiền, trạng thái ban đầu PENDING và orderNumber là số nguyên', async () => {
      const order = await createOrderApi(validDto);

      expect(order.id).toBeDefined();
      expect(typeof order.orderNumber).toBe('number');
      expect(order.orderNumber).toBeGreaterThanOrEqual(1001);
      expect(order.status).toBe('PENDING');
      expect(order.receiveType).toBe('AT_COUNTER');
      expect(order.totalAmount).toBe(70000); // (29.000 + 6.000) x 2
      expect(order.items).toHaveLength(1);
      expect(order.items[0].productName).toBe('Cà phê sữa đá');

      // TUYỆT ĐỐI không có expiresAt, customerName, customerPhone
      expect((order as unknown as Record<string, unknown>).expiresAt).toBeUndefined();
      expect((order as unknown as Record<string, unknown>).customerName).toBeUndefined();
      expect((order as unknown as Record<string, unknown>).customerPhone).toBeUndefined();
    });

    it('1.2. Hết hàng (409 Conflict): Server trả về lỗi kèm danh sách details món hết hàng', async () => {
      const outOfStockDto: CreateOrderDto = {
        receiveType: 'TAKE_AWAY',
        items: [
          {
            productId: '3', // Trà đào cam sả (trong mock có stock = 0)
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
        expect(orderErr.details).toBeDefined();
        expect(orderErr.details?.[0]).toEqual({ productId: '3', name: 'Trà đào cam sả' });
      }
    });

    it('1.3. Mô phỏng hết hàng qua ghi chú "hethang" trả về 409 kèm details', async () => {
      const noteOutOfStockDto: CreateOrderDto = {
        receiveType: 'AT_COUNTER',
        items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
        note: 'Giao hethang test',
      };

      try {
        await createOrderApi(noteOutOfStockDto);
        expect.unreachable('Phải ném lỗi 409');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.details).toBeDefined();
      }
    });
  });

  // 2. Thanh toán đơn hàng (payOrderApi) và kiểm soát Idempotency
  describe('Thanh toán và quy tắc Idempotency', () => {
    let createdOrderId = '';

    beforeEach(async () => {
      const order = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
      });
      createdOrderId = order.id;
    });

    it('2.1. Thanh toán thành công với số tài khoản hợp lệ (không kết thúc bằng 0000): Trả 201 status SUCCESS', async () => {
      const paymentDto: PaymentDto = {
        orderId: createdOrderId,
        method: 'WALLET',
        accountNumber: '12345678',
      };
      const key = 'idemp-key-success-1';

      const res = await payOrderApi(paymentDto, key);

      expect(res.status).toBe('SUCCESS');
      expect(res.order.status).toBe('PAID');
      expect(res.accountLast4).toBe('5678');
      expect(res.method).toBe('WALLET');

      // Kiểm tra đơn đã chuyển sang PAID
      const updatedOrder = await getOrderByIdApi(createdOrderId);
      expect(updatedOrder.status).toBe('PAID');
    });

    it('2.2. Thanh toán thất bại khi số tài khoản kết thúc bằng 0000: Trả 201 status FAILED (KHÔNG ném 402)', async () => {
      const paymentDto: PaymentDto = {
        orderId: createdOrderId,
        method: 'CARD',
        accountNumber: '9704000000000000', // Đuôi 0000 -> thất bại
      };
      const key = 'idemp-key-fail-1';

      // Không throw error, trả về đối tượng có status FAILED
      const res = await payOrderApi(paymentDto, key);

      expect(res.status).toBe('FAILED');
      expect(res.failureReason).toBe('Giao dịch bị từ chối (mô phỏng)');
      expect(res.order.status).toBe('PAYMENT_FAILED');

      // Đơn hàng ở trạng thái PAYMENT_FAILED (để khách có thể thử lại)
      const updatedOrder = await getOrderByIdApi(createdOrderId);
      expect(updatedOrder.status).toBe('PAYMENT_FAILED');
    });

    it('2.3. IDEMPOTENCY: Cùng key + cùng orderId luôn trả 200 với kết quả cũ, bất kể body thay đổi', async () => {
      const paymentDto: PaymentDto = {
        orderId: createdOrderId,
        method: 'WALLET',
        accountNumber: '12345678',
      };
      const sameKey = 'idemp-key-repeat-1';

      // Lần gửi 1
      const res1 = await payOrderApi(paymentDto, sameKey);

      // Lần gửi 2 cùng key và cùng orderId nhưng đổi số tài khoản khác
      const alteredDto: PaymentDto = {
        orderId: createdOrderId,
        method: 'WALLET',
        accountNumber: '88888888',
      };
      const res2 = await payOrderApi(alteredDto, sameKey);

      expect(res2.id).toBe(res1.id);
      expect(res2.accountLast4).toBe(res1.accountLast4);
      expect(res2.status).toBe('SUCCESS');
    });

    it('2.4. IDEMPOTENCY: Cùng key nhưng khác orderId thì trả lỗi 409 Conflict', async () => {
      const sameKey = 'idemp-key-conflict-orders';

      // Lần gửi 1 cho đơn 1
      await payOrderApi(
        { orderId: createdOrderId, method: 'WALLET', accountNumber: '12345678' },
        sameKey
      );

      // Tạo đơn thứ 2
      const order2 = await createOrderApi({
        receiveType: 'TAKE_AWAY',
        items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
      });

      // Lần gửi 2 cùng key nhưng dùng orderId của đơn thứ 2
      try {
        await payOrderApi(
          { orderId: order2.id, method: 'WALLET', accountNumber: '12345678' },
          sameKey
        );
        expect.unreachable('Phải ném lỗi 409 do trùng Idempotency-Key với đơn khác');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.message).toBe(ORDER_ERROR_MESSAGES.IDEMPOTENCY_MISMATCH);
      }
    });

    it('2.5. Sau thất bại (status FAILED), thử lại với key mới thì xử lý thành công', async () => {
      const keyFail = 'idemp-key-failed-first';
      const failedDto: PaymentDto = {
        orderId: createdOrderId,
        method: 'WALLET',
        accountNumber: '12340000', // Đuôi 0000 -> FAILED
      };

      // Lần 1: FAILED
      const resFail = await payOrderApi(failedDto, keyFail);
      expect(resFail.status).toBe('FAILED');

      // Lần 2: Sinh key mới sau thất bại, dùng số tài khoản mới hợp lệ
      const keyNew = 'idemp-key-retry-success-2';
      const validRetryDto: PaymentDto = {
        orderId: createdOrderId,
        method: 'WALLET',
        accountNumber: '12345678',
      };

      const resRetry = await payOrderApi(validRetryDto, keyNew);
      expect(resRetry.status).toBe('SUCCESS');
      expect(resRetry.order.status).toBe('PAID');
    });
  });

  // 3. Giả lập Timeout và Mất mạng
  describe('Giả lập sự cố mạng', () => {
    it('3.1. Giả lập timeout: Ném lỗi NETWORK_TIMEOUT', async () => {
      setMockNetworkSimulation('timeout');

      await expect(
        createOrderApi({
          receiveType: 'AT_COUNTER',
          items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
        })
      ).rejects.toThrow(ORDER_ERROR_MESSAGES.NETWORK_TIMEOUT);
    });

    it('3.2. Giả lập mất mạng: Ném lỗi NETWORK_ERROR', async () => {
      setMockNetworkSimulation('offline');

      await expect(
        createOrderApi({
          receiveType: 'AT_COUNTER',
          items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
        })
      ).rejects.toThrow(ORDER_ERROR_MESSAGES.NETWORK_ERROR);
    });
  });

  // 4. Lưu trữ Mock DB sống qua F5 và không trùng bộ đếm orderNumber
  describe('Lưu trữ Mock DB qua localStorage', () => {
    it('4.1. Mock giữ đơn sau khi tải lại: Tạo đơn, xóa bộ nhớ RAM, gọi API thì tự nạp từ localStorage và thanh toán thành công với CÙNG id đơn', async () => {
      // 1. Tạo đơn mới
      const order = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
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
        {
          orderId: order.id,
          method: 'WALLET',
          accountNumber: '12345678',
        },
        'idemp-key-survives-f5'
      );

      expect(payRes.orderId).toBe(order.id);
      expect(payRes.status).toBe('SUCCESS');
      expect(payRes.order.status).toBe('PAID');

      // 5. Kiểm tra localStorage: Trạng thái đơn đã được cập nhật thành PAID
      const updatedRaw = localStorage.getItem(MOCK_ORDERS_STORAGE_KEY);
      const updatedParsed = JSON.parse(updatedRaw!);
      expect(updatedParsed.orders[order.id].status).toBe('PAID');
    });

    it('4.2. Bộ đếm orderNumber lưu cùng mock DB để không bị trùng mã sau F5', async () => {
      // Tạo đơn 1 -> orderNumber 1001
      const order1 = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
      });

      // F5 (xóa RAM)
      clearMockMemoryOnlyForTesting();

      // Tạo đơn 2 sau F5 -> orderNumber phải tiếp tục là 1002, KHÔNG bị trùng lại 1001
      const order2 = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
      });

      expect(order1.orderNumber).toBe(1001);
      expect(order2.orderNumber).toBe(1002);
      expect(order2.orderNumber).toBeGreaterThan(order1.orderNumber);
    });
  });

  // 5. Khi cờ NEXT_PUBLIC_USE_MOCK_ORDERS=false: Gọi fetch thật
  describe('Gọi fetch thật khi cờ mock tắt (NEXT_PUBLIC_USE_MOCK_ORDERS=false)', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('5.1. createOrderApi gọi đúng POST /orders, đúng body không có giá', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'server-order-1',
          orderNumber: 2001,
          status: 'PENDING',
          receiveType: 'AT_COUNTER',
          totalAmount: 50000,
          items: [],
          createdAt: new Date().toISOString(),
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await createOrderApi({
        receiveType: 'AT_COUNTER',
        items: [{ productId: 'p1', quantity: 2, size: 'M' }],
        note: 'Giao nhanh',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/orders');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.receiveType).toBe('AT_COUNTER');
      expect(body.items[0].productId).toBe('p1');
      expect(body.items[0].quantity).toBe(2);
      expect(body.items[0].unitPrice).toBeUndefined();
      expect(body.customerName).toBeUndefined();
      expect(body.customerPhone).toBeUndefined();

      expect(res.orderNumber).toBe(2001);
    });

    it('5.2. payOrderApi gọi đúng POST /payments với header Idempotency-Key và body chuẩn', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'pay-server-1',
          orderId: 'server-order-1',
          method: 'WALLET',
          accountLast4: '5678',
          amount: 50000,
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
          order: {
            id: 'server-order-1',
            orderNumber: 2001,
            status: 'PAID',
          },
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await payOrderApi(
        { orderId: 'server-order-1', method: 'WALLET', accountNumber: '12345678' },
        'test-idemp-key-100'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/payments');
      expect(options.method).toBe('POST');

      const headers = options.headers instanceof Headers
        ? options.headers
        : new Headers(options.headers || {});
      expect(headers.get('Idempotency-Key')).toBe('test-idemp-key-100');

      const body = JSON.parse(options.body);
      expect(body.orderId).toBe('server-order-1');
      expect(body.method).toBe('WALLET');
      expect(body.accountNumber).toBe('12345678');

      expect(res.status).toBe('SUCCESS');
    });

    it('5.3. getOrderByIdApi gọi đúng GET /orders/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'server-order-1',
          orderNumber: 2001,
          status: 'PAID',
          receiveType: 'AT_COUNTER',
          totalAmount: 50000,
          items: [],
          createdAt: new Date().toISOString(),
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await getOrderByIdApi('server-order-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/orders/server-order-1');
      expect(options.method).toBe('GET');
      expect(res.status).toBe('PAID');
    });

    it('5.4. createOrderApi nhận 409 từ server thật: giữ nguyên message tiếng Việt và mảng details của server', async () => {
      const server409Body = {
        statusCode: 409,
        message: "Sản phẩm 'Bạc xỉu' không đủ số lượng trong kho",
        error: 'Conflict',
        details: [
          {
            productId: '11111111-0000-0000-0000-000000000003',
            name: 'Bạc xỉu',
            available: 0,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => server409Body,
      });

      try {
        await createOrderApi({
          receiveType: 'AT_COUNTER',
          items: [{ productId: '11111111-0000-0000-0000-000000000003', quantity: 1 }],
        });
        expect.unreachable('Phải ném lỗi 409');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.message).toBe("Sản phẩm 'Bạc xỉu' không đủ số lượng trong kho");
        expect(orderErr.details).toEqual(server409Body.details);
      }
    });
  });
});
