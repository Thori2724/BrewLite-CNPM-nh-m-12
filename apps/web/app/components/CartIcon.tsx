'use client';

import Link from 'next/link';
import { useCart } from '../../context/CartContext';
import { CartIconSvg } from './Icons';

export default function CartIcon() {
  const { totalCount, isHydrated } = useCart();

  // Chỉ hiển thị số sau khi đã nạp dữ liệu từ localStorage (tránh nhảy số khi hydrate)
  const displayCount = isHydrated ? totalCount : 0;

  return (
    <Link
      href="/cart"
      aria-label={`Giỏ hàng${displayCount > 0 ? `, ${displayCount} ly` : ', trống'}`}
      className="relative grid size-10 sm:size-11 shrink-0 place-items-center rounded-control text-bone transition hover:bg-moss/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
    >
      <CartIconSvg className="size-5" />
      {/* Badge số lượng: hiển thị kể cả khi = 0 để giữ layout ổn định và khớp test A9 */}
      <span
        className={`absolute -top-1 -right-1 grid size-5 place-items-center rounded-full text-[11px] font-bold transition duration-300 ${
          displayCount > 0 ? 'bg-tan text-noir' : 'bg-bone/40 text-kombu'
        }`}
      >
        {displayCount > 9 ? '9+' : displayCount}
      </span>
    </Link>
  );
}
