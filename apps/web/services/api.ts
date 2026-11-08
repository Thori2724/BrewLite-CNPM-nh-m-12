import {
  isMockProductsActive,
  MOCK_PRODUCTS,
  mockGetProducts,
  mockGetProductById,
} from '../mocks/mock-products';

export interface Product {
  id: string;
  name: string;
  category: 'Tra' | 'Ca phe' | 'Tra sua' | 'Banh';
  price: number;
  image: string;
  isAvailable: boolean;
  description?: string;
}

export type SizeId = 'S' | 'M' | 'L';
export type SugarLevel = '0%' | '30%' | '50%' | '70%' | '100%';
export type IceLevel = 'NONE' | 'LOW' | 'NORMAL' | 'FULL';

export interface SizeOption {
  id: SizeId;
  name: string;
  priceDiff: number;
}

export interface Topping {
  id: string;
  name: string;
  price: number;
}

export interface ProductDetail extends Product {
  description: string;
  allowIce: boolean;
  allowSugar: boolean;
  allowSize: boolean;
  allowTopping: boolean;
}

export const SIZES: SizeOption[] = [
  { id: 'S', name: 'Nhỏ (S)', priceDiff: 0 },
  { id: 'M', name: 'Vừa (M)', priceDiff: 5000 },
  { id: 'L', name: 'Lớn (L)', priceDiff: 10000 },
];

export const SUGAR_LEVELS: { id: SugarLevel; label: string }[] = [
  { id: '0%', label: '0% (Không đường)' },
  { id: '30%', label: '30% (Ít đường)' },
  { id: '50%', label: '50% (Vừa)' },
  { id: '70%', label: '70% (Nhiều đường)' },
  { id: '100%', label: '100% (Bình thường)' },
];

export const ICE_LEVELS: { id: IceLevel; label: string }[] = [
  { id: 'NONE', label: 'Không đá' },
  { id: 'LOW', label: 'Ít đá' },
  { id: 'NORMAL', label: 'Bình thường' },
  { id: 'FULL', label: 'Nhiều đá' },
];

export const TOPPINGS: Topping[] = [
  { id: 'top-1', name: 'Trân châu đen', price: 5000 },
  { id: 'top-2', name: 'Trân châu trắng', price: 7000 },
  { id: 'top-3', name: 'Thạch sương sáo', price: 5000 },
  { id: 'top-4', name: 'Kem cheese', price: 10000 },
];

// Re-export để tương thích các component và test hiện hữu
export { isMockProductsActive, MOCK_PRODUCTS };

export async function getProducts(): Promise<Product[]> {
  if (isMockProductsActive()) {
    return mockGetProducts();
  }

  // TODO (Phần B): Gọi fetch thật GET /products tới NEXT_PUBLIC_API_URL khi kết nối backend
  return mockGetProducts();
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  if (isMockProductsActive()) {
    return mockGetProductById(id);
  }

  // TODO (Phần B): Gọi fetch thật GET /products/:id tới NEXT_PUBLIC_API_URL khi kết nối backend
  return mockGetProductById(id);
}
