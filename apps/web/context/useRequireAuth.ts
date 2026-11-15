'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { UserRole } from '../services/auth-contract';
import { getSafeRedirectUrl } from '../utils/auth';

export interface UseRequireAuthOptions {
  skipRedirect?: boolean;
  allowedRoles?: UserRole[];
}

const DEFAULT_ALLOWED_ROLES: UserRole[] = ['CUSTOMER'];

/**
 * Bảo vệ trang cần đăng nhập và đúng vai trò (dành cho Task 17/18).
 *
 * Cách dùng trong một trang client:
 *   const { isReady } = useRequireAuth();
 *   if (!isReady) return <p>Đang kiểm tra đăng nhập...</p>;
 *
 * - Đang đọc phiên từ localStorage: isChecking = true, không chuyển trang.
 * - Chưa đăng nhập: chuyển sang /login?redirect=<trang hiện tại> (trừ khi `skipRedirect: true`).
 * - Đã đăng nhập nhưng sai vai trò (vd STAFF/ADMIN vào trang khách):
 *   isReady = false và chuyển về /staff (hoặc / nếu là CUSTOMER).
 * - Đã đăng nhập và đúng vai trò: isReady = true.
 *
 * Lưu ý: đây chỉ là chặn ở giao diện. Kiểm tra quyền thật sự do server (trả 401/403).
 */
export function useRequireAuth(options?: UseRequireAuthOptions) {
  const skipRedirect = options?.skipRedirect ?? false;
  const allowedRoles = options?.allowedRoles ?? DEFAULT_ALLOWED_ROLES;
  const { user, isAuthenticated, isHydrated } = useAuth();
  const router = useRouter();

  const isRoleAllowed = Boolean(isAuthenticated && user && allowedRoles.includes(user.role));

  useEffect(() => {
    if (!isHydrated || skipRedirect) return;

    if (!isAuthenticated || !user) {
      // Đọc đường dẫn hiện tại trong effect (chỉ chạy trên trình duyệt)
      const currentPath = getSafeRedirectUrl(
        window.location.pathname + window.location.search,
        '/'
      );
      router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (!isRoleAllowed) {
      const target = user.role === 'STAFF' || user.role === 'ADMIN' ? '/staff' : '/';
      router.replace(target);
    }
  }, [isHydrated, isAuthenticated, user, isRoleAllowed, skipRedirect, router]);

  return {
    user,
    isChecking: !isHydrated,
    isReady: isHydrated && isRoleAllowed,
  };
}

