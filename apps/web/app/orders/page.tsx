'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../context/useRequireAuth';
import {
  OrderResponse,
  OrderStatus,
  ORDER_STATUS_LABELS,
  RECEIVE_TYPE_LABELS,
  ORDER_ERROR_MESSAGES,
  formatVietnamDateTime,
  getOrderStatusBadgeClass,
  summarizeOrderItems,
} from '../../services/order-contract';
import { cancelOrderApi, getMyOrdersApi, OrderApiError } from '../../services/orders';
import { clearAuthSession, getSafeRedirectUrl } from '../../utils/auth';
import { clearPendingOrder, loadPendingOrder } from '../../utils/checkout';
import { calculatePrice } from '../../utils/price';
import ConfirmDialog from '../components/ConfirmDialog';

function formatVndPrice(amount: number): string {
  const safeValue = calculatePrice({ basePrice: amount, toppings: [], quantity: 1 });
  return `${safeValue.toLocaleString('vi-VN')}đ`;
}

function isOrderCancellable(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'PAYMENT_FAILED' || status === 'PAID';
}

function parseOrderActionError(err: unknown): { statusCode: number; message: string } {
  if (err && typeof err === 'object') {
    const candidate = err as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 0;
    const rawMessage = candidate.message;
    let message = '';
    if (Array.isArray(rawMessage)) {
      message = rawMessage.map((item) => String(item)).filter(Boolean).join(', ');
    } else if (typeof rawMessage === 'string') {
      message = rawMessage.trim();
    }
    return { statusCode, message };
  }
  return { statusCode: 0, message: '' };
}

function formatServerOrNetworkErrorMessage(statusCode: number, rawMessage: string): string {
  if (statusCode >= 500) {
    if (!rawMessage || rawMessage === 'Internal Server Error' || rawMessage === 'Mock Status') {
      return 'Máy chủ đang gặp sự cố tạm thời. Vui lòng thử lại.';
    }
    return rawMessage;
  }
  if (statusCode === 0) {
    return rawMessage || ORDER_ERROR_MESSAGES.NETWORK_ERROR;
  }
  return rawMessage || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR;
}

function clearMatchingPendingOrder(orderId: string): void {
  const storedPending = loadPendingOrder();
  if (storedPending && storedPending.orderId === orderId) {
    clearPendingOrder();
  }
}

function OrdersHistoryContent() {
  const router = useRouter();
  const [isSessionExpiredRedirecting, setIsSessionExpiredRedirecting] = useState(false);
  const { isChecking, isReady } = useRequireAuth({
    skipRedirect: isSessionExpiredRedirecting,
  });

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmTargetOrder, setConfirmTargetOrder] = useState<OrderResponse | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const cancelInFlightRef = useRef(false);

  const redirectToExpiredLogin = useCallback(() => {
    setIsSessionExpiredRedirecting(true);
    clearAuthSession();
    const browserPath =
      typeof window !== 'undefined' && window.location.pathname !== '/'
        ? window.location.pathname + window.location.search
        : '/orders';
    const currentPath = getSafeRedirectUrl(browserPath, '/orders');
    router.push(`/login?redirect=${encodeURIComponent(currentPath)}&expired=true`);
  }, [router]);

  useEffect(() => {
    if (!isReady) return;
    let isCancelled = false;

    // Server đã sắp xếp mới nhất trước, FE giữ nguyên thứ tự, không tự sắp xếp lại
    getMyOrdersApi()
      .then((data) => {
        if (!isCancelled) {
          setOrders(Array.isArray(data) ? data : []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          if (err instanceof OrderApiError) {
            if (err.statusCode === 401) {
              router.push(`/login?redirect=${encodeURIComponent('/orders')}&expired=true`);
              return;
            }
            setError(err.message || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
          } else {
            setError(ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
          }
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isReady, router]);

  const handleManualReload = useCallback(async () => {
    setIsReloading(true);
    setError(null);
    setActionFeedback(null);

    try {
      const data = await getMyOrdersApi();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      if (err instanceof OrderApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent('/orders')}&expired=true`);
          return;
        }
        setError(err.message || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
      } else {
        setError(ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
      }
    } finally {
      setLoading(false);
      setIsReloading(false);
    }
  }, [router]);

  const handleOpenCancelDialog = (order: OrderResponse) => {
    if (cancelInFlightRef.current || cancellingOrderId) return;
    setActionFeedback(null);
    setConfirmTargetOrder(order);
  };

  const handleCloseCancelDialog = () => {
    if (cancelInFlightRef.current || cancellingOrderId) return;
    setConfirmTargetOrder(null);
  };

  const handleConfirmCancelOrder = async () => {
    const targetOrder = confirmTargetOrder;
    if (!targetOrder || cancelInFlightRef.current) return;

    cancelInFlightRef.current = true;
    setCancellingOrderId(targetOrder.id);

    try {
      const cancelledOrder = await cancelOrderApi(targetOrder.id);
      clearMatchingPendingOrder(targetOrder.id);

      setOrders((prev) =>
        prev.map((item) =>
          item.id === targetOrder.id
            ? {
                ...item,
                ...cancelledOrder,
                status: cancelledOrder.status || 'CANCELLED',
              }
            : item
        )
      );
      setConfirmTargetOrder(null);
      setActionFeedback({
        type: 'success',
        message: `Đã hủy đơn #${targetOrder.orderNumber}.`,
      });
    } catch (err: unknown) {
      const parsed = parseOrderActionError(err);

      if (parsed.statusCode === 401) {
        setConfirmTargetOrder(null);
        redirectToExpiredLogin();
        return;
      }

      setConfirmTargetOrder(null);

      if (parsed.statusCode === 409) {
        setActionFeedback({
          type: 'error',
          message: parsed.message || ORDER_ERROR_MESSAGES.ORDER_CANCEL_INVALID,
        });
        try {
          const freshOrders = await getMyOrdersApi();
          const safeOrders = Array.isArray(freshOrders) ? freshOrders : [];
          setOrders(safeOrders);
          const refreshedTarget = safeOrders.find((o) => o.id === targetOrder.id);
          if (
            refreshedTarget &&
            refreshedTarget.status !== 'PENDING' &&
            refreshedTarget.status !== 'PAYMENT_FAILED'
          ) {
            clearMatchingPendingOrder(targetOrder.id);
          }
        } catch (reloadErr: unknown) {
          const reloadParsed = parseOrderActionError(reloadErr);
          if (reloadParsed.statusCode === 401) {
            redirectToExpiredLogin();
            return;
          }
        }
        return;
      }

      if (parsed.statusCode === 404) {
        clearMatchingPendingOrder(targetOrder.id);
        setActionFeedback({
          type: 'error',
          message: parsed.message || ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
        });
        try {
          const freshOrders = await getMyOrdersApi();
          setOrders(Array.isArray(freshOrders) ? freshOrders : []);
        } catch (reloadErr: unknown) {
          const reloadParsed = parseOrderActionError(reloadErr);
          if (reloadParsed.statusCode === 401) {
            redirectToExpiredLogin();
            return;
          }
        }
        return;
      }

      setActionFeedback({
        type: 'error',
        message: formatServerOrNetworkErrorMessage(parsed.statusCode, parsed.message),
      });
    } finally {
      cancelInFlightRef.current = false;
      setCancellingOrderId(null);
    }
  };

  // 1. Trạng thái Loading
  if (isChecking || !isReady || loading) {
    return (
      <div
        data-testid="orders-history-loading"
        className="max-w-4xl mx-auto py-16 text-center text-noir/65 text-sm space-y-4"
      >
        <div className="animate-spin inline-block w-8 h-8 border-3 border-kombu border-t-transparent rounded-full" />
        <p>Đang tải danh sách đơn hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái Error (kèm nút Thử lại)
  if (error) {
    return (
      <div
        data-testid="orders-history-error"
        className="max-w-md mx-auto my-8 bg-cream border border-tan/60 rounded-card p-6 sm:p-8 text-center shadow-soft space-y-4"
      >
        <div className="bg-error/10 border border-error/45 text-error p-4 rounded-control text-sm font-semibold">
          {error}
        </div>
        <div>
          <button
            type="button"
            onClick={handleManualReload}
            className="px-5 py-2.5 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-sm transition shadow-soft cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tiêu đề & Nút Tải lại */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tan/60 pb-4">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center text-xs sm:text-sm font-semibold text-noir/65 hover:text-kombu transition"
          >
            <span className="mr-1">←</span> Quay lại Menu
          </Link>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-noir">Đơn hàng của tôi</h1>
        </div>

        <button
          type="button"
          onClick={handleManualReload}
          disabled={isReloading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cream hover:bg-tan/30 text-noir border border-tan rounded-control text-xs sm:text-sm font-semibold transition shadow-soft disabled:opacity-45 cursor-pointer"
        >
          <span>↻</span>
          <span>{isReloading ? 'Đang tải lại...' : 'Tải lại'}</span>
        </button>
      </div>

      {/* Thông báo kết quả thao tác hủy đơn ngay trong trang */}
      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          data-testid={
            actionFeedback.type === 'error' ? 'orders-action-error' : 'orders-action-success'
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

      {/* 3. Trạng thái Empty ("Bạn chưa có đơn hàng nào" + nút "Xem menu") */}
      {orders.length === 0 ? (
        <div
          data-testid="orders-history-empty"
          className="max-w-md mx-auto my-8 bg-cream border border-tan/60 rounded-card py-12 px-6 text-center shadow-soft space-y-4"
        >
          <div className="w-20 h-20 bg-tan/45 rounded-full flex items-center justify-center mx-auto text-3xl text-kombu">
            📋
          </div>
          <h2 className="font-display text-lg font-bold text-noir">Bạn chưa có đơn hàng nào</h2>
          <p className="text-sm text-noir/65">
            Hãy khám phá thực đơn BrewLite và đặt ngay món đồ uống yêu thích của bạn nhé!
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block px-6 py-2.5 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-sm transition shadow-soft"
            >
              Xem menu
            </Link>
          </div>
        </div>
      ) : (
        /* 4. Danh sách đơn hàng (KHÔNG phân trang, KHÔNG lọc/tìm kiếm, giữ nguyên thứ tự server trả về) */
        <div className="space-y-4">
          {orders.map((order) => {
            const isPayable =
              order.status === 'PENDING' || order.status === 'PAYMENT_FAILED';
            const canCancel = isOrderCancellable(order.status);
            const isCancellingThis = cancellingOrderId === order.id;

            return (
              <div
                key={order.id}
                data-testid={`order-card-${order.orderNumber}`}
                className="block bg-cream hover:bg-tan/20 border border-tan/60 hover:border-tan rounded-card p-4 sm:p-5 shadow-soft hover:shadow-raised transition group"
              >
                <Link href={`/orders/${order.id}`} className="block">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-tan/40">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-display text-lg sm:text-xl font-bold text-noir group-hover:text-kombu transition">
                        #{order.orderNumber}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-bold ${getOrderStatusBadgeClass(
                          order.status
                        )}`}
                      >
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="text-caption font-semibold text-noir/70 bg-bone/70 border border-tan/50 px-2.5 py-0.5 rounded-control">
                        {RECEIVE_TYPE_LABELS[order.receiveType] || order.receiveType}
                      </span>
                    </div>

                    <div className="text-xs text-noir/60">
                      {formatVietnamDateTime(order.createdAt)}
                    </div>
                  </div>
                </Link>

                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-sm text-noir/75 font-medium line-clamp-2 sm:line-clamp-1 break-words">
                    {summarizeOrderItems(order.items)}
                  </p>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 flex-wrap">
                    <span className="font-display text-base sm:text-lg font-bold text-kombu">
                      {formatVndPrice(order.totalAmount)}
                    </span>
                    {isPayable && (
                      <Link
                        href={`/checkout?orderId=${encodeURIComponent(order.id)}`}
                        className="inline-flex items-center justify-center px-3.5 py-1.5 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-xs transition shadow-soft"
                      >
                        Thanh toán
                      </Link>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        disabled={cancellingOrderId !== null}
                        onClick={() => handleOpenCancelDialog(order)}
                        className="inline-flex items-center justify-center px-3.5 py-1.5 bg-cream hover:bg-error/10 text-error border border-error/45 font-semibold rounded-control text-xs transition disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isCancellingThis ? 'Đang hủy...' : 'Hủy đơn'}
                      </button>
                    )}
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-xs font-semibold text-kombu group-hover:translate-x-0.5 transition"
                    >
                      Chi tiết →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmTargetOrder)}
        title={confirmTargetOrder ? `Hủy đơn #${confirmTargetOrder.orderNumber}?` : ''}
        description="Bạn có chắc chắn muốn hủy đơn hàng này? Thao tác này không thể hoàn tác."
        cancelLabel="Giữ đơn"
        confirmLabel="Xác nhận hủy"
        processingLabel="Đang hủy..."
        variant="danger"
        isProcessing={cancellingOrderId !== null}
        onCancel={handleCloseCancelDialog}
        onConfirm={() => {
          void handleConfirmCancelOrder();
        }}
      >
        {confirmTargetOrder?.status === 'PAID' && (
          <p className="rounded-control border border-tan bg-bone/70 px-3 py-2 text-xs text-noir">
            Đơn hàng này đã thanh toán. Khi hủy, tiền sẽ được hoàn lại (mô phỏng).
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

export default function OrdersHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-16 text-center text-noir/65 text-sm">
          Đang tải lịch sử đơn hàng...
        </div>
      }
    >
      <OrdersHistoryContent />
    </Suspense>
  );
}

