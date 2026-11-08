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
        price: 25000,
        image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500',
        isAvailable: true,
    },
    {
        id: '2',
        name: 'Trà sữa truyền thống',
        category: 'Tra sua',
        price: 35000,
        image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
        isAvailable: true,
    },
    {
        id: '3',
        name: 'Trà đào cam sả',
        category: 'Tra',
        price: 30000,
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500',
        isAvailable: false, // Món này hết hàng để test nhãn "Hết hàng" ở Task 12
    },
    {
        id: '4',
        name: 'Bánh Tiramisu',
        category: 'Banh',
        price: 40000,
        image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=500',
        isAvailable: true,
    },
];