'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useRequireAuth } from '../../context/useRequireAuth';
import { AUTH_ERROR_MESSAGES, ROLE_LABELS, UserRole } from '../../services/auth-contract';
import {
  formatLoyaltyOrderNumber,
  formatSignedLoyaltyPoints,
  getLoyaltyTypeLabel,
  getMyLoyaltyApi,
  LoyaltyMeResponse,
} from '../../services/loyalty';
import { formatVietnamDateTime } from '../../services/order-contract';
import {
  clearAuthSession,
  isAccountLockedError,
  loadAuthSession,
  notifyAccountLocked,
} from '../../utils/auth';
import { classifyApiError } from '../../utils/validation';
import { UserIcon } from '../components/Icons';

const ACCOUNT_ALLOWED_ROLES: UserRole[] = ['CUSTOMER', 'STAFF', 'ADMIN'];
const MAX_LOYALTY_HISTORY_ROWS = 50;

function extractHttpStatusCode(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const candidate = err as { statusCode?: unknown; errorData?: unknown };
  if (typeof candidate.statusCode === 'number') {
    return candidate.statusCode;
  }
  if (
    candidate.errorData &&
    typeof candidate.errorData === 'object' &&
    typeof (candidate.errorData as { statusCode?: unknown }).statusCode === 'number'
  ) {
    return (candidate.errorData as { statusCode: number }).statusCode;
  }
  return 0;
}

function getLoyaltyPointsBadgeClass(points: number): string {
  if (points > 0) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (points < 0) {
    return 'bg-error/10 text-error border-error/30';
  }
  return 'bg-bone text-noir/75 border-tan/50';
}

/**
 * Trang Thông tin tài khoản (/account) - chỉ xem.
 * - Mọi vai trò đã đăng nhập (CUSTOMER, STAFF, ADMIN) đều truy cập được.
 * - Chưa đăng nhập tự động chuyển về /login?redirect=%2Faccount.
 * - Thông tin cơ bản đọc từ phiên đăng nhập đã lưu sẵn (hợp đồng không có GET /auth/me).
 * - Riêng CUSTOMER có thêm khối điểm thưởng và lịch sử điểm từ GET /loyalty/me.
 * - STAFF và ADMIN không hiện khối điểm và không gọi GET /loyalty/me.
 */
export default function AccountPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSessionExpiredRedirecting, setIsSessionExpiredRedirecting] = useState(false);

  const [loyaltyState, setLoyaltyState] = useState<{
    ownerId: string;
    data: LoyaltyMeResponse;
  } | null>(null);
  const [loyaltyErrorState, setLoyaltyErrorState] = useState<{
    ownerId: string;
    message: string;
  } | null>(null);
  const [isLoadingLoyalty, setIsLoadingLoyalty] = useState(false);
  const [loyaltyReloadTick, setLoyaltyReloadTick] = useState(0);

  const { user, isChecking, isReady } = useRequireAuth({
    allowedRoles: ACCOUNT_ALLOWED_ROLES,
    skipRedirect: isLoggingOut || isSessionExpiredRedirecting,
  });

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  const isCustomer = Boolean(user && user.role === 'CUSTOMER');
  const shouldFetchLoyalty = Boolean(
    isReady && user && user.role === 'CUSTOMER' && !isLoggingOut && !isSessionExpiredRedirecting
  );

  useEffect(() => {
    if (!shouldFetchLoyalty || !user) {
      return;
    }

    let isCancelled = false;
    let settled = false;
    const targetUserId = user.id;

    queueMicrotask(() => {
      if (isCancelled || settled) return;
      setIsLoadingLoyalty(true);
      setLoyaltyErrorState(null);
    });

    getMyLoyaltyApi()
      .then((data) => {
        settled = true;
        if (isCancelled) return;
        setLoyaltyState({ ownerId: targetUserId, data });
        setLoyaltyErrorState(null);
        setIsLoadingLoyalty(false);
      })
      .catch((err: unknown) => {
        settled = true;
        if (isCancelled) return;
        setIsLoadingLoyalty(false);

        const statusCode = extractHttpStatusCode(err);
        if (statusCode === 401) {
          setIsSessionExpiredRedirecting(true);
          clearAuthSession();
          routerRef.current.push(`/login?redirect=${encodeURIComponent('/account')}&expired=true`);
          return;
        }

        if (isAccountLockedError(err)) {
          if (loadAuthSession() !== null) {
            notifyAccountLocked(AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED);
          }
          logout();
          setLoyaltyErrorState({
            ownerId: targetUserId,
            message: AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED,
          });
          return;
        }

        const classified = classifyApiError(
          err,
          'Không thể tải thông tin điểm thưởng. Vui lòng thử lại.'
        );
        setLoyaltyErrorState({
          ownerId: targetUserId,
          message: classified.message,
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [shouldFetchLoyalty, user, loyaltyReloadTick, logout]);

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
    router.push('/');
  };

  const handleRetryLoyalty = () => {
    setLoyaltyErrorState(null);
    setIsLoadingLoyalty(true);
    setLoyaltyReloadTick((prev) => prev + 1);
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
  const currentLoyalty = user && loyaltyState?.ownerId === user.id ? loyaltyState.data : null;
  const currentLoyaltyError =
    user && loyaltyErrorState?.ownerId === user.id ? loyaltyErrorState.message : null;
  const showLoyaltyLoading =
    isCustomer && (isLoadingLoyalty || (currentLoyalty === null && currentLoyaltyError === null));

  const safeLoyaltyPoints =
    currentLoyalty &&
    typeof currentLoyalty.loyaltyPoints === 'number' &&
    Number.isFinite(currentLoyalty.loyaltyPoints)
      ? Math.max(0, Math.floor(currentLoyalty.loyaltyPoints))
      : 0;

  // Giữ nguyên thứ tự mới nhất từ server, tối đa 50 dòng, không tự sắp xếp lại
  const loyaltyTransactions =
    currentLoyalty && Array.isArray(currentLoyalty.transactions)
      ? currentLoyalty.transactions.slice(0, MAX_LOYALTY_HISTORY_ROWS)
      : [];

  return (
    <div
      className={`${
        isCustomer ? 'max-w-2xl space-y-6' : 'max-w-lg'
      } w-full mx-auto my-6 sm:my-10`}
    >
      <section
        aria-labelledby="account-heading"
        className="bg-cream p-6 sm:p-8 rounded-card border border-tan/60 shadow-soft space-y-6"
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

      {isCustomer && (
        <section
          aria-labelledby="account-loyalty-heading"
          data-testid="account-loyalty-section"
          className="bg-cream p-6 sm:p-8 rounded-card border border-tan/60 shadow-soft space-y-5"
        >
          <div>
            <h2
              id="account-loyalty-heading"
              className="font-display text-xl sm:text-2xl font-bold text-noir"
            >
              Điểm thưởng
            </h2>
            <p className="text-xs sm:text-sm text-noir/65">
              Số điểm tích lũy và lịch sử giao dịch điểm (tối đa 50 dòng gần nhất)
            </p>
          </div>

          {showLoyaltyLoading ? (
            <div
              data-testid="account-loyalty-loading"
              className="py-8 text-center text-noir/65 text-sm space-y-2 rounded-control border border-tan/50 bg-bone/50"
            >
              <div className="animate-spin inline-block w-5 h-5 border-2 border-kombu border-t-transparent rounded-full" />
              <p>Đang tải điểm thưởng...</p>
            </div>
          ) : currentLoyaltyError ? (
            <div
              role="alert"
              data-testid="account-loyalty-error"
              className="rounded-control border border-error/45 bg-error/10 p-4 text-center space-y-3"
            >
              <p className="text-sm font-semibold text-error">{currentLoyaltyError}</p>
              <button
                type="button"
                onClick={handleRetryLoyalty}
                className="px-4 py-2 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-xs sm:text-sm transition shadow-soft cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                data-testid="account-loyalty-balance"
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-moss/45 bg-bone/80 px-4 py-3.5"
              >
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-noir/70">Điểm tích lũy</p>
                  <p className="text-xs text-noir/60">1 điểm = 1.000đ khi áp dụng ở bước đặt đơn</p>
                </div>
                <p className="font-display text-2xl font-bold text-kombu">
                  {safeLoyaltyPoints} điểm
                </p>
              </div>

              {loyaltyTransactions.length === 0 ? (
                <div
                  data-testid="account-loyalty-empty"
                  className="rounded-control border border-tan/50 bg-bone/50 px-4 py-8 text-center text-sm text-noir/65"
                >
                  Chưa có giao dịch điểm nào.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-control border border-tan/50 bg-bone/70">
                  <table
                    aria-label="Lịch sử điểm thưởng"
                    className="w-full text-left border-collapse text-xs sm:text-sm"
                  >
                    <thead>
                      <tr className="border-b border-tan/50 bg-tan/20 text-noir/75">
                        <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">
                          Loại
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">
                          Số điểm
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">
                          Mã đơn
                        </th>
                        <th
                          scope="col"
                          className="px-3.5 py-2.5 font-semibold whitespace-nowrap text-right"
                        >
                          Thời gian
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tan/40">
                      {loyaltyTransactions.map((tx, index) => (
                        <tr
                          key={tx.id}
                          data-testid={`loyalty-tx-row-${index}`}
                          className="hover:bg-tan/15 transition"
                        >
                          <td className="px-3.5 py-2.5 font-medium text-noir whitespace-nowrap">
                            {getLoyaltyTypeLabel(tx.type)}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${getLoyaltyPointsBadgeClass(
                                tx.points
                              )}`}
                            >
                              {formatSignedLoyaltyPoints(tx.points)}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 font-medium text-noir/80 whitespace-nowrap">
                            {formatLoyaltyOrderNumber(tx.orderNumber)}
                          </td>
                          <td className="px-3.5 py-2.5 text-noir/65 whitespace-nowrap text-right">
                            {formatVietnamDateTime(tx.createdAt) || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

