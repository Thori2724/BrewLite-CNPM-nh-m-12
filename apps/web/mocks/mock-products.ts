import {
  GetProductsParams,
  IceOption,
  Product,
  ProductDetail,
  ProductTopping,
  SizeOption,
  SugarOption,
} from '../services/api';

/**
 * Kiểm tra xem có đang bật chế độ Mock Sản phẩm hay không
 */
export function isMockProductsActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS === 'true';
}

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

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '11111111-0000-0000-0000-000000000001',
    name: 'Cà phê sữa đá',
    category: 'COFFEE',
    basePrice: 29000,
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
    stock: 50,
  },
  {
    id: '11111111-0000-0000-0000-000000000003',
    name: 'Bạc xỉu',
    category: 'COFFEE',
    basePrice: 32000,
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500',
    stock: 0, // Món hết hàng để test nhãn "Hết hàng" (Task 12)
  },
  {
    id: '11111111-0000-0000-0000-000000000004',
    name: 'Trà đào cam sả',
    category: 'TEA',
    basePrice: 39000,
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    stock: 35,
  },
  {
    id: '11111111-0000-0000-0000-000000000007',
    name: 'Trà sữa truyền thống',
    category: 'MILK_TEA',
    basePrice: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
    stock: 40,
  },
  {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: 'CAKE',
    basePrice: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    stock: 20,
  },
];

export async function mockGetProducts(params?: GetProductsParams): Promise<Product[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  let results = [...MOCK_PRODUCTS];

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

  const product = MOCK_PRODUCTS.find((p) => p.id === id);
  if (!product) return null;

  const isCake = product.category === 'CAKE';

  return {
    ...product,
    sizes: isCake ? [] : MOCK_SIZES,
    sugarLevels: isCake ? [] : MOCK_SUGAR_LEVELS,
    iceLevels: isCake ? [] : MOCK_ICE_LEVELS,
    toppings: isCake ? [] : MOCK_TOPPINGS,
  };
}
