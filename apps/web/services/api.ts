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

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Cà phê sữa đá',
    category: 'Ca phe',
    price: 29000,
    image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500',
    isAvailable: true,
    description: 'Hương vị cà phê Robusta đậm đà truyền thống kết hợp cùng sữa đặc béo ngậy.',
  },
  {
    id: '2',
    name: 'Bạc xỉu',
    category: 'Ca phe',
    price: 29000,
    image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=500',
    isAvailable: true,
    description: 'Nhiều sữa ít cà phê, vị béo thơm ngọt dịu dành cho những ai thích vị cà phê nhẹ nhàng.',
  },
  {
    id: '3',
    name: 'Trà đào cam sả',
    category: 'Tra',
    price: 35000,
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    isAvailable: false,
    description: 'Trà thanh mát quyện cùng hương vị cam vàng mọng nước, sả thơm nồng và miếng đào giòn tan.',
  },
  {
    id: '4',
    name: 'Trà sữa trân châu đen',
    category: 'Tra sua',
    price: 39000,
    image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
    isAvailable: true,
    description: 'Trà đen đậm vị sữa, kết hợp cùng trân châu đen dẻo dai nấu mới trong ngày.',
  },
  {
    id: '5',
    name: 'Bánh croissant phô mai',
    category: 'Banh',
    price: 25000,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    isAvailable: true,
    description: 'Bánh sừng bò ngàn lớp vỏ ngoài giòn rụm, bên trong thơm nức nhân phô mai béo ngậy.',
  },
];

export async function getProducts(): Promise<Product[]> {
  // Giả lập delay mạng 300ms
  await new Promise((resolve) => setTimeout(resolve, 300));
  return MOCK_PRODUCTS;
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  // Giả lập delay mạng 300ms
  await new Promise((resolve) => setTimeout(resolve, 300));
  const product = MOCK_PRODUCTS.find((p) => p.id === id);
  if (!product) return null;

  const isDrink = product.category !== 'Banh';

  return {
    ...product,
    description:
      product.description ||
      'Hương vị thơm ngon độc quyền của BrewLite, được chuẩn bị từ nguyên liệu tươi mới.',
    allowIce: isDrink,
    allowSugar: isDrink,
    allowSize: isDrink,
    allowTopping: isDrink,
  };
}