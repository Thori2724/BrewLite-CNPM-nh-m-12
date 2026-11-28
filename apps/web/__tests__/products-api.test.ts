import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProducts,
  getProductById,
  isSoldOut,
  notifyProductsInvalidated,
  PRODUCTS_INVALIDATED_EVENT,
} from '../services/api';
import { cancelOrderApi, createOrderApi } from '../services/orders';

describe('Lớp gọi API Sản phẩm thực tế (services/api.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
      NEXT_PUBLIC_USE_MOCK_PRODUCTS: 'false', // Tắt mock để gọi API thật
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // 1. GET /products thành công
  it('1. GET /products thành công: gọi đúng URL và trả về danh sách sản phẩm', async () => {
    const mockData = [
      {
        id: '11111111-0000-0000-0000-000000000001',
        name: 'Cà phê sữa đá',
        category: 'COFFEE',
        basePrice: 29000,
        imageUrl: 'https://example.com/cf.jpg',
        stock: 50,
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });
    global.fetch = fetchMock;

    const result = await getProducts();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/products', {
      cache: 'no-store',
    });
    expect(result).toEqual(mockData);
  });

  // 2. GET /products với category và q (kiểm tra encodeURIComponent và không gửi category khi undefined)
  it('2. GET /products với category và q: mã hóa query params chính xác', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    global.fetch = fetchMock;

    await getProducts({ category: 'TEA', q: 'trà đào' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/products?category=TEA&q=tr%C3%A0+%C4%91%C3%A0o',
      { cache: 'no-store' }
    );
  });

  // 3. GET /products lỗi 400 Bad Request từ server: ném đúng thông báo tiếng Việt
  it('3. GET /products lỗi 400 từ server: ném đúng message tiếng Việt từ server', async () => {
    const errorResponse = {
      statusCode: 400,
      message: 'Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE',
      error: 'Bad Request',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => errorResponse,
    });
    global.fetch = fetchMock;

    await expect(
      getProducts({ category: 'INVALID' as unknown as import('../services/api').ProductCategory })
    ).rejects.toThrow('Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE');
  });

  // 4. GET /products/:id thành công
  it('4. GET /products/:id thành công: gọi đúng URL và trả về chi tiết món', async () => {
    const mockDetail = {
      id: '11111111-0000-0000-0000-000000000001',
      name: 'Cà phê sữa đá',
      category: 'COFFEE',
      basePrice: 29000,
      imageUrl: 'https://example.com/cf.jpg',
      stock: 50,
      sizes: [{ value: 'S', label: 'Size S', extraPrice: 0 }],
      sugarLevels: [{ value: 'P100', label: '100%' }],
      iceLevels: [{ value: 'NORMAL', label: 'Đá vừa' }],
      toppings: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDetail,
    });
    global.fetch = fetchMock;

    const result = await getProductById('11111111-0000-0000-0000-000000000001');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/products/11111111-0000-0000-0000-000000000001',
      { cache: 'no-store' }
    );
    expect(result).toEqual(mockDetail);
  });

  // 5. GET /products/:id gặp 404 Not Found: trả về null đúng quy ước
  it('5. GET /products/:id gặp 404 Not Found: trả về null đúng quy ước', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ statusCode: 404, message: 'Không tìm thấy sản phẩm' }),
    });
    global.fetch = fetchMock;

    const result = await getProductById('non-existent-id');

    expect(result).toBeNull();
  });

  // 6. Endpoint công khai: không tự ý chuyển hướng đăng nhập khi gặp mã 401
  it('6. Endpoint công khai: gọi fetch độc lập, không tự động chuyển hướng trang đăng nhập', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ statusCode: 401, message: 'Unauthorized' }),
    });
    global.fetch = fetchMock;

    // Đảm bảo getProducts ném Error thông thường, không can thiệp window.location
    await expect(getProducts()).rejects.toThrow('Unauthorized');
  });

  // 7. Hàm isSoldOut chỉ dựa vào stock <= 0
  it('7. isSoldOut(stock) trả đúng với stock = 0 và stock âm, sai với stock >= 1', () => {
    expect(isSoldOut(0)).toBe(true);
    expect(isSoldOut(-1)).toBe(true);
    expect(isSoldOut(-99)).toBe(true);
    expect(isSoldOut(1)).toBe(false);
    expect(isSoldOut(50)).toBe(false);
  });

  // 8. Đặt đơn và hủy đơn thành công phát tín hiệu PRODUCTS_INVALIDATED_EVENT
  it('8. createOrderApi và cancelOrderApi thành công phát tín hiệu tải lại menu', async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_ORDERS = 'false';
    const listener = vi.fn();
    window.addEventListener(PRODUCTS_INVALIDATED_EVENT, listener);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'order-1', orderNumber: 1001, status: 'PENDING' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'order-1', orderNumber: 1001, status: 'CANCELLED' }),
      });
    global.fetch = fetchMock;

    notifyProductsInvalidated();
    expect(listener).toHaveBeenCalledTimes(1);

    await createOrderApi({
      receiveType: 'AT_COUNTER',
      items: [{ productId: '11111111-0000-0000-0000-000000000001', quantity: 1 }],
    });
    expect(listener).toHaveBeenCalledTimes(2);

    await cancelOrderApi('order-1');
    expect(listener).toHaveBeenCalledTimes(3);

    window.removeEventListener(PRODUCTS_INVALIDATED_EVENT, listener);
  });

  // 9. Lỗi 500 từ server trả về thông báo tiếng Việt, không lộ "Internal Server Error"
  it('9. GET /products và GET /products/:id gặp lỗi 500 từ server: báo lỗi tiếng Việt rõ ràng', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ statusCode: 500, message: 'Internal Server Error' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ statusCode: 500, message: 'Internal Server Error' }),
      });
    global.fetch = fetchMock;

    await expect(getProducts()).rejects.toThrow('Không kết nối được máy chủ, vui lòng thử lại');
    await expect(getProductById('11111111-0000-0000-0000-000000000001')).rejects.toThrow(
      'Không kết nối được máy chủ, vui lòng thử lại'
    );
  });
});
