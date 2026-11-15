'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import {
  CATEGORY_LABELS,
  PRODUCT_STATUS_LABELS,
  ProductManage,
} from '../../../services/api';
import { AUTH_ERROR_MESSAGES, UserRole } from '../../../services/auth-contract';
import {
  clearAuthSession,
  loadAuthSession,
  notifyAccountLocked,
} from '../../../utils/auth';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  fetchStaffProducts,
  formatStaffProductVnd,
  ParsedStaffProductError,
  parseStaffProductError,
  STAFF_PRODUCT_FALLBACK_IMAGE,
  updateStaffProductAvailability,
  updateStaffProductVisibility,
} from '../services/staff-products';
import { useStaffShellContext } from './StaffShell';

interface ActionFeedback {
  type: 'success' | 'error';
  message: string;
}

export interface StaffProductsViewProps {
  /** Hàm mở form thêm món dành cho Dòng 22 (tùy chọn). */
  onOpenCreateForm?: () => void;
  /** Hàm mở form sửa món dành cho Dòng 22 (tùy chọn). */
  onOpenEditForm?: (product: ProductManage) => void;
  /** Vị trí gắn hộp thoại Form thêm/sửa món ở Dòng 22 (tùy chọn). */
  formSlot?: React.ReactNode;
}

export default function StaffProductsView({
  onOpenCreateForm,
  onOpenEditForm,
  formSlot,
}: StaffProductsViewProps) {
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

  const [products, setProducts] = useState<ProductManage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<
    'availability' | 'hide' | 'show' | null
  >(null);
  const [hideTargetProduct, setHideTargetProduct] = useState<ProductManage | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const requestSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const actionInFlightRef = useRef<boolean>(false);
  const authBlockedRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleAuthFailure = useCallback(
    (parsed: ParsedStaffProductError): boolean => {
      if (parsed.isUnauthorized) {
        authBlockedRef.current = true;
        clearAuthSession();
        router.replace('/login?redirect=%2Fstaff%2Fproducts&expired=true');
        return true;
      }
      if (parsed.isAccountLocked) {
        authBlockedRef.current = true;
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

    const seq = ++requestSeqRef.current;
    let isCancelled = false;

    fetchStaffProducts(usingShellMockFallback)
      .then((data) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        setProducts(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
        setIsReloading(false);
      })
      .catch((err: unknown) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffProductError(err);
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
  }, [isHydrated, usingShellMockFallback]);

  const runReloadProducts = useCallback(
    async (options?: { showFullLoading?: boolean; keepFeedback?: boolean }) => {
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
        const data = await fetchStaffProducts(usingShellMockFallback);
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffProductError(err);
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
    [usingShellMockFallback]
  );

  const visibleProducts = useMemo(() => {
    return isAdmin ? products : products.filter((item) => item.isVisible);
  }, [isAdmin, products]);

  const handleManualReload = () => {
    void runReloadProducts({ showFullLoading: false, keepFeedback: false });
  };

  const handleRetryLoad = () => {
    void runReloadProducts({ showFullLoading: true, keepFeedback: false });
  };

  const applyUpdatedProduct = (updatedProduct: ProductManage) => {
    setProducts((prev) =>
      prev.map((item) => (item.id === updatedProduct.id ? updatedProduct : item))
    );
  };

  const handleToggleAvailability = async (product: ProductManage) => {
    if (actionInFlightRef.current || updatingProductId !== null) return;

    const nextAvailable = product.stock <= 0;
    actionInFlightRef.current = true;
    setUpdatingProductId(product.id);
    setUpdatingAction('availability');
    setActionFeedback(null);

    try {
      const updated = await updateStaffProductAvailability(
        product.id,
        nextAvailable,
        usingShellMockFallback
      );
      if (!isMountedRef.current) return;

      applyUpdatedProduct(updated);
      const statusText =
        updated.stock > 0
          ? PRODUCT_STATUS_LABELS.AVAILABLE
          : PRODUCT_STATUS_LABELS.OUT_OF_STOCK;
      setActionFeedback({
        type: 'success',
        message: `Đã chuyển "${updated.name}" sang trạng thái ${statusText}.`,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffProductError(err);

      if (handleAuthFailureRef.current(parsed)) {
        setError(parsed.message);
        return;
      }

      setActionFeedback({ type: 'error', message: parsed.message });
      if (parsed.isNotFound) {
        await runReloadProducts({ showFullLoading: false, keepFeedback: true });
      }
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) {
        setUpdatingProductId(null);
        setUpdatingAction(null);
      }
    }
  };

  const handleOpenHideDialog = (product: ProductManage) => {
    if (!isAdmin || !product.isVisible || actionInFlightRef.current || updatingProductId !== null) {
      return;
    }
    setActionFeedback(null);
    setHideTargetProduct(product);
  };

  const handleCloseHideDialog = () => {
    if (actionInFlightRef.current || updatingProductId !== null) return;
    setHideTargetProduct(null);
  };

  const runVisibilityUpdate = async (product: ProductManage, nextVisible: boolean) => {
    if (!isAdmin || actionInFlightRef.current) return;

    actionInFlightRef.current = true;
    setUpdatingProductId(product.id);
    setUpdatingAction(nextVisible ? 'show' : 'hide');
    if (nextVisible) {
      setActionFeedback(null);
    }

    try {
      const updated = await updateStaffProductVisibility(
        product.id,
        nextVisible,
        usingShellMockFallback
      );
      if (!isMountedRef.current) return;

      setHideTargetProduct(null);
      applyUpdatedProduct(updated);
      setActionFeedback({
        type: 'success',
        message: updated.isVisible
          ? `Đã hiện lại món "${updated.name}" trên thực đơn.`
          : `Đã ẩn món "${updated.name}" khỏi thực đơn.`,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffProductError(err);

      setHideTargetProduct(null);

      if (handleAuthFailureRef.current(parsed)) {
        setError(parsed.message);
        return;
      }

      setActionFeedback({ type: 'error', message: parsed.message });
      if (parsed.isNotFound) {
        await runReloadProducts({ showFullLoading: false, keepFeedback: true });
      }
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) {
        setUpdatingProductId(null);
        setUpdatingAction(null);
      }
    }
  };

  return (
    <section aria-labelledby="staff-products-heading" className="space-y-6">
      {/* Đầu trang & nút thao tác chung */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-tan/70 pb-5">
        <div>
          <h1 id="staff-products-heading" className="font-display text-3xl font-bold text-noir">
            Món
          </h1>
          <p className="mt-1 text-sm text-noir/65">
            {isAdmin
              ? 'Quản lý danh sách món, trạng thái đang bán/tạm hết và hiển thị trên thực đơn.'
              : 'Theo dõi danh sách món và bật/tắt trạng thái đang bán hoặc tạm hết tại quầy.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualReload}
            disabled={loading || isReloading || updatingProductId !== null}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-control border border-tan bg-cream hover:bg-tan/40 px-4 py-2 text-sm font-semibold text-noir transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>↻</span>
            <span>{isReloading ? 'Đang tải lại...' : 'Tải lại'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              disabled={loading || isReloading || updatingProductId !== null}
              onClick={() => onOpenCreateForm?.()}
              className="min-h-10 inline-flex items-center gap-1.5 rounded-control bg-kombu hover:bg-noir px-4 py-2 text-sm font-semibold text-bone transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Thêm món
            </button>
          )}
        </div>
      </div>

      {/* Thông báo kết quả / lỗi thao tác trên món */}
      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          data-testid={
            actionFeedback.type === 'error'
              ? 'staff-products-action-error'
              : 'staff-products-action-success'
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
          data-testid="staff-products-loading"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center text-sm text-noir/70 shadow-soft space-y-3"
        >
          <div className="animate-spin inline-block w-8 h-8 border-2 border-kombu border-t-transparent rounded-full" />
          <p>Đang tải danh sách món...</p>
        </div>
      )}

      {/* Trạng thái Error */}
      {!loading && error && (
        <div
          role="alert"
          data-testid="staff-products-error"
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
      {!loading && !error && visibleProducts.length === 0 && (
        <div
          data-testid="staff-products-empty"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center shadow-soft space-y-4"
        >
          <p className="font-display text-lg font-bold text-noir">Chưa có món nào</p>
          <p className="text-sm text-noir/65">
            Hiện chưa có món phù hợp để hiển thị trong danh sách.
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

      {/* Bảng danh sách món (tối ưu cho máy tính) */}
      {!loading && !error && visibleProducts.length > 0 && (
        <div className="rounded-card border border-tan bg-cream shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-tan bg-bone/60 text-xs font-bold uppercase tracking-wide text-noir/75">
                  <th scope="col" className="px-5 py-3.5">
                    Món
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Danh mục
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-right">
                    Giá
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-center">
                    Đang bán / Tạm hết
                  </th>
                  {isAdmin && (
                    <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-right">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-tan/60 text-sm">
                {visibleProducts.map((product) => {
                  const isAvailable = product.stock > 0;
                  const isHidden = !product.isVisible;
                  const isAnyUpdating = updatingProductId !== null || isReloading;
                  const isThisRowUpdating = updatingProductId === product.id;
                  const categoryLabel =
                    CATEGORY_LABELS[product.category] || product.category;
                  const thumbnailSrc =
                    product.imageUrl && product.imageUrl.trim()
                      ? product.imageUrl
                      : STAFF_PRODUCT_FALLBACK_IMAGE;

                  return (
                    <tr
                      key={product.id}
                      data-testid={`staff-product-row-${product.id}`}
                      className={`transition ${
                        isHidden ? 'bg-bone/45 text-noir/75' : 'hover:bg-bone/35'
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3.5 min-w-52">
                          <img
                            src={thumbnailSrc}
                            alt={product.name}
                            onError={(e) => {
                              if (e.currentTarget.dataset.fallbackApplied === 'true') return;
                              e.currentTarget.dataset.fallbackApplied = 'true';
                              e.currentTarget.src = STAFF_PRODUCT_FALLBACK_IMAGE;
                            }}
                            className={`h-12 w-12 shrink-0 rounded-control border border-tan/70 bg-bone object-cover ${
                              !isAvailable || isHidden ? 'grayscale opacity-65' : ''
                            }`}
                          />
                          <p className="font-semibold text-noir break-words">{product.name}</p>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap text-noir/80">
                        {categoryLabel}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-display font-bold text-kombu">
                        {formatStaffProductVnd(product.basePrice)}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="inline-flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold ${
                              isAvailable
                                ? 'bg-moss/25 text-kombu border border-moss/40'
                                : 'bg-error/10 text-error border border-error/30'
                            }`}
                          >
                            {isAvailable
                              ? PRODUCT_STATUS_LABELS.AVAILABLE
                              : PRODUCT_STATUS_LABELS.OUT_OF_STOCK}
                          </span>

                          {isHidden && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold bg-neutral-200 text-neutral-700 border border-neutral-300">
                              {PRODUCT_STATUS_LABELS.HIDDEN}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isAvailable}
                            aria-label={`Chuyển trạng thái bán cho ${product.name}`}
                            disabled={isAnyUpdating}
                            onClick={() => {
                              void handleToggleAvailability(product);
                            }}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                              isAvailable
                                ? 'bg-kombu border-kombu'
                                : 'bg-tan/60 border-tan'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`inline-block h-4 w-4 rounded-full bg-bone shadow-xs transition-transform ${
                                isAvailable ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          {isThisRowUpdating && updatingAction === 'availability' && (
                            <span className="text-xs text-noir/65">Đang lưu...</span>
                          )}
                        </div>
                      </td>

                      {isAdmin && (
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isAnyUpdating}
                              onClick={() => onOpenEditForm?.(product)}
                              className="px-3 py-1.5 rounded-control border border-tan bg-bone/70 hover:bg-tan/50 text-xs font-semibold text-noir transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              Sửa
                            </button>

                            {product.isVisible ? (
                              <button
                                type="button"
                                disabled={isAnyUpdating}
                                onClick={() => handleOpenHideDialog(product)}
                                className="px-3 py-1.5 rounded-control border border-error/45 bg-cream hover:bg-error/10 text-error text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {isThisRowUpdating && updatingAction === 'hide'
                                  ? 'Đang ẩn...'
                                  : 'Ẩn'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isAnyUpdating}
                                onClick={() => {
                                  void runVisibilityUpdate(product, true);
                                }}
                                className="px-3 py-1.5 rounded-control bg-kombu hover:bg-noir text-bone text-xs font-semibold transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {isThisRowUpdating && updatingAction === 'show'
                                  ? 'Đang hiện...'
                                  : 'Hiện'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hộp xác nhận ẩn món */}
      <ConfirmDialog
        isOpen={Boolean(hideTargetProduct)}
        title={hideTargetProduct ? `Ẩn món "${hideTargetProduct.name}"?` : ''}
        description="Món này sẽ tạm ẩn khỏi thực đơn của khách hàng, nhưng vẫn giữ lại trong các đơn hàng cũ."
        cancelLabel="Đóng"
        confirmLabel="Xác nhận ẩn"
        processingLabel="Đang ẩn..."
        variant="danger"
        isProcessing={updatingProductId !== null}
        onCancel={handleCloseHideDialog}
        onConfirm={() => {
          if (hideTargetProduct) {
            void runVisibilityUpdate(hideTargetProduct, false);
          }
        }}
      />

      {/* Chỗ gắn Form Thêm/Sửa món (Dòng 22) */}
      {formSlot ?? null}
    </section>
  );
}
