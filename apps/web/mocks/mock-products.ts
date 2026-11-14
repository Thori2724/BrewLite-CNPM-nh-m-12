import {
  Category,
  CreateProductDto,
  GetProductsParams,
  IceOption,
  Product,
  ProductDetail,
  ProductManage,
  ProductTopping,
  SizeOption,
  SugarOption,
  UpdateProductDto,
} from '../services/api';
import { ApiHttpError } from '../services/auth-contract';
import { isMockProductsActive } from './mock-config';

export { isMockProductsActive };

export const MOCK_DEFAULT_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500';

export const MOCK_SIZES: SizeOption[] = [
  { value: 'S', label: 'Size S', extraPrice: 0 },
  { value: 'M', label: 'Size M', extraPrice: 6000 },
  { value: 'L', label: 'Size L', extraPrice: 10000 },
];

export const MOCK_SUGAR_LEVELS: SugarOption[] = [
  { value: 'P0', label: '0%' },
  { value: 'P30', label: '30%' },
  { value: 'P50', label: '50%' },
  { value: 'P70', label: '70%' },
  { value: 'P100', label: '100%' },
];

export const MOCK_ICE_LEVELS: IceOption[] = [
  { value: 'NONE', label: 'Không đá' },
  { value: 'LOW', label: 'Ít đá' },
  { value: 'NORMAL', label: 'Đá vừa' },
  { value: 'FULL', label: 'Nhiều đá' },
];

export const MOCK_TOPPINGS: ProductTopping[] = [
  { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
  { id: '22222222-0000-0000-0000-000000000002', name: 'Thạch dừa', price: 5000 },
  { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
  { id: '22222222-0000-0000-0000-000000000004', name: 'Kem cheese', price: 10000 },
];

const VALID_CATEGORIES: Category[] = ['TEA', 'COFFEE', 'MILK_TEA', 'CAKE'];

/**
 * Danh sách món mẫu dùng cho trang quản lý (/staff/products), bao gồm cả món tạm hết (stock = 0)
 * và món đang ẩn (isVisible = false).
 */
export const MOCK_SEED_MANAGE_PRODUCTS: ProductManage[] = [
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
    id: '11111111-0000-0000-0000-000000000003',
    name: 'Bạc xỉu',
    category: 'COFFEE',
    basePrice: 32000,
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500',
    stock: 0, // Tạm hết
    isVisible: true,
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
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: 'CAKE',
    basePrice: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    stock: 20,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000011',
    name: 'Trà sữa matcha',
    category: 'MILK_TEA',
    basePrice: 42000,
    imageUrl: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=500',
    stock: 0, // Tạm hết và đang ẩn
    isVisible: false,
  },
  {
    id: '11111111-0000-0000-0000-000000000012',
    name: 'Hồng trà kem cheese',
    category: 'TEA',
    basePrice: 45000,
    imageUrl: MOCK_DEFAULT_PRODUCT_IMAGE,
    stock: 999,
    isVisible: false, // Món ẩn đang còn bán
  },
];

function toPublicProduct(item: ProductManage): Product {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    basePrice: item.basePrice,
    imageUrl: item.imageUrl,
    stock: item.stock,
  };
}

export const MOCK_PRODUCTS: Product[] = MOCK_SEED_MANAGE_PRODUCTS.filter(
  (p) => p.isVisible
).map(toPublicProduct);

const mockManageProductsDb: ProductManage[] = MOCK_SEED_MANAGE_PRODUCTS.map((item) => ({
  ...item,
}));

export function resetMockProductsDatabase(): void {
  mockManageProductsDb.splice(
    0,
    mockManageProductsDb.length,
    ...MOCK_SEED_MANAGE_PRODUCTS.map((item) => ({ ...item }))
  );
}

function generateMockProductId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `11111111-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;
}

export async function mockGetProducts(params?: GetProductsParams): Promise<Product[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  let results = mockManageProductsDb.filter((p) => p.isVisible).map(toPublicProduct);

  if (params?.category) {
    results = results.filter((p) => p.category === params.category);
  }

  if (params?.q && params.q.trim()) {
    const qLower = params.q.trim().toLowerCase();
    results = results.filter((p) => p.name.toLowerCase().includes(qLower));
  }

  return results;
}

export async function mockGetProductById(id: string): Promise<ProductDetail | null> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const product = mockManageProductsDb.find((p) => p.id === id && p.isVisible);
  if (!product) return null;

  const isCake = product.category === 'CAKE';

  return {
    ...toPublicProduct(product),
    sizes: isCake ? [] : MOCK_SIZES,
    sugarLevels: isCake ? [] : MOCK_SUGAR_LEVELS,
    iceLevels: isCake ? [] : MOCK_ICE_LEVELS,
    toppings: isCake ? [] : MOCK_TOPPINGS,
  };
}

/**
 * Giả lập GET /products/manage (trả mọi món kể cả món ẩn, sắp xếp theo category rồi name)
 */
export async function mockGetManageProducts(): Promise<ProductManage[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  return [...mockManageProductsDb]
    .sort((a, b) => {
      const catCompare = a.category.localeCompare(b.category);
      if (catCompare !== 0) return catCompare;
      return a.name.localeCompare(b.name, 'vi');
    })
    .map((item) => ({ ...item }));
}

function validateImageUrl(imageUrl: string): string | null {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    return 'imageUrl must be shorter than or equal to 500 characters';
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return 'imageUrl must start with http:// or https://';
  }
  return null;
}

/**
 * Giả lập POST /products (ADMIN)
 */
export async function mockCreateProduct(dto: CreateProductDto): Promise<ProductManage> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  const errors: string[] = [];
  const trimmedName = (dto.name || '').trim();
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    errors.push('name must be between 1 and 100 characters');
  }
  if (!VALID_CATEGORIES.includes(dto.category)) {
    errors.push('category must be one of TEA, COFFEE, MILK_TEA, CAKE');
  }
  if (
    typeof dto.basePrice !== 'number' ||
    !Number.isInteger(dto.basePrice) ||
    dto.basePrice < 1000 ||
    dto.basePrice > 1000000
  ) {
    errors.push('basePrice must be an integer between 1000 and 1000000');
  }
  if (dto.imageUrl !== undefined) {
    const imgErr = validateImageUrl(dto.imageUrl);
    if (imgErr) errors.push(imgErr);
  }

  if (errors.length > 0) {
    throw new ApiHttpError({
      statusCode: 400,
      message: errors,
      error: 'Bad Request',
    });
  }

  const resolvedImage =
    dto.imageUrl && dto.imageUrl.trim() ? dto.imageUrl.trim() : MOCK_DEFAULT_PRODUCT_IMAGE;

  const newProduct: ProductManage = {
    id: generateMockProductId(),
    name: trimmedName,
    category: dto.category,
    basePrice: dto.basePrice,
    imageUrl: resolvedImage,
    stock: 999,
    isVisible: true,
  };

  mockManageProductsDb.push(newProduct);
  return { ...newProduct };
}

/**
 * Giả lập PATCH /products/:id (ADMIN)
 */
export async function mockUpdateProduct(
  id: string,
  dto: UpdateProductDto
): Promise<ProductManage> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  const product = mockManageProductsDb.find((p) => p.id === id);
  if (!product) {
    throw new ApiHttpError({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
      error: 'Not Found',
    });
  }

  const errors: string[] = [];
  const hasAnyField =
    dto.name !== undefined ||
    dto.category !== undefined ||
    dto.basePrice !== undefined ||
    dto.imageUrl !== undefined ||
    dto.isVisible !== undefined;

  if (!hasAnyField) {
    errors.push('At least one field must be provided');
  }
  if (dto.name !== undefined) {
    const trimmed = dto.name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      errors.push('name must be between 1 and 100 characters');
    }
  }
  if (dto.category !== undefined && !VALID_CATEGORIES.includes(dto.category)) {
    errors.push('category must be one of TEA, COFFEE, MILK_TEA, CAKE');
  }
  if (
    dto.basePrice !== undefined &&
    (typeof dto.basePrice !== 'number' ||
      !Number.isInteger(dto.basePrice) ||
      dto.basePrice < 1000 ||
      dto.basePrice > 1000000)
  ) {
    errors.push('basePrice must be an integer between 1000 and 1000000');
  }
  if (dto.imageUrl !== undefined) {
    const imgErr = validateImageUrl(dto.imageUrl);
    if (imgErr) errors.push(imgErr);
  }
  if (dto.isVisible !== undefined && typeof dto.isVisible !== 'boolean') {
    errors.push('isVisible must be a boolean value');
  }

  if (errors.length > 0) {
    throw new ApiHttpError({
      statusCode: 400,
      message: errors,
      error: 'Bad Request',
    });
  }

  if (dto.name !== undefined) product.name = dto.name.trim();
  if (dto.category !== undefined) product.category = dto.category;
  if (dto.basePrice !== undefined) product.basePrice = dto.basePrice;
  if (dto.imageUrl !== undefined) {
    product.imageUrl = dto.imageUrl.trim() ? dto.imageUrl.trim() : MOCK_DEFAULT_PRODUCT_IMAGE;
  }
  if (dto.isVisible !== undefined) product.isVisible = dto.isVisible;

  return { ...product };
}

/**
 * Giả lập PATCH /products/:id/availability (STAFF, ADMIN)
 */
export async function mockUpdateProductAvailability(
  id: string,
  isAvailable: boolean
): Promise<ProductManage> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (typeof isAvailable !== 'boolean') {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['isAvailable must be a boolean value'],
      error: 'Bad Request',
    });
  }

  const product = mockManageProductsDb.find((p) => p.id === id);
  if (!product) {
    throw new ApiHttpError({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
      error: 'Not Found',
    });
  }

  product.stock = isAvailable ? 999 : 0;
  return { ...product };
}
