'use client';

import Link from 'next/link';
import { useCart } from '../../context/CartContext';

export default function CartIcon() {
  const { totalCount, isHydrated } = useCart();

  // Chỉ hiển thị số sau khi đã nạp dữ liệu từ localStorage (tránh nhảy số khi hydrate)
  const displayCount = isHydrated ? totalCount : 0;

  return (
    <Link
      href="/cart"
      aria-label={`Giỏ hàng${displayCount > 0 ? `, ${displayCount} ly` : ', trống'}`}
      className="relative cursor-pointer inline-flex items-center"
    >
      <span className="text-2xl" role="img" aria-hidden="true">🛒</span>
      {/* Badge số lượng: hiển thị kể cả khi = 0 để giữ layout ổn định */}
      <span
        className={`absolute -top-1 -right-2 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center transition-colors ${
          displayCount > 0 ? 'bg-red-500' : 'bg-gray-400'
        }`}
      >
        {displayCount > 9 ? '9+' : displayCount}
      </span>
    </Link>
  );
}

