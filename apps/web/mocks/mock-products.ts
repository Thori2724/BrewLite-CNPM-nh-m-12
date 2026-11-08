import { Product, ProductDetail } from '../services/api';

/**
 * Kiểm tra xem có đang bật chế độ Mock Sản phẩm hay không
 */
export function isMockProductsActive(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS === 'true';
}

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

export async function mockGetProducts(): Promise<Product[]> {
  // Giả lập delay mạng 300ms
  await new Promise((resolve) => setTimeout(resolve, 300));
  return MOCK_PRODUCTS;
}

export async function mockGetProductById(id: string): Promise<ProductDetail | null> {
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
