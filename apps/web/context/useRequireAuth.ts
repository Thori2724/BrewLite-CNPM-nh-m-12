'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { getSafeRedirectUrl } from '../utils/auth';

export interface UseRequireAuthOptions {
  skipRedirect?: boolean;
}

/**
 * Bảo vệ trang cần đăng nhập (dành cho Task 17/18).
 *
 * Cách dùng trong một trang client:
 *   const { isReady } = useRequireAuth();
 *   if (!isReady) return <p>Đang kiểm tra đăng nhập...</p>;
 *
 * - Đang đọc phiên từ localStorage: isChecking = true, không chuyển trang.
 * - Chưa đăng nhập: chuyển sang /login?redirect=<trang hiện tại> (trừ khi `skipRedirect: true`).
 * - Đã đăng nhập: isReady = true.
 *
 * Lưu ý: đây chỉ là chặn ở giao diện. Kiểm tra quyền thật sự do server (trả 401).
 */
export function useRequireAuth(options?: UseRequireAuthOptions) {
  const skipRedirect = options?.skipRedirect ?? false;
  const { user, isAuthenticated, isHydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isHydrated || isAuthenticated || skipRedirect) return;

    // Đọc đường dẫn hiện tại trong effect (chỉ chạy trên trình duyệt)
    const currentPath = getSafeRedirectUrl(
      window.location.pathname + window.location.search,
      '/'
    );
    router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }, [isHydrated, isAuthenticated, skipRedirect, router]);

  return {
    user,
    isChecking: !isHydrated,
    isReady: isHydrated && isAuthenticated,
  };
}

