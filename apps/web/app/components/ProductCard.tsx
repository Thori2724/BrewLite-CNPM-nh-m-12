import Link from 'next/link';
import { Product } from '../../services/api';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0;

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-gray-100 overflow-hidden flex flex-col justify-between relative hover:shadow-md transition">
      <Link href={`/menu/${product.id}`} className="block group">
        {/* Hình ảnh sản phẩm */}
        <div className="relative w-full h-36 sm:h-44 lg:h-48 bg-gray-100 overflow-hidden">
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover transition group-hover:scale-105 duration-200 ${
              isOutOfStock ? 'grayscale opacity-60' : ''
            }`}
          />
          {/* Nhãn Hết hàng (Task 12) */}
          {isOutOfStock && (
            <span className="absolute top-2.5 right-2.5 bg-gray-800 text-white text-xs px-2.5 py-1 rounded-md font-semibold shadow-xs">
              Hết hàng
            </span>
          )}
        </div>

        {/* Thông tin sản phẩm */}
        <div className="p-3 sm:p-4">
          <h3 className="font-semibold text-gray-800 text-sm sm:text-base line-clamp-1 group-hover:text-amber-600 transition">
            {product.name}
          </h3>
          <p className="text-amber-600 font-bold text-sm sm:text-base mt-1">
            {product.basePrice.toLocaleString('vi-VN')} đ
          </p>
        </div>
      </Link>

      {/* Nút thêm món */}
      <div className="p-3 sm:p-4 pt-0">
        <Link href={!isOutOfStock ? `/menu/${product.id}` : '#'} className="block">
          <button
            type="button"
            disabled={isOutOfStock}
            className={`w-full py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              !isOutOfStock
                ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed pointer-events-none'
            }`}
          >
            {!isOutOfStock ? '+ Thêm' : 'Tạm hết'}
          </button>
        </Link>
      </div>
    </div>
  );
}
