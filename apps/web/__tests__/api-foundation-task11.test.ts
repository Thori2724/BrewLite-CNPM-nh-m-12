import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATEGORY_LABELS,
  createProductApi,
  getManageProductsApi,
  ICE_LABELS,
  PRODUCT_STATUS_LABELS,
  SIZE_LABELS,
  SUGAR_LABELS,
  updateProductApi,
  updateProductAvailabilityApi,
} from '../services/api';
import {
  ApiHttpError,
  AuthApiError,
  getApiBaseUrl,
  loginApi,
  resetRedirectFlag,
} from '../services/auth';
import {
  AUTH_ERROR_MESSAGES,
  getStaffStatusLabel,
  ROLE_LABELS,
  STAFF_STATUS_LABELS,
} from '../services/auth-contract';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIVE_TYPE_LABELS,
} from '../services/order-contract';
import {
  cancelOrderApi,
  createOrderApi,
  getAllOrdersApi,
  OrderApiError,
  payOrderApi,
  updateOrderStatusApi,
} from '../services/orders';
import { getStaffListApi, updateStaffStatusApi } from '../services/staff';
import { loadAuthSession, saveAuthSession } from '../utils/auth';
import {
  isMockAuthActive,
  isMockOrdersActive,
  isMockProductsActive,
  isMockStaffActive,
  resetMockAuthDatabase,
  resetMockOrdersDatabase,
  resetMockProductsDatabase,
} from '../mocks';

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

describe('Task 11 - Lớp nền API, TypeScript, Mock và Bảng nhãn tiếng Việt', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockAuthDatabase();
    resetMockProductsDatabase();
    resetMockOrdersDatabase();

    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.NEXT_PUBLIC_USE_MOCK_AUTH;
    delete process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS;
    delete process.env.NEXT_PUBLIC_USE_MOCK_ORDERS;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe('1. Công tắc Mock duy nhất NEXT_PUBLIC_USE_MOCK', () => {
    it('1.1. Mặc định TẮT khi chưa đặt NEXT_PUBLIC_USE_MOCK và các biến cũ', () => {
      expect(isMockAuthActive()).toBe(false);
      expect(isMockProductsActive()).toBe(false);
      expect(isMockOrdersActive()).toBe(false);
      expect(isMockStaffActive()).toBe(false);
    });

    it('1.2. NEXT_PUBLIC_USE_MOCK=true ghi đè toàn bộ biến cũ=false; NEXT_PUBLIC_USE_MOCK=false ghi đè biến cũ=true', () => {
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH = 'false';
      process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS = 'false';
      process.env.NEXT_PUBLIC_USE_MOCK_ORDERS = 'false';
      process.env.NEXT_PUBLIC_USE_MOCK = 'true';

      expect(isMockAuthActive()).toBe(true);
      expect(isMockProductsActive()).toBe(true);
      expect(isMockOrdersActive()).toBe(true);
      expect(isMockStaffActive()).toBe(true);

      process.env.NEXT_PUBLIC_USE_MOCK_AUTH = 'true';
      process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS = 'true';
      process.env.NEXT_PUBLIC_USE_MOCK_ORDERS = 'true';
      process.env.NEXT_PUBLIC_USE_MOCK = 'false';

      expect(isMockAuthActive()).toBe(false);
      expect(isMockProductsActive()).toBe(false);
      expect(isMockOrdersActive()).toBe(false);
      expect(isMockStaffActive()).toBe(false);
    });

    it('1.3. Nếu NEXT_PUBLIC_USE_MOCK chưa đặt thì vẫn tương thích fallback biến cũ', () => {
      process.env.NEXT_PUBLIC_USE_MOCK_ORDERS = 'true';
      expect(isMockOrdersActive()).toBe(true);
      expect(isMockProductsActive()).toBe(false);
    });
  });

  describe('2. API thật: URL, Authorization, Idempotency-Key, không gửi giá & chuẩn lỗi', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_USE_MOCK = 'false';
      saveAuthSession({
        token: 'jwt-staff-token-123',
        user: {
          id: '55555555-0000-0000-0000-000000000001',
          email: 'nhanvien1@example.com',
          displayName: 'Nhân viên 1',
          role: 'STAFF',
        },
      });
    });

    it('2.1. Đọc NEXT_PUBLIC_API_URL (mặc định http://localhost:3001) và gắn Authorization cho các endpoint mới', async () => {
      expect(getApiBaseUrl()).toBe('http://localhost:3001');
      process.env.NEXT_PUBLIC_API_URL = 'https://api.brewlite.example.com/';
      expect(getApiBaseUrl()).toBe('https://api.brewlite.example.com');

      const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, []));
      globalThis.fetch = fetchMock;

      await getAllOrdersApi({ status: 'PAID' });
      await updateOrderStatusApi('order-1', 'PREPARING');
      await cancelOrderApi('order-1');
      await getManageProductsApi();
      await createProductApi({
        name: 'Trà ô long',
        category: 'TEA',
        basePrice: 35000,
      });
      await updateProductApi('prod-1', { isVisible: false });
      await updateProductAvailabilityApi('prod-1', false);
      await getStaffListApi();
      await updateStaffStatusApi('staff-1', false);

      expect(fetchMock).toHaveBeenCalledTimes(9);

      const calls = fetchMock.mock.calls.map(([url, init]) => ({
        url: String(url),
        method: init?.method,
        headers: init?.headers as Headers,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }));

      expect(calls[0].url).toBe('https://api.brewlite.example.com/orders?status=PAID');
      expect(calls[0].method).toBe('GET');

      expect(calls[1].url).toBe('https://api.brewlite.example.com/orders/order-1/status');
      expect(calls[1].method).toBe('PATCH');
      expect(calls[1].body).toEqual({ status: 'PREPARING' });

      expect(calls[2].url).toBe('https://api.brewlite.example.com/orders/order-1/cancel');
      expect(calls[2].method).toBe('POST');
      expect(calls[2].body).toBeUndefined();

      expect(calls[3].url).toBe('https://api.brewlite.example.com/products/manage');
      expect(calls[3].method).toBe('GET');

      expect(calls[4].url).toBe('https://api.brewlite.example.com/products');
      expect(calls[4].method).toBe('POST');

      expect(calls[5].url).toBe('https://api.brewlite.example.com/products/prod-1');
      expect(calls[5].method).toBe('PATCH');
      expect(calls[5].body).toEqual({ isVisible: false });

      expect(calls[6].url).toBe('https://api.brewlite.example.com/products/prod-1/availability');
      expect(calls[6].method).toBe('PATCH');
      expect(calls[6].body).toEqual({ isAvailable: false });

      expect(calls[7].url).toBe('https://api.brewlite.example.com/staff');
      expect(calls[7].method).toBe('GET');

      expect(calls[8].url).toBe('https://api.brewlite.example.com/staff/staff-1/status');
      expect(calls[8].method).toBe('PATCH');
      expect(calls[8].body).toEqual({ isActive: false });

      for (const call of calls) {
        expect(call.headers.get('Authorization')).toBe('Bearer jwt-staff-token-123');
      }
    });

    it('2.2. POST /payments gửi header Authorization + Idempotency-Key và nhận accountNumber từ tham số', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockJsonResponse(201, {
          id: 'pay-1',
          orderId: 'ord-1',
          method: 'WALLET',
          accountLast4: '0001',
          amount: 29000,
          status: 'SUCCESS',
          createdAt: '2026-11-14T10:00:00.000Z',
          order: { id: 'ord-1', orderNumber: 1001, status: 'PAID' },
        })
      );
      globalThis.fetch = fetchMock;

      await payOrderApi(
        { orderId: 'ord-1', method: 'WALLET', accountNumber: '0900000001' },
        'idemp-task11-1234'
      );

      const [, init] = fetchMock.mock.calls[0];
      const headers = init?.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer jwt-staff-token-123');
      expect(headers.get('Idempotency-Key')).toBe('idemp-task11-1234');
      expect(JSON.parse(String(init?.body))).toEqual({
        orderId: 'ord-1',
        method: 'WALLET',
        accountNumber: '0900000001',
      });
    });

    it('2.3. POST /orders lọc bỏ unitPrice/totalAmount nếu vô tình truyền và giữ details [{productId, name}] khi lỗi 409', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse(409, {
            statusCode: 409,
            message: "Sản phẩm 'Bạc xỉu' hiện đã tạm hết",
            error: 'Conflict',
            details: [{ productId: '11111111-0000-0000-0000-000000000003', name: 'Bạc xỉu' }],
          })
        );
      globalThis.fetch = fetchMock;

      const dirtyPayload = {
        receiveType: 'AT_COUNTER',
        totalAmount: 999999,
        items: [
          {
            productId: '11111111-0000-0000-0000-000000000003',
            quantity: 1,
            unitPrice: 1000,
          },
        ],
      } as unknown as Parameters<typeof createOrderApi>[0];

      try {
        await createOrderApi(dirtyPayload);
        expect.unreachable('Phải ném OrderApiError 409');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderApiError);
        const orderErr = err as OrderApiError;
        expect(orderErr.statusCode).toBe(409);
        expect(orderErr.message).toBe("Sản phẩm 'Bạc xỉu' hiện đã tạm hết");
        expect(orderErr.details).toEqual([
          { productId: '11111111-0000-0000-0000-000000000003', name: 'Bạc xỉu' },
        ]);
      }

      const [, init] = fetchMock.mock.calls[0];
      const sentBody = JSON.parse(String(init?.body));
      expect(sentBody.totalAmount).toBeUndefined();
      expect(sentBody.items[0].unitPrice).toBeUndefined();
    });

    it('2.4. Các hàm mới giữ nguyên message dạng string[] khi lỗi 400 và KHÔNG tự xóa token hay redirect khi gặp 401/403', async () => {
      const originalLocation = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      (window as unknown as Record<string, unknown>).location = {
        pathname: '/staff',
        search: '',
        href: '/staff',
      };

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse(400, {
            statusCode: 400,
            message: [
              'name must be longer than or equal to 1 characters',
              'basePrice must not be less than 1000',
            ],
            error: 'Bad Request',
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(401, {
            statusCode: 401,
            message: 'Unauthorized',
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(403, {
            statusCode: 403,
            message: 'Tài khoản đã bị khóa',
            error: 'Forbidden',
          })
        );

      try {
        await createProductApi({ name: '', category: 'TEA', basePrice: 500 });
        expect.unreachable('Phải ném lỗi 400');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        const httpErr = err as ApiHttpError;
        expect(httpErr.statusCode).toBe(400);
        expect(Array.isArray(httpErr.message)).toBe(true);
        expect(httpErr.message).toEqual([
          'name must be longer than or equal to 1 characters',
          'basePrice must not be less than 1000',
        ]);
      }

      try {
        await getAllOrdersApi();
        expect.unreachable('Phải ném lỗi 401');
      } catch (err) {
        const httpErr = err as ApiHttpError;
        expect(httpErr.statusCode).toBe(401);
      }

      try {
        await getStaffListApi();
        expect.unreachable('Phải ném lỗi 403');
      } catch (err) {
        const httpErr = err as ApiHttpError;
        expect(httpErr.statusCode).toBe(403);
        expect(httpErr.message).toBe('Tài khoản đã bị khóa');
      }

      // Phiên đăng nhập và URL không bị task 11 tự ý xóa/chuyển hướng
      expect(loadAuthSession()).not.toBeNull();
      expect(window.location.href).toBe('/staff');

      (window as unknown as Record<string, unknown>).location = originalLocation;
    });

    it('2.5. POST /auth/login trả đúng { accessToken, user } và xử lý 403 tài khoản bị khóa', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse(200, {
            accessToken: 'token-abc',
            user: {
              id: '55555555-0000-0000-0000-000000000001',
              email: 'nhanvien1@example.com',
              displayName: 'Nhân viên 1',
              role: 'STAFF',
            },
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(403, {
            statusCode: 403,
            message: AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED,
            error: 'Forbidden',
          })
        );

      const loginOk = await loginApi({
        email: 'nhanvien1@example.com',
        password: 'password123',
      });
      expect(loginOk).toEqual({
        accessToken: 'token-abc',
        user: {
          id: '55555555-0000-0000-0000-000000000001',
          email: 'nhanvien1@example.com',
          displayName: 'Nhân viên 1',
          role: 'STAFF',
        },
      });

      try {
        await loginApi({
          email: 'nhanvien3@example.com',
          password: 'password123',
        });
        expect.unreachable('Phải ném AuthApiError 403');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthApiError);
        const authErr = err as AuthApiError;
        expect(authErr.statusCode).toBe(403);
        expect(authErr.message).toBe('Tài khoản đã bị khóa');
      }
    });
  });

  describe('3. Dữ liệu giả (Mock) đúng hợp đồng khi bật NEXT_PUBLIC_USE_MOCK=true', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    });

    it('3.1. Mock đăng nhập đủ tài khoản demo mục 8.3 và chặn 403 nhân viên bị khóa', async () => {
      const adminRes = await loginApi({
        email: 'quanly@example.com',
        password: 'password123',
      });
      expect(adminRes.user).toEqual({
        id: '66666666-0000-0000-0000-000000000001',
        email: 'quanly@example.com',
        displayName: 'Quản lý',
        role: 'ADMIN',
      });

      await expect(
        loginApi({
          email: 'nhanvien3@example.com',
          password: 'password123',
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Tài khoản đã bị khóa',
      });
    });

    it('3.2. Mock nhân viên có 3 STAFF (1 isActive=false) và khóa/mở khóa được theo id', async () => {
      const staffList = await getStaffListApi();
      expect(staffList).toHaveLength(3);
      expect(staffList.some((s) => s.isActive === false)).toBe(true);

      const unlocked = await updateStaffStatusApi(
        '55555555-0000-0000-0000-000000000003',
        true
      );
      expect(unlocked.isActive).toBe(true);

      await expect(
        updateStaffStatusApi('66666666-0000-0000-0000-000000000001', false)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy nhân viên',
      });
    });

    it('3.3. Mock món quản lý có món tạm hết (stock=0) và món ẩn (isVisible=false); thêm/sửa/gạt hoạt động đúng', async () => {
      const manageList = await getManageProductsApi();
      expect(manageList.some((p) => p.stock === 0)).toBe(true);
      expect(manageList.some((p) => p.isVisible === false)).toBe(true);

      const created = await createProductApi({
        name: 'Trà vải lài',
        category: 'TEA',
        basePrice: 38000,
        imageUrl: '',
      });
      expect(created.id).toBeTruthy();
      expect(created.stock).toBe(999);
      expect(created.isVisible).toBe(true);
      expect(created.imageUrl).toMatch(/^https?:\/\//);

      const toggled = await updateProductAvailabilityApi(created.id, false);
      expect(toggled.stock).toBe(0);

      const updated = await updateProductApi(created.id, { isVisible: false });
      expect(updated.isVisible).toBe(false);
    });

    it('3.4. Mock đơn hàng có đủ 7 trạng thái, lọc status, chuyển trạng thái và hủy đơn đúng quy tắc', async () => {
      const allOrders = await getAllOrdersApi();
      const statuses = new Set(allOrders.map((o) => o.status));
      expect(statuses).toEqual(
        new Set([
          'PENDING',
          'PAID',
          'PREPARING',
          'READY',
          'COMPLETED',
          'PAYMENT_FAILED',
          'CANCELLED',
        ])
      );
      expect(allOrders[0].customer).toBeDefined();

      const onlyPaid = await getAllOrdersApi({ status: 'PAID' });
      expect(onlyPaid.length).toBeGreaterThan(0);
      expect(onlyPaid.every((o) => o.status === 'PAID')).toBe(true);

      // Chuyển hợp lệ PAID -> PREPARING
      const preparing = await updateOrderStatusApi(
        '33333333-0000-0000-0000-000000000001',
        'PREPARING'
      );
      expect(preparing.status).toBe('PREPARING');

      // Không hủy được khi đang PREPARING
      await expect(
        cancelOrderApi('33333333-0000-0000-0000-000000000001')
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Không thể hủy đơn ở trạng thái hiện tại',
      });

      // Hủy được đơn PENDING
      const cancelled = await cancelOrderApi('33333333-0000-0000-0000-000000000002');
      expect(cancelled.status).toBe('CANCELLED');
    });
  });

  describe('4. Bảng nhãn tiếng Việt đầy đủ theo mục 9.3 hợp đồng', () => {
    it('4.1. Khớp chính xác toàn bộ mã kỹ thuật và nhãn tiếng Việt', () => {
      expect(SIZE_LABELS).toEqual({
        S: 'Size S',
        M: 'Size M (+6.000đ)',
        L: 'Size L (+10.000đ)',
      });
      expect(SUGAR_LABELS).toEqual({
        P0: '0%',
        P30: '30%',
        P50: '50%',
        P70: '70%',
        P100: '100%',
      });
      expect(ICE_LABELS).toEqual({
        NONE: 'Không đá',
        LOW: 'Ít đá',
        NORMAL: 'Đá vừa',
        FULL: 'Nhiều đá',
      });
      expect(RECEIVE_TYPE_LABELS).toEqual({
        AT_COUNTER: 'Tại quầy',
        TAKE_AWAY: 'Mang đi',
      });
      expect(ORDER_STATUS_LABELS).toEqual({
        PENDING: 'Chờ thanh toán',
        PAID: 'Đã thanh toán',
        PREPARING: 'Đang pha chế',
        READY: 'Sẵn sàng nhận',
        COMPLETED: 'Hoàn thành',
        PAYMENT_FAILED: 'Thanh toán lỗi',
        CANCELLED: 'Đã hủy',
      });
      expect(PAYMENT_METHOD_LABELS.WALLET).toBe('Ví điện tử (ZaloPay/Momo)');
      expect(CATEGORY_LABELS).toEqual({
        TEA: 'Trà',
        COFFEE: 'Cà phê',
        MILK_TEA: 'Trà sữa',
        CAKE: 'Bánh',
      });
      expect(ROLE_LABELS).toEqual({
        CUSTOMER: 'Khách hàng',
        STAFF: 'Nhân viên',
        ADMIN: 'Quản lý',
      });
      expect(STAFF_STATUS_LABELS).toEqual({
        ACTIVE: 'Hoạt động',
        LOCKED: 'Đã khóa',
      });
      expect(getStaffStatusLabel(true)).toBe('Hoạt động');
      expect(getStaffStatusLabel(false)).toBe('Đã khóa');
      expect(PRODUCT_STATUS_LABELS.AVAILABLE).toBe('Đang bán');
      expect(PRODUCT_STATUS_LABELS.OUT_OF_STOCK).toBe('Tạm hết');
      expect(PRODUCT_STATUS_LABELS.OUT_OF_STOCK_BADGE).toBe('Hết hàng');
    });
  });
});

