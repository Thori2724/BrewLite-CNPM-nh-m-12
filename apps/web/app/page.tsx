'use client';

import { useEffect, useState } from 'react';
import { getProducts, Product, ProductCategory } from '../services/api';
import ProductCard from './components/ProductCard';

interface CategoryTab {
  id: ProductCategory | 'ALL';
  name: string;
}

const CATEGORIES: CategoryTab[] = [
  { id: 'ALL', name: 'Tất cả' },
  { id: 'TEA', name: 'Trà' },
  { id: 'COFFEE', name: 'Cà phê' },
  { id: 'MILK_TEA', name: 'Trà sữa' },
  { id: 'CAKE', name: 'Bánh' },
];

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'ALL'>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  // 1. Debounce ô tìm kiếm 300ms bằng setTimeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // 2. Tải danh sách món theo danh mục và từ khóa tìm kiếm
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const categoryParam = selectedCategory === 'ALL' ? undefined : selectedCategory;
        const qParam = debouncedQuery.trim() ? debouncedQuery.trim() : undefined;

        const data = await getProducts({
          category: categoryParam,
          q: qParam,
        });

        if (!isCancelled) {
          setProducts(data);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message =
            err instanceof Error
              ? err.message
              : 'Không thể tải danh sách món. Vui lòng thử lại sau!';
          setError(message);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [selectedCategory, debouncedQuery]);

  const handleRetry = async () => {
    try {
      setLoading(true);
      setError(null);
      const categoryParam = selectedCategory === 'ALL' ? undefined : selectedCategory;
      const qParam = debouncedQuery.trim() ? debouncedQuery.trim() : undefined;
      const data = await getProducts({ category: categoryParam, q: qParam });
      setProducts(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Không thể tải danh sách món. Vui lòng thử lại sau!';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Ô tìm kiếm */}
      <div className="relative">
        <input
          type="text"
          placeholder="Tìm kiếm món ăn, đồ uống..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Thanh lọc danh mục */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition ${
              selectedCategory === cat.id
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
          <div className="animate-spin inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mb-2" />
          <p>Đang tải danh sách món...</p>
        </div>
      )}

      {/* Trạng thái Error (Lỗi) */}
      {error && !loading && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center text-sm space-y-3">
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Trạng thái Empty (Không có sản phẩm) */}
      {!loading && !error && products.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <span className="text-3xl block mb-2">🔍</span>
          <p>Không tìm thấy món phù hợp</p>
        </div>
      )}

      {/* Lưới hiển thị sản phẩm */}
      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
