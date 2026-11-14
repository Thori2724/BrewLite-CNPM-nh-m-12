import { isMockProductsActive } from '../mocks/mock-config';
import {
  MOCK_PRODUCTS,
  mockGetProducts,
  mockGetProductById,
  mockGetManageProducts,
  mockCreateProduct,
  mockUpdateProduct,
  mockUpdateProductAvailability,
} from '../mocks/mock-products';
import { apiRequest, getApiBaseUrl } from './auth';
import { AUTH_ERROR_MESSAGES } from './auth-contract';

// 1. Phân loại danh mục sản phẩm theo hợp đồng
export type ProductCategory = 'TEA' | 'COFFEE' | 'MILK_TEA' | 'CAKE';
export type Category = ProductCategory;

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
  WALLET: 'Ví điện tử (ZaloPay/Momo)',
  CARD: 'Thẻ ngân hàng',
} as const;

export const PRODUCT_STATUS_LABELS = {
  AVAILABLE: 'Đang bán',
  OUT_OF_STOCK: 'Tạm hết',
  OUT_OF_STOCK_BADGE: 'Hết hàng',
  HIDDEN: 'Đã ẩn',
} as const;

export function getProductStockLabel(stock: number): string {
  return stock > 0 ? PRODUCT_STATUS_LABELS.AVAILABLE : PRODUCT_STATUS_LABELS.OUT_OF_STOCK;
}

// 7. Kiểu dữ liệu Sản phẩm và Chi tiết sản phẩm
export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  basePrice: number;
  imageUrl: string;
  stock: number;
}

export interface ProductManage extends Product {
  isVisible: boolean;
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

export interface CreateProductDto {
  name: string;
  category: Category;
  basePrice: number;
  imageUrl?: string;
}

export interface UpdateProductDto {
  name?: string;
  category?: Category;
  basePrice?: number;
  imageUrl?: string;
  isVisible?: boolean;
}

export interface UpdateProductAvailabilityDto {
  isAvailable: boolean;
}

export const PRODUCT_ENDPOINTS = {
  LIST: '/products',
  DETAIL: (id: string) => `/products/${encodeURIComponent(id)}`,
  MANAGE: '/products/manage',
  CREATE: '/products',
  UPDATE: (id: string) => `/products/${encodeURIComponent(id)}`,
  AVAILABILITY: (id: string) => `/products/${encodeURIComponent(id)}/availability`,
} as const;

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

  const apiUrl = getApiBaseUrl();
  const searchParams = new URLSearchParams();

  if (params?.category) {
    searchParams.set('category', params.category);
  }
  if (params?.q && params.q.trim()) {
    searchParams.set('q', params.q.trim());
  }

  const queryString = searchParams.toString();
  const url = `${apiUrl}/products${queryString ? `?${queryString}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Không kết nối được máy chủ, vui lòng thử lại');
  }
  if (!res.ok) {
    let errorMessage = 'Không thể tải danh sách sản phẩm';
    try {
      const data = await res.json();
      if (typeof data.message === 'string') {
        errorMessage = data.message;
      } else if (Array.isArray(data.message)) {
        errorMessage = AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
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

  const apiUrl = getApiBaseUrl();
  const url = `${apiUrl}/products/${encodeURIComponent(id)}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Không kết nối được máy chủ, vui lòng thử lại');
  }
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
        errorMessage = AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
      }
    } catch {}
    throw new Error(errorMessage);
  }

  return res.json();
}

/**
 * Lấy danh sách toàn bộ món (kể cả món ẩn) cho nhân viên/quản lý.
 * Endpoint: GET /products/manage (STAFF, ADMIN)
 */
export async function getManageProductsApi(): Promise<ProductManage[]> {
  if (isMockProductsActive()) {
    return mockGetManageProducts();
  }

  return apiRequest<ProductManage[]>(PRODUCT_ENDPOINTS.MANAGE, {
    method: 'GET',
  });
}

/**
 * Tạo món mới.
 * Endpoint: POST /products (ADMIN)
 */
export async function createProductApi(dto: CreateProductDto): Promise<ProductManage> {
  if (isMockProductsActive()) {
    return mockCreateProduct(dto);
  }

  return apiRequest<ProductManage>(PRODUCT_ENDPOINTS.CREATE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Cập nhật thông tin hoặc ẩn/hiện món.
 * Endpoint: PATCH /products/:id (ADMIN)
 */
export async function updateProductApi(
  id: string,
  dto: UpdateProductDto
): Promise<ProductManage> {
  if (isMockProductsActive()) {
    return mockUpdateProduct(id, dto);
  }

  return apiRequest<ProductManage>(PRODUCT_ENDPOINTS.UPDATE(id), {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

/**
 * Gạt trạng thái đang bán / tạm hết của món (stock = 999 hoặc 0).
 * Endpoint: PATCH /products/:id/availability (STAFF, ADMIN)
 */
export async function updateProductAvailabilityApi(
  id: string,
  isAvailableOrDto: boolean | UpdateProductAvailabilityDto
): Promise<ProductManage> {
  const isAvailable =
    typeof isAvailableOrDto === 'boolean' ? isAvailableOrDto : isAvailableOrDto.isAvailable;

  if (isMockProductsActive()) {
    return mockUpdateProductAvailability(id, isAvailable);
  }

  return apiRequest<ProductManage>(PRODUCT_ENDPOINTS.AVAILABILITY(id), {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
  });
}
