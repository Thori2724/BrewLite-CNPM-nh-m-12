'use client';

import { useEffect, useState } from 'react';
import { getProducts, Product } from '../services/api';
import ProductCard from './components/ProductCard';

const CATEGORIES = [
  { id: 'ALL', name: 'Tất cả' },
  { id: 'Ca phe', name: 'Cà phê' },
  { id: 'Tra sua', name: 'Trà sữa' },
  { id: 'Tra', name: 'Trà trái cây' },
  { id: 'Banh', name: 'Bánh ngọt' },
];

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await getProducts();
        setProducts(data);
      } catch (err) {
        setError('Không thể tải danh sách món. Vui lòng thử lại sau!');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Lọc sản phẩm theo danh mục và tìm kiếm
  const filteredProducts = products.filter((item) => {
    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Ô tìm kiếm */}
      <div className="relative">
        <input
          type="text"
          placeholder="Tìm kiếm món ăn, đồ uống..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Thanh lọc danh mục */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition ${selectedCategory === cat.id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Trạng thái Loading (Đang tải) */}
      {loading && (
        <div className="text-center py-12 text-gray-500 text-sm">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mb-2"></div>
          <p>Đang tải danh sách món...</p>
        </div>
      )}

      {/* Trạng thái Error (Lỗi) */}
      {error && !loading && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center text-sm">
          {error}
        </div>
      )}

      {/* Trạng thái Empty (Không có sản phẩm) */}
      {!loading && !error && filteredProducts.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <span className="text-3xl block mb-2">🔍</span>
          <p>Không tìm thấy món phù hợp</p>
        </div>
      )}

      {/* Lưới hiển thị sản phẩm (Grid 2 cột di động) */}
      {!loading && !error && filteredProducts.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}