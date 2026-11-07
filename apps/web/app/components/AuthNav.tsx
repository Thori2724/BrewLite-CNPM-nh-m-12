'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

/**
 * Phần xác thực trên header:
 * - Đang kiểm tra (chưa đọc xong localStorage): hiện khung trống mờ, tránh nhấp nháy sai nội dung.
 * - Chưa đăng nhập: liên kết "Đăng nhập" và "Đăng ký".
 * - Đã đăng nhập: tên người dùng và nút "Đăng xuất".
 */
export default function AuthNav() {
  const { user, isAuthenticated, isHydrated, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    // Chỉ xóa phiên đăng nhập (brewlite_auth_v1), giỏ hàng brewlite_cart_v1 giữ nguyên
    logout();
    router.push('/');
  };

  if (!isHydrated) {
    return (
      <div
        data-testid="auth-nav-skeleton"
        aria-hidden="true"
        className="h-7 w-32 rounded-lg bg-white/20 animate-pulse"
      />
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate max-w-[9rem]" title={user.fullName}>
          <span className="sr-only">Đang đăng nhập với tên </span>
          {user.fullName}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Đăng xuất khỏi tài khoản"
          className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition cursor-pointer"
        >
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        aria-label="Đăng nhập tài khoản"
        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition"
      >
        Đăng nhập
      </Link>
      <Link
        href="/register"
        aria-label="Đăng ký tài khoản mới"
        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white text-amber-700 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition"
      >
        Đăng ký
      </Link>
    </div>
  );
}

