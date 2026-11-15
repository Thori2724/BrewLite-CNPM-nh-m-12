'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { UserIcon } from './Icons';

/**
 * Phần xác thực trên header:
 * - Đang kiểm tra (chưa đọc xong localStorage): hiện khung skeleton mờ, tránh nhấp nháy sai nội dung.
 * - Chưa đăng nhập: liên kết "Đăng nhập" và "Đăng ký".
 * - Đã đăng nhập: tên hiển thị người dùng (displayName) và nút "Đăng xuất".
 */
export default function AuthNav() {
  const { user, isAuthenticated, isHydrated, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    // Chỉ xóa phiên đăng nhập (brewlite_auth_v2), giỏ hàng brewlite_cart_v2 giữ nguyên
    logout();
    router.push('/');
  };

  if (!isHydrated) {
    return (
      <div
        data-testid="auth-nav-skeleton"
        aria-hidden="true"
        className="h-8 w-28 rounded-control bg-moss/30 animate-pulse"
      />
    );
  }

  if (isAuthenticated && user) {
    const initials = user.displayName
      ? user.displayName
          .trim()
          .split(/\s+/)
          .slice(-2)
          .map((part) => part[0])
          .join('')
          .toLocaleUpperCase('vi')
      : 'U';

    return (
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Link
          href="/orders"
          className="shrink-0 text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-control text-bone hover:text-tan hover:bg-moss/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss whitespace-nowrap"
        >
          Đơn của tôi
        </Link>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-control bg-moss/25 border border-moss/35 min-w-0">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-bone text-[11px] font-bold text-kombu">
            {initials}
          </span>
          <span
            className="text-xs sm:text-sm font-medium text-bone truncate max-w-[5.5rem] sm:max-w-[8rem]"
            title={user.displayName}
          >
            <span className="sr-only">Đang đăng nhập với tên </span>
            {user.displayName}
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Đăng xuất khỏi tài khoản"
          className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-control bg-error/90 hover:bg-error text-bone transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
        >
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Link
        href="/login"
        aria-label="Đăng nhập tài khoản"
        className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-control text-bone hover:text-tan hover:bg-moss/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss whitespace-nowrap"
      >
        <UserIcon className="size-4 shrink-0" />
        <span>Đăng nhập</span>
      </Link>
      <Link
        href="/register"
        aria-label="Đăng ký tài khoản mới"
        className="text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-control bg-tan text-noir hover:bg-cream transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss whitespace-nowrap"
      >
        Đăng ký
      </Link>
    </div>
  );
}
