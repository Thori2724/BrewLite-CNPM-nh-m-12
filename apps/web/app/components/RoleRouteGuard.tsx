'use client';

import React, { Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { getRoleRouteRedirect, isStaffPath } from '../../utils/auth';

function GuardLoadingState({
  label,
  testId,
}: {
  label: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm"
    >
      <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full mb-2" />
      <p>{label}</p>
    </div>
  );
}

function RoleRouteGuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { user, isAuthenticated, isHydrated } = useAuth();

  const currentRole = isAuthenticated && user ? user.role : null;
  const redirectTarget = isHydrated ? getRoleRouteRedirect(pathname, currentRole) : null;
  const isCheckingStaffRoute = !isHydrated && isStaffPath(pathname);

  useEffect(() => {
    if (!isHydrated || !redirectTarget) return;
    router.replace(redirectTarget);
  }, [isHydrated, redirectTarget, router]);

  if (isCheckingStaffRoute) {
    return (
      <GuardLoadingState
        testId="role-guard-checking"
        label="Đang kiểm tra quyền truy cập..."
      />
    );
  }

  if (redirectTarget) {
    return (
      <GuardLoadingState
        testId="role-guard-redirecting"
        label="Đang chuyển hướng..."
      />
    );
  }

  return <>{children}</>;
}

/**
 * Lớp bảo vệ route theo vai trò ở cấp layout dùng chung:
 * - Khách chưa đăng nhập hoặc CUSTOMER vào /staff... -> chuyển về /
 * - STAFF (không phải ADMIN) vào /staff/employees -> chuyển về /staff
 * - STAFF/ADMIN mở trang khách (/, /menu/..., /cart, /checkout, /orders...) -> chuyển về /staff
 * - Không chặn khách vãng lai xem Menu (/), chi tiết món (/menu/...) hoặc giỏ hàng (/cart)
 * - Không chặn ở /login, /register, /account
 */
export default function RoleRouteGuard({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<GuardLoadingState label="Đang tải..." />}>
      <RoleRouteGuardInner>{children}</RoleRouteGuardInner>
    </Suspense>
  );
}

