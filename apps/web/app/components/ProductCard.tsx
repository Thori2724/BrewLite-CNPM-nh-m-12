import Link from 'next/link';
import { Product } from '../../services/api';
import { formatVnd } from '../../utils/validation';

interface ProductCardProps {
  product: Product;
}

const CATEGORY_LABELS: Record<string, string> = {
  COFFEE: 'Cà phê',
  TEA: 'Trà',
  MILK_TEA: 'Trà sữa',
  CAKE: 'Bánh',
};

export default function ProductCard({ product }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0;
  const categoryLabel = CATEGORY_LABELS[product.category] || product.category;

  return (
    <div
      className={`group relative overflow-hidden rounded-card border border-tan/60 bg-cream shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-raised flex flex-col justify-between ${
        isOutOfStock ? 'opacity-80' : ''
      }`}
    >
      <Link href={`/menu/${product.id}`} className="block">
        {/* Hình ảnh sản phẩm */}
        <div className="relative w-full h-40 sm:h-44 lg:h-48 bg-bone overflow-hidden">
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover transition duration-300 group-hover:scale-105 ${
              isOutOfStock ? 'grayscale opacity-60' : ''
            }`}
          />
          {/* Nhãn danh mục */}
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-cream/90 px-2.5 py-0.5 text-xs font-semibold text-kombu backdrop-blur-xs border border-tan/50">
            {categoryLabel}
          </span>
          {/* Nhãn Hết hàng */}
          {isOutOfStock && (
            <span className="absolute top-2.5 right-2.5 bg-error text-bone text-xs px-2.5 py-1 rounded-control font-semibold shadow-xs">
              Hết hàng
            </span>
          )}
        </div>

        {/* Thông tin sản phẩm */}
        <div className="p-3.5 sm:p-4">
          <h3 className="font-display font-bold text-noir text-sm sm:text-base line-clamp-2 break-words group-hover:text-moss transition">
            {product.name}
          </h3>
          <p className="text-kombu font-bold text-sm sm:text-base mt-1.5">
            {formatVnd(product.basePrice)}
          </p>
        </div>
      </Link>

      {/* Nút thêm món */}
      <div className="p-3.5 sm:p-4 pt-0">
        <Link href={!isOutOfStock ? `/menu/${product.id}` : '#'} className="block">
          <button
            type="button"
            disabled={isOutOfStock}
            className={`w-full py-2.5 rounded-control text-xs sm:text-sm font-semibold transition ${
              !isOutOfStock
                ? 'bg-kombu text-bone hover:bg-moss active:scale-98 cursor-pointer shadow-xs'
                : 'bg-tan/40 text-noir/40 cursor-not-allowed pointer-events-none'
            }`}
          >
            {!isOutOfStock ? '+ Thêm' : 'Tạm hết'}
          </button>
        </Link>
      </div>
    </div>
  );
}
