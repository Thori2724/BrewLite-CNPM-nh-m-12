'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useRequireAuth } from '../../context/useRequireAuth';
import { ROLE_LABELS, UserRole } from '../../services/auth-contract';
import { UserIcon } from '../components/Icons';

const ACCOUNT_ALLOWED_ROLES: UserRole[] = ['CUSTOMER', 'STAFF', 'ADMIN'];

/**
 * Trang Thông tin tài khoản (/account) - chỉ xem.
 * - Mọi vai trò đã đăng nhập (CUSTOMER, STAFF, ADMIN) đều truy cập được.
 * - Chưa đăng nhập tự động chuyển về /login?redirect=%2Faccount.
 * - Dữ liệu đọc từ phiên đăng nhập đã lưu sẵn (hợp đồng không có GET /auth/me).
 */
export default function AccountPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { user, isChecking, isReady } = useRequireAuth({
    allowedRoles: ACCOUNT_ALLOWED_ROLES,
    skipRedirect: isLoggingOut,
  });

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
    router.push('/');
  };

  if (isChecking || !isReady || !user) {
    return (
      <div
        data-testid="account-loading"
        className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm space-y-3"
      >
        <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full" />
        <p>{isLoggingOut ? 'Đang đăng xuất...' : 'Đang kiểm tra trạng thái đăng nhập...'}</p>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const isCustomer = user.role === 'CUSTOMER';

  return (
    <section
      aria-labelledby="account-heading"
      className="max-w-lg w-full mx-auto my-6 sm:my-10 bg-cream p-6 sm:p-8 rounded-card border border-tan/60 shadow-soft space-y-6"
    >
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-kombu text-bone shadow-soft">
          <UserIcon className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 id="account-heading" className="font-display text-2xl sm:text-3xl font-bold text-noir">
            Thông tin tài khoản
          </h1>
          <p className="text-sm text-noir/65">Thông tin phiên đăng nhập hiện tại của bạn</p>
        </div>
      </div>

      <dl className="divide-y divide-tan/40 rounded-control border border-tan/50 bg-bone/70">
        <div className="px-4 py-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <dt className="text-xs sm:text-sm font-semibold text-noir/70">Tên hiển thị</dt>
          <dd className="mt-1 sm:mt-0 text-sm sm:text-base font-bold text-noir break-words sm:text-right">
            {user.displayName}
          </dd>
        </div>

        <div className="px-4 py-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <dt className="text-xs sm:text-sm font-semibold text-noir/70">Email</dt>
          <dd className="mt-1 sm:mt-0 text-sm sm:text-base font-medium text-noir break-all sm:text-right">
            {user.email}
          </dd>
        </div>

        <div className="px-4 py-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <dt className="text-xs sm:text-sm font-semibold text-noir/70">Vai trò</dt>
          <dd className="mt-1 sm:mt-0 sm:text-right">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-moss/25 text-kombu border border-moss/40">
              {roleLabel}
            </span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        {isCustomer && (
          <Link
            href="/orders"
            className="flex-1 text-center px-5 py-2.5 rounded-control font-bold text-sm bg-kombu text-bone hover:bg-noir transition shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
          >
            Lịch sử đơn
          </Link>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className={`${
            isCustomer ? 'sm:flex-1' : 'w-full'
          } px-5 py-2.5 rounded-control font-bold text-sm bg-error/90 hover:bg-error text-bone transition shadow-soft cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss`}
        >
          Đăng xuất
        </button>
      </div>
    </section>
  );
}

