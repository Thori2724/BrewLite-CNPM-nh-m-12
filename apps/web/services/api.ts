export interface Product {
  id: string;
  name: string;
  category: 'Tra' | 'Ca phe' | 'Tra sua' | 'Banh';
  price: number;
  image: string;
  isAvailable: boolean;
}

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Cà phê sữa đá',
    category: 'Ca phe',
    price: 29000,
    image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500',
    isAvailable: true,
  },
  {
    id: '2',
    name: 'Bạc xỉu',
    category: 'Ca phe',
    price: 29000,
    image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=500',
    isAvailable: true,
  },
  {
    id: '3',
    name: 'Trà đào cam sả',
    category: 'Tra',
    price: 35000,
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    isAvailable: false,
  },
  {
    id: '4',
    name: 'Trà sữa trân châu đen',
    category: 'Tra sua',
    price: 39000,
    image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
    isAvailable: true,
  },
  {
    id: '5',
    name: 'Bánh croissant phô mai',
    category: 'Banh',
    price: 25000,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    isAvailable: true,
  },
];

export async function getProducts(): Promise<Product[]> {
  // Giả lập delay mạng 300ms
  await new Promise((resolve) => setTimeout(resolve, 300));
  return MOCK_PRODUCTS;
}