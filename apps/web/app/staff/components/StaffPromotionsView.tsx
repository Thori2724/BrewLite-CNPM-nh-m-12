'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { AUTH_ERROR_MESSAGES, UserRole } from '../../../services/auth-contract';
import { Promotion } from '../../../services/promotions';
import {
  clearAuthSession,
  loadAuthSession,
  notifyAccountLocked,
} from '../../../utils/auth';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  fetchStaffPromotions,
  formatStaffPromotionMaxDiscount,
  formatStaffPromotionValue,
  getStaffPromotionStatusLabel,
  getStaffPromotionTypeLabel,
  ParsedStaffPromotionError,
  parseStaffPromotionError,
  toggleStaffPromotionActive,
} from '../services/staff-promotions';
import { useStaffShellContext } from './StaffShell';

interface ActionFeedback {
  type: 'success' | 'error';
  message: string;
}

export default function StaffPromotionsView() {
  const router = useRouter();
  const { user, isAuthenticated, isHydrated, logout } = useAuth();
  const staffShellContext = useStaffShellContext();

  const hasRealSession = Boolean(isAuthenticated && user);
  const usingShellMockFallback =
    !hasRealSession && Boolean(staffShellContext?.usingMockFallback);
  const effectiveRole: UserRole | null = hasRealSession
    ? (user?.role ?? null)
    : (staffShellContext?.role ?? null);
  const isAdmin = effectiveRole === 'ADMIN';

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [updatingPromotionId, setUpdatingPromotionId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<'enable' | 'disable' | null>(null);
  const [disableTarget, setDisableTarget] = useState<Promotion | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [authBlocked, setAuthBlocked] = useState<boolean>(false);

  const requestSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const actionInFlightRef = useRef<boolean>(false);
  const authBlockedRef = useRef<boolean>(false);

  const accessRedirectTarget: string | null = (() => {
    if (!isHydrated || authBlocked) return null;
    if (effectiveRole === 'ADMIN') return null;
    if (effectiveRole === 'STAFF') return '/staff';
    return '/';
  })();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleAuthFailure = useCallback(
    (parsed: ParsedStaffPromotionError): boolean => {
      if (parsed.isUnauthorized) {
        authBlockedRef.current = true;
        setAuthBlocked(true);
        clearAuthSession();
        router.replace('/login?redirect=%2Fstaff%2Fpromotions&expired=true');
        return true;
      }
      if (parsed.isAccountLocked) {
        authBlockedRef.current = true;
        setAuthBlocked(true);
        if (loadAuthSession() !== null) {
          notifyAccountLocked(AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED);
        }
        logout();
        return true;
      }
      return false;
    },
    [logout, router]
  );

  const handleAuthFailureRef = useRef(handleAuthFailure);
  useEffect(() => {
    handleAuthFailureRef.current = handleAuthFailure;
  }, [handleAuthFailure]);

  useEffect(() => {
    if (!isHydrated || authBlockedRef.current) return;

    if (accessRedirectTarget) {
      router.replace(accessRedirectTarget);
      return;
    }

    if (!isAdmin) return;

    const seq = ++requestSeqRef.current;
    let isCancelled = false;

    fetchStaffPromotions(usingShellMockFallback)
      .then((data) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        setPromotions(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
        setIsReloading(false);
      })
      .catch((err: unknown) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffPromotionError(err);
        if (handleAuthFailureRef.current(parsed)) {
          setError(parsed.message);
          setLoading(false);
          setIsReloading(false);
          return;
        }
        setError(parsed.message);
        setLoading(false);
        setIsReloading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [accessRedirectTarget, isAdmin, isHydrated, router, usingShellMockFallback]);

  const runReloadPromotions = useCallback(
    async (options?: { showFullLoading?: boolean; keepFeedback?: boolean }) => {
      if (!isAdmin || authBlockedRef.current) return;

      const seq = ++requestSeqRef.current;
      const showFullLoading = options?.showFullLoading ?? false;

      if (showFullLoading) {
        setLoading(true);
      } else {
        setIsReloading(true);
      }

      if (!options?.keepFeedback) {
        setActionFeedback(null);
      }
      setError(null);

      try {
        const data = await fetchStaffPromotions(usingShellMockFallback);
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        setPromotions(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffPromotionError(err);
        if (handleAuthFailureRef.current(parsed)) {
          setError(parsed.message);
          return;
        }
        if (options?.keepFeedback) {
          setActionFeedback({ type: 'error', message: parsed.message });
        } else {
          setError(parsed.message);
        }
      } finally {
        if (isMountedRef.current && requestSeqRef.current === seq) {
          setLoading(false);
          setIsReloading(false);
        }
      }
    },
    [isAdmin, usingShellMockFallback]
  );

  const handleManualReload = () => {
    void runReloadPromotions({ showFullLoading: false, keepFeedback: false });
  };

  const handleRetryLoad = () => {
    void runReloadPromotions({ showFullLoading: true, keepFeedback: false });
  };

  const applyUpdatedPromotion = (updatedPromotion: Promotion) => {
    setPromotions((prev) =>
      prev.map((item) => (item.id === updatedPromotion.id ? updatedPromotion : item))
    );
  };

  const runTogglePromotion = async (promotion: Promotion, nextIsActive: boolean) => {
    if (!isAdmin || actionInFlightRef.current) return;

    actionInFlightRef.current = true;
    setUpdatingPromotionId(promotion.id);
    setUpdatingAction(nextIsActive ? 'enable' : 'disable');
    if (nextIsActive) {
      setActionFeedback(null);
    }

    try {
      const updated = await toggleStaffPromotionActive(
        promotion.id,
        nextIsActive,
        usingShellMockFallback
      );
      if (!isMountedRef.current) return;

      setDisableTarget(null);
      applyUpdatedPromotion(updated);
      setActionFeedback({
        type: 'success',
        message: updated.isActive
          ? `Đã bật mã "${updated.code}".`
          : `Đã tắt mã "${updated.code}".`,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffPromotionError(err);

      setDisableTarget(null);

      if (handleAuthFailureRef.current(parsed)) {
        setError(parsed.message);
        return;
      }

      setActionFeedback({ type: 'error', message: parsed.message });
      if (parsed.isNotFound) {
        await runReloadPromotions({ showFullLoading: false, keepFeedback: true });
      }
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) {
        setUpdatingPromotionId(null);
        setUpdatingAction(null);
      }
    }
  };

  const handleOpenDisableDialog = (promotion: Promotion) => {
    if (
      !isAdmin ||
      !promotion.isActive ||
      actionInFlightRef.current ||
      updatingPromotionId !== null
    ) {
      return;
    }
    setActionFeedback(null);
    setDisableTarget(promotion);
  };

  const handleCloseDisableDialog = () => {
    if (actionInFlightRef.current || updatingPromotionId !== null) return;
    setDisableTarget(null);
  };

  const handleEnablePromotion = (promotion: Promotion) => {
    if (
      !isAdmin ||
      promotion.isActive ||
      actionInFlightRef.current ||
      updatingPromotionId !== null
    ) {
      return;
    }
    void runTogglePromotion(promotion, true);
  };

  if (isHydrated && accessRedirectTarget) {
    return (
      <div
        data-testid="staff-promotions-redirecting"
        className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center text-sm text-noir/70 shadow-soft space-y-3"
      >
        <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full" />
        <p>Đang chuyển hướng...</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="staff-promotions-heading" className="space-y-6">
      {/* Đầu trang & nút tải lại */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-tan/70 pb-5">
        <div>
          <h1 id="staff-promotions-heading" className="font-display text-3xl font-bold text-noir">
            Khuyến mãi
          </h1>
          <p className="mt-1 text-sm text-noir/65">
            Theo dõi danh sách mã giảm giá và bật hoặc tắt trạng thái áp dụng cho đơn hàng mới.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualReload}
            disabled={loading || isReloading || updatingPromotionId !== null}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-control border border-tan bg-cream hover:bg-tan/40 px-4 py-2 text-sm font-semibold text-noir transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>↻</span>
            <span>{isReloading ? 'Đang tải lại...' : 'Tải lại'}</span>
          </button>
        </div>
      </div>

      {/* Thanh thông báo kết quả / lỗi thao tác trên mã giảm giá */}
      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          data-testid={
            actionFeedback.type === 'error'
              ? 'staff-promotions-action-error'
              : 'staff-promotions-action-success'
          }
          className={`flex items-start justify-between gap-3 rounded-control border px-4 py-3 text-sm font-medium shadow-soft ${
            actionFeedback.type === 'error'
              ? 'border-error/45 bg-error/10 text-error'
              : 'border-moss/60 bg-tan/35 text-kombu'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            aria-label="Đóng thông báo"
            className="shrink-0 text-xs font-bold opacity-75 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Trạng thái Loading */}
      {loading && (
        <div
          data-testid="staff-promotions-loading"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center text-sm text-noir/70 shadow-soft space-y-3"
        >
          <div className="animate-spin inline-block w-8 h-8 border-2 border-kombu border-t-transparent rounded-full" />
          <p>Đang tải danh sách mã giảm giá...</p>
        </div>
      )}

      {/* Trạng thái Error */}
      {!loading && error && (
        <div
          role="alert"
          data-testid="staff-promotions-error"
          className="rounded-card border border-tan/70 bg-cream py-12 px-6 text-center shadow-soft space-y-4"
        >
          <div className="max-w-lg mx-auto rounded-control border border-error/45 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
            {error}
          </div>
          <div>
            <button
              type="button"
              onClick={handleRetryLoad}
              className="px-5 py-2.5 rounded-control bg-kombu hover:bg-noir text-bone text-sm font-semibold transition shadow-soft cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Trạng thái Empty */}
      {!loading && !error && promotions.length === 0 && (
        <div
          data-testid="staff-promotions-empty"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center shadow-soft space-y-4"
        >
          <p className="font-display text-lg font-bold text-noir">Chưa có mã giảm giá nào</p>
          <p className="text-sm text-noir/65">
            Hiện chưa có mã giảm giá nào trong danh sách.
          </p>
          <div>
            <button
              type="button"
              onClick={handleManualReload}
              className="px-4 py-2 rounded-control border border-tan bg-bone/70 hover:bg-tan/40 text-noir text-sm font-semibold transition cursor-pointer"
            >
              Tải lại
            </button>
          </div>
        </div>
      )}

      {/* Bảng danh sách mã giảm giá (tối ưu cho máy tính) */}
      {!loading && !error && promotions.length > 0 && (
        <div className="rounded-card border border-tan bg-cream shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-tan bg-bone/60 text-xs font-bold uppercase tracking-wide text-noir/75">
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Mã
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Loại
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-right">
                    Giá trị
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-right">
                    Trần giảm
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tan/60 text-sm">
                {promotions.map((promotion) => {
                  const isAnyUpdating = updatingPromotionId !== null || isReloading;
                  const isThisRowUpdating = updatingPromotionId === promotion.id;
                  const typeLabel = getStaffPromotionTypeLabel(promotion.type);
                  const valueLabel = formatStaffPromotionValue(promotion);
                  const maxDiscountLabel = formatStaffPromotionMaxDiscount(
                    promotion.maxDiscount
                  );
                  const statusLabel = getStaffPromotionStatusLabel(promotion.isActive);

                  return (
                    <tr
                      key={promotion.id}
                      data-testid={`staff-promotion-row-${promotion.id}`}
                      className={`transition ${
                        promotion.isActive ? 'hover:bg-bone/35' : 'bg-bone/45 text-noir/75'
                      }`}
                    >
                      <td className="px-5 py-4 font-mono font-bold tracking-wide text-noir whitespace-nowrap">
                        {promotion.code}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-noir/85">{typeLabel}</td>

                      <td className="px-5 py-4 whitespace-nowrap text-right font-display font-bold text-kombu tabular-nums">
                        {valueLabel}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums text-noir/80">
                        {maxDiscountLabel}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold ${
                            promotion.isActive
                              ? 'bg-moss/25 text-kombu border border-moss/40'
                              : 'bg-error/10 text-error border border-error/30'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        {promotion.isActive ? (
                          <button
                            type="button"
                            disabled={isAnyUpdating}
                            onClick={() => handleOpenDisableDialog(promotion)}
                            className="px-3.5 py-1.5 rounded-control border border-error/45 bg-cream hover:bg-error/10 text-error text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isThisRowUpdating && updatingAction === 'disable'
                              ? 'Đang tắt...'
                              : 'Tắt'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isAnyUpdating}
                            onClick={() => handleEnablePromotion(promotion)}
                            className="px-3.5 py-1.5 rounded-control bg-kombu hover:bg-noir text-bone text-xs font-semibold transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isThisRowUpdating && updatingAction === 'enable'
                              ? 'Đang bật...'
                              : 'Bật'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hộp xác nhận khi TẮT mã giảm giá (dùng lại ConfirmDialog) */}
      <ConfirmDialog
        isOpen={Boolean(disableTarget)}
        title={disableTarget ? `Tắt mã giảm giá "${disableTarget.code}"?` : ''}
        description="Khách hàng sẽ không thể áp dụng mã này cho đơn hàng mới sau khi tắt. Các đơn cũ đã đặt không bị ảnh hưởng. Bạn có thể bật lại sau."
        cancelLabel="Đóng"
        confirmLabel="Xác nhận tắt"
        processingLabel="Đang tắt..."
        variant="danger"
        isProcessing={updatingPromotionId !== null}
        onCancel={handleCloseDisableDialog}
        onConfirm={() => {
          if (disableTarget) {
            void runTogglePromotion(disableTarget, false);
          }
        }}
      />
    </section>
  );
}
