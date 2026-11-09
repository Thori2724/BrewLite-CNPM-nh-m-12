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
    <div className="space-y-6">
      {/* Thanh lọc danh mục và Ô tìm kiếm (cùng một hàng trên desktop) */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
        {/* Thanh lọc danh mục */}
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-full whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Ô tìm kiếm */}
        <div className="relative w-full md:w-72 lg:w-80 shrink-0">
          <input
            type="text"
            placeholder="Tìm kiếm món ăn, đồ uống..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Trạng thái Loading (Đang tải) */}
      {loading && (
        <div className="max-w-md mx-auto text-center py-16 text-gray-500 text-sm">
          <div className="animate-spin inline-block w-7 h-7 border-2 border-amber-600 border-t-transparent rounded-full mb-3" />
          <p>Đang tải danh sách món...</p>
        </div>
      )}

      {/* Trạng thái Error (Lỗi) */}
      {error && !loading && (
        <div className="max-w-md mx-auto bg-red-50 border border-red-100 text-red-600 p-6 rounded-2xl text-center text-sm space-y-3">
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-5 py-2 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-xl hover:bg-red-700 transition cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Trạng thái Empty (Không có sản phẩm) */}
      {!loading && !error && products.length === 0 && (
        <div className="max-w-md mx-auto bg-white border border-gray-100 rounded-2xl text-center py-14 px-4 text-gray-400 text-sm shadow-xs">
          <span className="text-4xl block mb-2">🔍</span>
          <p>Không tìm thấy món phù hợp</p>
        </div>
      )}

      {/* Lưới hiển thị sản phẩm: 2 cột điện thoại, 3 cột tablet, 4 cột desktop */}
      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
