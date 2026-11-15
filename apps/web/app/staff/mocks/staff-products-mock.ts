import { ProductManage } from '../../../services/api';
import { ApiHttpError } from '../../../services/auth-contract';

/**
 * Công tắc dữ liệu giả riêng cho trang /staff/products.
 * Mặc định `enabled: false` để tránh ghi đè khi nối API thật.
 * Có thể bật qua `NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS=true` hoặc `NEXT_PUBLIC_USE_MOCK=true`.
 */
export const STAFF_PRODUCTS_MOCK_CONFIG = {
  enabled: false,
};

export function isStaffProductsMockEnabled(): boolean {
  const localFlag = process.env.NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS;
  if (localFlag !== undefined && localFlag.trim() !== '') {
    return localFlag.trim() === 'true';
  }
  const unifiedFlag = process.env.NEXT_PUBLIC_USE_MOCK;
  if (unifiedFlag !== undefined && unifiedFlag.trim() !== '') {
    return unifiedFlag.trim() === 'true';
  }
  return STAFF_PRODUCTS_MOCK_CONFIG.enabled;
}

export const STAFF_MOCK_DEFAULT_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500';

/**
 * Dữ liệu giả danh sách món theo đúng hình dạng hợp đồng GET /products/manage (mục 3.4 docs/api-contract.md),
 * gồm đủ 4 danh mục (TEA, COFFEE, MILK_TEA, CAKE), có món đang bán, món tạm hết (stock = 0) và món ẩn (isVisible = false).
 */
export const MOCK_STAFF_PRODUCTS_SEED: ProductManage[] = [
  {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: 'CAKE',
    basePrice: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    stock: 20,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000003',
    name: 'Bạc xỉu',
    category: 'COFFEE',
    basePrice: 32000,
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500',
    stock: 0,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000001',
    name: 'Cà phê sữa đá',
    category: 'COFFEE',
    basePrice: 29000,
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
    stock: 50,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000011',
    name: 'Trà sữa matcha',
    category: 'MILK_TEA',
    basePrice: 42000,
    imageUrl: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=500',
    stock: 0,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000007',
    name: 'Trà sữa truyền thống',
    category: 'MILK_TEA',
    basePrice: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
    stock: 40,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000012',
    name: 'Hồng trà kem cheese',
    category: 'TEA',
    basePrice: 45000,
    imageUrl: STAFF_MOCK_DEFAULT_PRODUCT_IMAGE,
    stock: 999,
    isVisible: false,
  },
  {
    id: '11111111-0000-0000-0000-000000000004',
    name: 'Trà đào cam sả',
    category: 'TEA',
    basePrice: 39000,
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    stock: 35,
    isVisible: true,
  },
];

let mockStaffProductsStore: ProductManage[] = cloneProducts(MOCK_STAFF_PRODUCTS_SEED);

function cloneProducts(products: ProductManage[]): ProductManage[] {
  return products.map((item) => ({ ...item }));
}

function sortProductsByCategoryAndName(products: ProductManage[]): ProductManage[] {
  return [...products].sort((a, b) => {
    const catCompare = a.category.localeCompare(b.category);
    if (catCompare !== 0) return catCompare;
    return a.name.localeCompare(b.name, 'vi');
  });
}

export function resetMockStaffProducts(): void {
  mockStaffProductsStore = cloneProducts(MOCK_STAFF_PRODUCTS_SEED);
}

export async function getMockStaffProducts(): Promise<ProductManage[]> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  return sortProductsByCategoryAndName(cloneProducts(mockStaffProductsStore));
}

export async function updateMockStaffProductAvailability(
  productId: string,
  isAvailable: boolean
): Promise<ProductManage> {
  await new Promise((resolve) => setTimeout(resolve, 30));

  if (typeof isAvailable !== 'boolean') {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['isAvailable must be a boolean value'],
      error: 'Bad Request',
    });
  }

  const target = mockStaffProductsStore.find((item) => item.id === productId);
  if (!target) {
    throw new ApiHttpError({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
      error: 'Not Found',
    });
  }

  target.stock = isAvailable ? 999 : 0;
  return { ...target };
}

export async function updateMockStaffProductVisibility(
  productId: string,
  isVisible: boolean
): Promise<ProductManage> {
  await new Promise((resolve) => setTimeout(resolve, 30));

  if (typeof isVisible !== 'boolean') {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['isVisible must be a boolean value'],
      error: 'Bad Request',
    });
  }

  const target = mockStaffProductsStore.find((item) => item.id === productId);
  if (!target) {
    throw new ApiHttpError({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
      error: 'Not Found',
    });
  }

  target.isVisible = isVisible;
  return { ...target };
}

