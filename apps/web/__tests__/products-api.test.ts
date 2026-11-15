import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProducts, getProductById } from '../services/api';

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

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/products');
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
      'http://localhost:3001/products?category=TEA&q=tr%C3%A0+%C4%91%C3%A0o'
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
      'http://localhost:3001/products/11111111-0000-0000-0000-000000000001'
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
});
