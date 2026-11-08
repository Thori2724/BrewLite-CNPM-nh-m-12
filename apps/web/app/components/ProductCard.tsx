import Link from 'next/link';
import { Product } from '../../services/api';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col justify-between relative hover:shadow-md transition">
      <Link href={`/menu/${product.id}`} className="block group">
        {/* Hình ảnh sản phẩm */}
        <div className="relative w-full h-36 bg-gray-100">
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover transition group-hover:scale-105 duration-200 ${
              isOutOfStock ? 'grayscale opacity-60' : ''
            }`}
          />
          {/* Nhãn Hết hàng (Task 12) */}
          {isOutOfStock && (
            <span className="absolute top-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded font-semibold">
              Hết hàng
            </span>
          )}
        </div>

        {/* Thông tin sản phẩm */}
        <div className="p-3">
          <h3 className="font-semibold text-gray-800 text-sm line-clamp-1 group-hover:text-amber-600 transition">
            {product.name}
          </h3>
          <p className="text-amber-600 font-bold text-sm mt-1">
            {product.basePrice.toLocaleString('vi-VN')} đ
          </p>
        </div>
      </Link>

      {/* Nút thêm món */}
      <div className="p-3 pt-0">
        <Link href={!isOutOfStock ? `/menu/${product.id}` : '#'} className="block">
          <button
            type="button"
            disabled={isOutOfStock}
            className={`w-full py-1.5 rounded-lg text-xs font-semibold transition ${
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
