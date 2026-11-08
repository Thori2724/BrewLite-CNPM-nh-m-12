import {
  isMockProductsActive,
  MOCK_PRODUCTS,
  mockGetProducts,
  mockGetProductById,
} from '../mocks/mock-products';

// 1. Phân loại danh mục sản phẩm theo hợp đồng
export type ProductCategory = 'TEA' | 'COFFEE' | 'MILK_TEA' | 'CAKE';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  TEA: 'Trà',
  COFFEE: 'Cà phê',
  MILK_TEA: 'Trà sữa',
  CAKE: 'Bánh',
};

// 2. Kích thước (Size) theo mục 2.3 và 7 của hợp đồng
export type SizeId = 'S' | 'M' | 'L';

export const SIZE_LABELS: Record<SizeId, string> = {
  S: 'Size S',
  M: 'Size M (+6.000đ)',
  L: 'Size L (+10.000đ)',
};

export interface SizeOption {
  value: SizeId;
  label: string;
  extraPrice: number;
}

// 3. Mức đường theo mục 2.3 và 7 của hợp đồng
export type SugarLevel = 'P0' | 'P30' | 'P50' | 'P70' | 'P100';

export const SUGAR_LABELS: Record<SugarLevel, string> = {
  P0: '0%',
  P30: '30%',
  P50: '50%',
  P70: '70%',
  P100: '100%',
};

export interface SugarOption {
  value: SugarLevel;
  label: string;
}

// 4. Mức đá theo mục 2.3 và 7 của hợp đồng
export type IceLevel = 'NONE' | 'LOW' | 'NORMAL' | 'FULL';

export const ICE_LABELS: Record<IceLevel, string> = {
  NONE: 'Không đá',
  LOW: 'Ít đá',
  NORMAL: 'Đá vừa',
  FULL: 'Nhiều đá',
};

export interface IceOption {
  value: IceLevel;
  label: string;
}

// 5. Topping theo mục 2.3 của hợp đồng
export interface ProductTopping {
  id: string;
  name: string;
  price: number;
}

export type Topping = ProductTopping;

// 6. Nhãn bổ sung từ mục 7 hợp đồng (dùng chung cho toàn hệ thống)
export const RECEIVE_TYPE_LABELS = {
  AT_COUNTER: 'Tại quầy',
  TAKE_AWAY: 'Mang đi',
} as const;

export const ORDER_STATUS_LABELS = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PREPARING: 'Đang pha chế',
  READY: 'Sẵn sàng nhận',
  COMPLETED: 'Hoàn thành',
  PAYMENT_FAILED: 'Thanh toán lỗi',
  CANCELLED: 'Đã hủy',
} as const;

export const PAYMENT_METHOD_LABELS = {
  WALLET: 'Ví điện tử',
  CARD: 'Thẻ ngân hàng',
} as const;

// 7. Kiểu dữ liệu Sản phẩm và Chi tiết sản phẩm
export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  basePrice: number;
  imageUrl: string;
  stock: number;
}

export interface ProductDetail extends Product {
  sizes: SizeOption[];
  sugarLevels: SugarOption[];
  iceLevels: IceOption[];
  toppings: ProductTopping[];
}

export interface GetProductsParams {
  category?: ProductCategory;
  q?: string;
}

// Re-export để component/mock có thể truy cập
export { isMockProductsActive, MOCK_PRODUCTS };

/**
 * Lấy danh sách sản phẩm hiển thị trên trang chủ Menu.
 * Endpoint: GET /products (không yêu cầu đăng nhập)
 */
export async function getProducts(params?: GetProductsParams): Promise<Product[]> {
  if (isMockProductsActive()) {
    return mockGetProducts(params);
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const searchParams = new URLSearchParams();

  if (params?.category) {
    searchParams.set('category', params.category);
  }
  if (params?.q && params.q.trim()) {
    searchParams.set('q', params.q.trim());
  }

  const queryString = searchParams.toString();
  const url = `${apiUrl}/products${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    let errorMessage = 'Không thể tải danh sách sản phẩm';
    try {
      const data = await res.json();
      if (typeof data.message === 'string') {
        errorMessage = data.message;
      } else if (Array.isArray(data.message)) {
        errorMessage = data.message.join(', ');
      }
    } catch {}
    throw new Error(errorMessage);
  }

  return res.json();
}

/**
 * Xem chi tiết món và các tùy chọn size, đường, đá, topping.
 * Endpoint: GET /products/:id (không yêu cầu đăng nhập)
 */
export async function getProductById(id: string): Promise<ProductDetail | null> {
  if (isMockProductsActive()) {
    return mockGetProductById(id);
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const url = `${apiUrl}/products/${encodeURIComponent(id)}`;

  const res = await fetch(url);
  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    let errorMessage = 'Không thể tải thông tin món';
    try {
      const data = await res.json();
      if (typeof data.message === 'string') {
        errorMessage = data.message;
      } else if (Array.isArray(data.message)) {
        errorMessage = data.message.join(', ');
      }
    } catch {}
    throw new Error(errorMessage);
  }

  return res.json();
}
