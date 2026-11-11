'use client';

import { useEffect, useState } from 'react';
import { getProducts, Product, ProductCategory } from '../services/api';
import ProductCard from './components/ProductCard';
import { SearchIcon } from './components/Icons';

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
    <div className="space-y-8">
      {/* Khối đầu trang (Hero) */}
      <section className="rounded-card border border-tan/60 bg-cream p-6 sm:p-10 shadow-soft">
        <div className="max-w-2xl">
          <span className="inline-block rounded-full bg-tan/60 px-3.5 py-1 text-xs font-bold tracking-wider text-kombu">
            THỰC ĐƠN BREWLITE
          </span>
          <h1 className="mt-3 font-display text-2xl sm:text-4xl font-bold tracking-tight text-noir">
            Một ly cà phê, một ngày trọn vẹn
          </h1>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-noir/70">
            Tuyển chọn các món cà phê, trà và bánh mộc mạc, được chăm chút kỹ lưỡng từ nguyên liệu đến từng giọt chiết xuất.
          </p>
        </div>
      </section>

      {/* Thanh lọc danh mục và Ô tìm kiếm */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-cream p-3.5 sm:p-4 rounded-card border border-tan/60 shadow-soft">
        {/* Thanh lọc danh mục */}
        <div
          className="flex gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none"
          aria-label="Lọc theo danh mục"
        >
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-control whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-kombu text-bone shadow-xs'
                    : 'bg-bone text-noir hover:bg-tan/40'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Ô tìm kiếm */}
        <div className="relative w-full md:w-72 lg:w-80 shrink-0">
          <label htmlFor="menu-search" className="sr-only">
            Tìm kiếm món ăn, đồ uống
          </label>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-noir/50" />
          <input
            id="menu-search"
            type="text"
            placeholder="Tìm kiếm món ăn, đồ uống..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-cream border border-tan rounded-control text-sm text-noir placeholder:text-noir/50 shadow-soft outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/30"
          />
        </div>
      </div>

      {/* Trạng thái Loading (Đang tải) */}
      {loading && (
        <div className="max-w-md mx-auto text-center py-16 text-noir/70 text-sm">
          <div className="animate-spin inline-block w-8 h-8 border-3 border-kombu border-t-transparent rounded-full mb-3" />
          <p>Đang tải danh sách món...</p>
        </div>
      )}

      {/* Trạng thái Error (Lỗi) */}
      {error && !loading && (
        <div
          role="alert"
          className="max-w-md mx-auto bg-cream border border-error/40 text-error p-6 rounded-card text-center text-sm space-y-3 shadow-soft"
        >
          <p className="font-medium text-noir">{error}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="px-5 py-2 bg-kombu text-bone text-xs sm:text-sm font-semibold rounded-control hover:bg-moss transition cursor-pointer"
            >
              Thử lại
            </button>
            {(selectedCategory !== 'ALL' || searchInput.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSearchInput('');
                  setDebouncedQuery('');
                }}
                className="px-4 py-2 bg-bone text-noir border border-tan text-xs sm:text-sm font-semibold rounded-control hover:bg-tan/40 transition cursor-pointer"
              >
                Quay về Tất cả
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trạng thái Empty (Không có sản phẩm) */}
      {!loading && !error && products.length === 0 && (
        <div className="max-w-md mx-auto bg-cream border border-tan/60 rounded-card text-center py-14 px-4 text-noir/60 text-sm shadow-soft">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-tan/40 text-kombu mb-3">
            <SearchIcon className="size-6" />
          </div>
          <p className="font-semibold text-base text-noir">Không tìm thấy món phù hợp</p>
        </div>
      )}

      {/* Lưới hiển thị sản phẩm: 1 cột màn nhỏ (<640px), 2 cột sm, 3 cột tablet (md), 4 cột desktop (lg) */}
      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
