import { MOCK_PRODUCTS, Product } from '../data/mock-products';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function getProducts(): Promise<Product[]> {
    try {
        // Khi Backend chưa xong API, chúng ta dùng MOCK_PRODUCTS để phát triển Frontend trước
        return MOCK_PRODUCTS;

        /* Sau này khi Backend hoàn thiện API GET /products, chỉ cần mở đoạn code bên dưới ra:
        const res = await fetch(`${API_URL}/products`);
        if (!res.ok) throw new Error('Không thể tải danh sách sản phẩm');
        return await res.json();
        */
    } catch (error) {
        console.error('Lỗi lấy dữ liệu sản phẩm:', error);
        throw error;
    }
}