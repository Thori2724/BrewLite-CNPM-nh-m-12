import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProductApi,
  PAYMENT_METHOD_LABELS as API_PAYMENT_METHOD_LABELS,
  updateProductAvailabilityApi,
} from '../services/api';
import { ApiHttpError, resetRedirectFlag } from '../services/auth';
import {
  getMyLoyaltyApi,
  LOYALTY_TYPE_LABELS,
} from '../services/loyalty';
import { PAYMENT_METHOD_LABELS } from '../services/order-contract';
import {
  cancelOrderApi,
  createOrderApi,
  OrderApiError,
  payOrderApi,
  updateOrderStatusApi,
} from '../services/orders';
import {
  createPromotionApi,
  getPromotionStatusLabel,
  getPromotionsApi,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TYPE_LABELS,
  updatePromotionApi,
  validatePromotionApi,
} from '../services/promotions';
import { saveAuthSession } from '../utils/auth';
import { buildCreateOrderPayload } from '../utils/checkout';
import {
  isMockLoyaltyActive,
  isMockPromotionsActive,
  resetMockLoyaltyDatabase,
  resetMockOrdersDatabase,
  resetMockProductsDatabase,
  resetMockPromotionsDatabase,
} from '../mocks';

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

describe('Dòng 14 - Hợp đồng API bản 3 (Khuyến mãi, Điểm thưởng, Tồn kho, Nhãn)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockProductsDatabase();
    resetMockOrdersDatabase();
    resetMockPromotionsDatabase();
    resetMockLoyaltyDatabase();

    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.NEXT_PUBLIC_USE_MOCK_PROMOTIONS;
    delete process.env.NEXT_PUBLIC_USE_MOCK_LOYALTY;
    delete process.env.NEXT_PUBLIC_USE_MOCK_ORDERS;
    delete process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe('1. Bảng nhãn tiếng Việt bản 3 (mục 9.3)', () => {
    it('Đầy đủ nhãn thanh toán, loại điểm, loại mã giảm giá và trạng thái mã', () => {
      expect(PAYMENT_METHOD_LABELS).toEqual({
        WALLET: 'Ví điện tử (ZaloPay/Momo)',
        CARD: 'Chuyển khoản ngân hàng',
      });
      expect(API_PAYMENT_METHOD_LABELS).toEqual({
        WALLET: 'Ví điện tử (ZaloPay/Momo)',
        CARD: 'Chuyển khoản ngân hàng',
      });
      expect(LOYALTY_TYPE_LABELS).toEqual({
        EARN: 'Tích điểm',
        REDEEM: 'Dùng điểm',
        REFUND: 'Hoàn điểm',
        REVOKE: 'Thu hồi điểm',
      });
      expect(PROMOTION_TYPE_LABELS).toEqual({
        PERCENT: 'Giảm theo %',
        FIXED: 'Giảm số tiền',
      });
      expect(PROMOTION_STATUS_LABELS).toEqual({
        ACTIVE: 'Đang bật',
        INACTIVE: 'Đã tắt',
      });
      expect(getPromotionStatusLabel(true)).toBe('Đang bật');
      expect(getPromotionStatusLabel(false)).toBe('Đã tắt');
    });
  });

  describe('2. Gọi API thật đọc NEXT_PUBLIC_API_URL & gửi đúng payload bản 3', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_USE_MOCK = 'false';
      process.env.NEXT_PUBLIC_API_URL = 'https://api.brewlite.example.com';
      saveAuthSession({
        token: 'jwt-v3-token',
        user: {
          id: '44444444-0000-0000-0000-000000000001',
          email: 'khach@example.com',
          displayName: 'Khách demo',
          role: 'CUSTOMER',
        },
      });
    });

    it('Gọi đúng 5 endpoint mới (/promotions/validate, /promotions, /promotions/:id, /loyalty/me)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, {}));
      globalThis.fetch = fetchMock;

      await validatePromotionApi({ code: 'BREW10', subtotal: 100000 });
      await getPromotionsApi();
      await createPromotionApi({
        code: 'SUMMER15',
        type: 'PERCENT',
        value: 15,
        maxDiscount: 20000,
      });
      await updatePromotionApi('promo-1', { isActive: false });
      await getMyLoyaltyApi();

      expect(fetchMock).toHaveBeenCalledTimes(5);

      const calls = fetchMock.mock.calls.map(([url, init]) => ({
        url: String(url),
        method: init?.method,
        headers: init?.headers as Headers,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }));

      expect(calls[0].url).toBe('https://api.brewlite.example.com/promotions/validate');
      expect(calls[0].method).toBe('POST');
      expect(calls[0].body).toEqual({ code: 'BREW10', subtotal: 100000 });

      expect(calls[1].url).toBe('https://api.brewlite.example.com/promotions');
      expect(calls[1].method).toBe('GET');

      expect(calls[2].url).toBe('https://api.brewlite.example.com/promotions');
      expect(calls[2].method).toBe('POST');
      expect(calls[2].body).toEqual({
        code: 'SUMMER15',
        type: 'PERCENT',
        value: 15,
        maxDiscount: 20000,
      });

      expect(calls[3].url).toBe('https://api.brewlite.example.com/promotions/promo-1');
      expect(calls[3].method).toBe('PATCH');
      expect(calls[3].body).toEqual({ isActive: false });

      expect(calls[4].url).toBe('https://api.brewlite.example.com/loyalty/me');
      expect(calls[4].method).toBe('GET');

      for (const call of calls) {
        expect(call.headers.get('Authorization')).toBe('Bearer jwt-v3-token');
      }
    });

    it('POST /orders gửi promotionCode, usePoints (không gửi giá); PATCH /products/:id/availability và POST /products gửi stock', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(201, {}));
      globalThis.fetch = fetchMock;

      const payload = buildCreateOrderPayload(
        [
          {
            id: 'c1',
            productId: '11111111-0000-0000-0000-000000000001',
            name: 'Cà phê sữa đá',
            imageUrl: 'https://example.com/a.jpg',
            size: 'S',
            sugarLevel: 'P100',
            iceLevel: 'NORMAL',
            toppings: [],
            note: '',
            unitPrice: 29000,
            quantity: 2,
          },
        ],
        'TAKE_AWAY',
        { promotionCode: 'BREW10', usePoints: true }
      );

      await createOrderApi({
        ...payload,
        totalAmount: 1,
      } as unknown as Parameters<typeof createOrderApi>[0]);

      await createProductApi({
        name: 'Trà sen',
        category: 'TEA',
        basePrice: 35000,
        stock: 25,
      });

      await updateProductAvailabilityApi('prod-1', { isAvailable: true, stock: 12 });

      const orderBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(orderBody.promotionCode).toBe('BREW10');
      expect(orderBody.usePoints).toBe(true);
      expect(orderBody.totalAmount).toBeUndefined();
      expect(orderBody.items[0].unitPrice).toBeUndefined();

      const createProdBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(createProdBody.stock).toBe(25);

      const availBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
      expect(availBody).toEqual({ isAvailable: true, stock: 12 });
    });

    it('POST /payments nhận CARD và trả order.pointsEarned; lỗi 409 POST /orders giữ nguyên details.available', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse(201, {
            id: 'pay-bank-1',
            orderId: 'ord-1',
            method: 'CARD',
            accountLast4: '0001',
            amount: 50000,
            status: 'SUCCESS',
            createdAt: '2026-11-27T03:00:00.000Z',
            order: {
              id: 'ord-1',
              orderNumber: 1050,
              status: 'PAID',
              pointsEarned: 5,
            },
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(409, {
            statusCode: 409,
            message: "Sản phẩm 'Bạc xỉu' chỉ còn 2",
            error: 'Conflict',
            details: [
              {
                productId: '11111111-0000-0000-0000-000000000003',
                name: 'Bạc xỉu',
                available: 2,
              },
            ],
          })
        );
      globalThis.fetch = fetchMock;

      const payRes = await payOrderApi(
        { orderId: 'ord-1', method: 'CARD', accountNumber: '0900000001' },
        'idemp-card-12345'
      );
      expect(payRes.method).toBe('CARD');
      expect(payRes.order.pointsEarned).toBe(5);

      try {
        await createOrderApi({
          items: [{ productId: '11111111-0000-0000-0000-000000000003', quantity: 5 }],
        });
        expect.unreachable('Phải ném lỗi 409');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.details).toEqual([
          {
            productId: '11111111-0000-0000-0000-000000000003',
            name: 'Bạc xỉu',
            available: 2,
          },
        ]);
      }
    });
  });

  describe('3. Dữ liệu giả (Mock) cho Khuyến mãi, Điểm thưởng, Tồn kho & Đơn bản 3', () => {
    it('Công tắc mock mặc định TẮT và bật đồng bộ theo NEXT_PUBLIC_USE_MOCK', () => {
      expect(isMockPromotionsActive()).toBe(false);
      expect(isMockLoyaltyActive()).toBe(false);

      process.env.NEXT_PUBLIC_USE_MOCK = 'true';
      expect(isMockPromotionsActive()).toBe(true);
      expect(isMockLoyaltyActive()).toBe(true);
    });

    it('Mock promotions: có 3 mã mẫu, validate đúng công thức, thêm/sửa không cho sửa code', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK = 'true';

      const list = await getPromotionsApi();
      expect(list.map((p) => p.code)).toContain('BREW10');
      expect(list.map((p) => p.code)).toContain('GIAM20K');
      expect(list.map((p) => p.code)).toContain('TAMNGUNG');

      const validated = await validatePromotionApi({ code: ' brew10 ', subtotal: 200000 });
      expect(validated).toEqual({
        code: 'BREW10',
        type: 'PERCENT',
        value: 10,
        maxDiscount: 15000,
        discountAmount: 15000,
      });

      await expect(
        validatePromotionApi({ code: 'TAMNGUNG', subtotal: 50000 })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Mã giảm giá đã ngừng áp dụng',
      });

      await expect(
        validatePromotionApi({ code: 'KHONGCO', subtotal: 50000 })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Mã giảm giá không tồn tại',
      });

      const created = await createPromotionApi({
        code: 'new25',
        type: 'FIXED',
        value: 25000,
      });
      expect(created.code).toBe('NEW25');
      expect(created.maxDiscount).toBeNull();
      expect(created.isActive).toBe(true);

      await expect(
        updatePromotionApi(created.id, {
          code: 'OTHER',
        } as unknown as Parameters<typeof updatePromotionApi>[1])
      ).rejects.toBeInstanceOf(ApiHttpError);

      const toggled = await updatePromotionApi(created.id, { isActive: false });
      expect(toggled.isActive).toBe(false);
    });

    it('Mock đặt đơn + mã + điểm + thanh toán + hủy đơn: tính tiền, trừ/hoàn kho, cộng/hoàn/thu hồi điểm đúng hợp đồng', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK = 'true';

      // Ban đầu khách demo có 50 điểm
      const initialLoyalty = await getMyLoyaltyApi();
      expect(initialLoyalty.loyaltyPoints).toBe(50);

      // Đặt 2 Trà đào cam sả size S (39.000 x 2 = 78.000), mã BREW10 (giảm 7.800 -> làm tròn xuống 7.800), dùng điểm:
      // subtotal - discount - 1000 = 78.000 - 7.800 - 1.000 = 69.200 -> tối đa 69 điểm, khách có 50 -> dùng 50 điểm (-50.000) -> totalAmount = 20.200
      const order = await createOrderApi({
        receiveType: 'TAKE_AWAY',
        items: [{ productId: '11111111-0000-0000-0000-000000000004', quantity: 2 }],
        promotionCode: 'BREW10',
        usePoints: true,
      });

      expect(order.subtotalAmount).toBe(78000);
      expect(order.discountAmount).toBe(7800);
      expect(order.promotionCode).toBe('BREW10');
      expect(order.pointsUsed).toBe(50);
      expect(order.pointsEarned).toBe(0);
      expect(order.totalAmount).toBe(20200);

      // Đã trừ 50 điểm
      expect((await getMyLoyaltyApi()).loyaltyPoints).toBe(0);

      // Thanh toán thành công bằng CARD -> cộng floor(20200 / 10000) = 2 điểm
      const payRes = await payOrderApi(
        { orderId: order.id, method: 'CARD', accountNumber: '0900000001' },
        'idemp-v3-order-flow-1'
      );
      expect(payRes.status).toBe('SUCCESS');
      expect(payRes.order.pointsEarned).toBe(2);
      expect((await getMyLoyaltyApi()).loyaltyPoints).toBe(2);

      // Gửi lại cùng Idempotency-Key không cộng điểm lần 2
      const payResDup = await payOrderApi(
        { orderId: order.id, method: 'CARD', accountNumber: '0900000001' },
        'idemp-v3-order-flow-1'
      );
      expect(payResDup.id).toBe(payRes.id);
      expect((await getMyLoyaltyApi()).loyaltyPoints).toBe(2);

      // Hủy đơn -> hoàn kho, hoàn 50 điểm đã dùng, thu hồi 2 điểm đã cộng -> về 50 điểm
      const cancelled = await cancelOrderApi(order.id);
      expect(cancelled.status).toBe('CANCELLED');
      const loyaltyAfterCancel = await getMyLoyaltyApi();
      expect(loyaltyAfterCancel.loyaltyPoints).toBe(50);
      expect(loyaltyAfterCancel.transactions[0].type).toBe('REVOKE');
      expect(loyaltyAfterCancel.transactions[0].points).toBe(-2);
      expect(loyaltyAfterCancel.transactions[1].type).toBe('REFUND');
      expect(loyaltyAfterCancel.transactions[1].points).toBe(50);

      // Đặt vượt số lượng tồn kho (Trà đào cam sả đang còn 35) -> 409 kèm available: 35
      await expect(
        createOrderApi({
          items: [
            { productId: '11111111-0000-0000-0000-000000000004', quantity: 10 },
            { productId: '11111111-0000-0000-0000-000000000004', quantity: 10 },
            { productId: '11111111-0000-0000-0000-000000000004', quantity: 10 },
            { productId: '11111111-0000-0000-0000-000000000004', quantity: 6 },
          ],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Sản phẩm 'Trà đào cam sả' chỉ còn 35",
        details: [
          {
            productId: '11111111-0000-0000-0000-000000000004',
            name: 'Trà đào cam sả',
            available: 35,
          },
        ],
      });

      // Hủy bằng updateOrderStatusApi cũng gọi chung logic hoàn kho & điểm
      const order2 = await createOrderApi({
        items: [{ productId: '11111111-0000-0000-0000-000000000004', quantity: 5 }],
        usePoints: true,
      });
      expect(order2.pointsUsed).toBe(50);
      expect((await getMyLoyaltyApi()).loyaltyPoints).toBe(0);

      const cancelledByStaff = await updateOrderStatusApi(order2.id, 'CANCELLED');
      expect(cancelledByStaff.status).toBe('CANCELLED');
      expect((await getMyLoyaltyApi()).loyaltyPoints).toBe(50);
    });

    it('Mock updateProductAvailabilityApi bắt buộc stock 1..9999 khi isAvailable = true', async () => {
      process.env.NEXT_PUBLIC_USE_MOCK = 'true';

      await expect(
        updateProductAvailabilityApi('11111111-0000-0000-0000-000000000003', {
          isAvailable: true,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      await expect(
        updateProductAvailabilityApi('11111111-0000-0000-0000-000000000003', {
          isAvailable: true,
          stock: 0,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      const updated = await updateProductAvailabilityApi(
        '11111111-0000-0000-0000-000000000003',
        { isAvailable: true, stock: 18 }
      );
      expect(updated.stock).toBe(18);
    });
  });
});
