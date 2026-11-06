import Image from 'next/image';
import { Product } from '../../services/api';

interface ProductCardProps {
    product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col justify-between relative">
            <div>
                {/* Hình ảnh sản phẩm */}
                <div className="relative w-full h-36 bg-gray-100">
                    <img
                        src={product.image}
                        alt={product.name}
                        className={`w-full h-full object-cover ${!product.isAvailable ? 'grayscale opacity-60' : ''}`}
                    />
                    {/* Nhãn Hết hàng (Task 12) */}
                    {!product.isAvailable && (
                        <span className="absolute top-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded font-semibold">
                            Hết hàng
                        </span>
                    )}
                </div>

                {/* Thông tin sản phẩm */}
                <div className="p-3">
                    <h3 className="font-semibold text-gray-800 text-sm line-clamp-1">{product.name}</h3>
                    <p className="text-amber-600 font-bold text-sm mt-1">
                        {product.price.toLocaleString('vi-VN')} đ
                    </p>
                </div>
            </div>

            {/* Nút thêm món */}
            <div className="p-3 pt-0">
                <button
                    disabled={!product.isAvailable}
                    className={`w-full py-1.5 rounded-lg text-xs font-semibold transition ${product.isAvailable
                        ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {product.isAvailable ? '+ Thêm' : 'Tạm hết'}
                </button>
            </div>
        </div>
    );
}