'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { ICE_LABELS, SIZE_LABELS, SUGAR_LABELS } from '../../../services/api';
import { AUTH_ERROR_MESSAGES } from '../../../services/auth-contract';
import {
  formatVietnamDateTime,
  getOrderStatusBadgeClass,
  ORDER_STATUS_LABELS,
  OrderResponse,
  RECEIVE_TYPE_LABELS,
} from '../../../services/order-contract';
import { clearAuthSession, loadAuthSession, notifyAccountLocked } from '../../../utils/auth';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  canStaffCancelOrder,
  fetchStaffOrders,
  formatStaffVnd,
  getNextStaffOrderStatus,
  getStaffOrderActionStates,
  ParsedStaffOrderError,
  parseStaffOrderError,
  STAFF_ORDER_FILTER_OPTIONS,
  StaffOrderStatusFilter,
  updateStaffOrderStatus,
} from '../services/staff-orders';

interface ActionFeedback {
  type: 'success' | 'error';
  message: string;
}

export default function StaffOrdersView() {
  const router = useRouter();
  const { isHydrated, logout } = useAuth();

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState<StaffOrderStatusFilter>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<'advance' | 'cancel' | null>(null);
  const [cancelTargetOrder, setCancelTargetOrder] = useState<OrderResponse | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const requestSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const actionInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleAuthFailure = useCallback(
    (parsed: ParsedStaffOrderError): boolean => {
      if (parsed.isUnauthorized) {
        clearAuthSession();
        router.replace('/login?redirect=%2Fstaff&expired=true');
        return true;
      }
      if (parsed.isAccountLocked) {
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
    if (!isHydrated) return;

    const seq = ++requestSeqRef.current;
    let isCancelled = false;

    fetchStaffOrders(statusFilter)
      .then((data) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        const safeOrders = Array.isArray(data) ? data : [];
        setOrders(safeOrders);
        setExpandedOrderId((prev) =>
          prev && safeOrders.some((order) => order.id === prev) ? prev : null
        );
        setError(null);
        setLoading(false);
        setIsReloading(false);
      })
      .catch((err: unknown) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffOrderError(err);
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
  }, [isHydrated, statusFilter]);

  const runReloadOrders = useCallback(
    async (
      filter: StaffOrderStatusFilter,
      options?: { showFullLoading?: boolean; keepFeedback?: boolean }
    ) => {
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
        const data = await fetchStaffOrders(filter);
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        const safeOrders = Array.isArray(data) ? data : [];
        setOrders(safeOrders);
        setExpandedOrderId((prev) =>
          prev && safeOrders.some((order) => order.id === prev) ? prev : null
        );
      } catch (err: unknown) {
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffOrderError(err);
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
    []
  );

  const handleFilterChange = (nextFilter: StaffOrderStatusFilter) => {
    setStatusFilter(nextFilter);
    setExpandedOrderId(null);
    setError(null);
    setActionFeedback(null);
    setLoading(true);
  };

  const handleManualReload = () => {
    void runReloadOrders(statusFilter, { showFullLoading: false, keepFeedback: false });
  };

  const handleRetryLoad = () => {
    void runReloadOrders(statusFilter, { showFullLoading: true, keepFeedback: false });
  };

  const toggleOrderDetail = (orderId: string) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
  };

  const applyUpdatedOrder = (originalOrder: OrderResponse, updatedOrder: OrderResponse) => {
    const mergedOrder: OrderResponse = {
      ...originalOrder,
      ...updatedOrder,
      customer: updatedOrder.customer ?? originalOrder.customer,
    };

    if (statusFilter !== 'ALL' && mergedOrder.status !== statusFilter) {
      setOrders((prev) => prev.filter((item) => item.id !== mergedOrder.id));
      setExpandedOrderId((prev) => (prev === mergedOrder.id ? null : prev));
      return;
    }

    setOrders((prev) =>
      prev.map((item) => (item.id === mergedOrder.id ? mergedOrder : item))
    );
  };

  const handleAdvanceOrder = async (order: OrderResponse) => {
    const nextStatus = getNextStaffOrderStatus(order.status);
    if (!nextStatus || actionInFlightRef.current || updatingOrderId !== null) return;

    actionInFlightRef.current = true;
    setUpdatingOrderId(order.id);
    setUpdatingAction('advance');
    setActionFeedback(null);

    try {
      const updated = await updateStaffOrderStatus(order.id, nextStatus);
      if (!isMountedRef.current) return;

      applyUpdatedOrder(order, updated);
      setActionFeedback({
        type: 'success',
        message: `Đã chuyển đơn #${order.orderNumber} sang trạng thái '${ORDER_STATUS_LABELS[updated.status] || updated.status}'.`,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffOrderError(err);

      if (handleAuthFailureRef.current(parsed)) {
        setError(parsed.message);
        return;
      }

      setActionFeedback({ type: 'error', message: parsed.message });

      if (parsed.isConflict || parsed.isNotFound) {
        await runReloadOrders(statusFilter, { showFullLoading: false, keepFeedback: true });
      }
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) {
        setUpdatingOrderId(null);
        setUpdatingAction(null);
      }
    }
  };

  const handleOpenCancelDialog = (order: OrderResponse) => {
    if (!canStaffCancelOrder(order.status) || actionInFlightRef.current || updatingOrderId !== null) {
      return;
    }
    setActionFeedback(null);
    setCancelTargetOrder(order);
  };

  const handleCloseCancelDialog = () => {
    if (actionInFlightRef.current || updatingOrderId !== null) return;
    setCancelTargetOrder(null);
  };

  const handleConfirmCancelOrder = async () => {
    const targetOrder = cancelTargetOrder;
    if (!targetOrder || actionInFlightRef.current) return;

    actionInFlightRef.current = true;
    setUpdatingOrderId(targetOrder.id);
    setUpdatingAction('cancel');

    try {
      const updated = await updateStaffOrderStatus(targetOrder.id, 'CANCELLED');
      if (!isMountedRef.current) return;

      setCancelTargetOrder(null);
      applyUpdatedOrder(targetOrder, updated);
      setActionFeedback({
        type: 'success',
        message: `Đã hủy đơn #${targetOrder.orderNumber}.`,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffOrderError(err);

      setCancelTargetOrder(null);

      if (handleAuthFailureRef.current(parsed)) {
        setError(parsed.message);
        return;
      }

      setActionFeedback({ type: 'error', message: parsed.message });

      if (parsed.isConflict || parsed.isNotFound) {
        await runReloadOrders(statusFilter, { showFullLoading: false, keepFeedback: true });
      }
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) {
        setUpdatingOrderId(null);
        setUpdatingAction(null);
      }
    }
  };

  return (
    <section aria-labelledby="staff-orders-heading" className="space-y-6">
      {/* Đầu trang & Bộ lọc trạng thái */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-tan/70 pb-5">
        <div>
          <h1 id="staff-orders-heading" className="font-display text-3xl font-bold text-noir">
            Đơn hàng
          </h1>
          <p className="mt-1 text-sm text-noir/65">
            Xem toàn bộ đơn hàng của khách, kiểm tra chi tiết món và cập nhật trạng thái xử lý tại quầy.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <label
              htmlFor="staff-order-status-filter"
              className="block text-xs font-semibold text-noir/75 mb-1"
            >
              Lọc theo trạng thái
            </label>
            <select
              id="staff-order-status-filter"
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              disabled={loading || isReloading || updatingOrderId !== null}
              onChange={(e) => handleFilterChange(e.target.value as StaffOrderStatusFilter)}
              className="min-h-10 min-w-52 rounded-control border border-tan bg-cream px-3 py-2 text-sm font-medium text-noir focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-55"
            >
              {STAFF_ORDER_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleManualReload}
            disabled={loading || isReloading || updatingOrderId !== null}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-control border border-tan bg-cream hover:bg-tan/40 px-4 py-2 text-sm font-semibold text-noir transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>↻</span>
            <span>{isReloading ? 'Đang tải lại...' : 'Tải lại'}</span>
          </button>
        </div>
      </div>

      {/* Thông báo kết quả / lỗi thao tác trên đơn hàng (409, thành công, v.v.) */}
      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          data-testid={
            actionFeedback.type === 'error'
              ? 'staff-orders-action-error'
              : 'staff-orders-action-success'
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
          data-testid="staff-orders-loading"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center text-sm text-noir/70 shadow-soft space-y-3"
        >
          <div className="animate-spin inline-block w-8 h-8 border-2 border-kombu border-t-transparent rounded-full" />
          <p>Đang tải danh sách đơn hàng...</p>
        </div>
      )}

      {/* Trạng thái Error */}
      {!loading && error && (
        <div
          role="alert"
          data-testid="staff-orders-error"
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
      {!loading && !error && orders.length === 0 && (
        <div
          data-testid="staff-orders-empty"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center shadow-soft space-y-4"
        >
          <p className="font-display text-lg font-bold text-noir">
            {statusFilter === 'ALL'
              ? 'Chưa có đơn hàng nào'
              : `Không có đơn hàng nào ở trạng thái '${ORDER_STATUS_LABELS[statusFilter]}'`}
          </p>
          <p className="text-sm text-noir/65">
            {statusFilter === 'ALL'
              ? 'Khi khách đặt đơn mới, đơn hàng sẽ hiển thị tại đây.'
              : 'Thử chọn trạng thái khác hoặc xem toàn bộ danh sách đơn.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            {statusFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => handleFilterChange('ALL')}
                className="px-4 py-2 rounded-control bg-kombu hover:bg-noir text-bone text-sm font-semibold transition shadow-soft cursor-pointer"
              >
                Xem tất cả trạng thái
              </button>
            )}
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

      {/* Bảng danh sách đơn hàng (tối ưu cho máy tính) */}
      {!loading && !error && orders.length > 0 && (
        <div className="rounded-card border border-tan bg-cream shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-tan bg-bone/60 text-xs font-bold uppercase tracking-wide text-noir/75">
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                    Mã đơn
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Khách hàng
                  </th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap text-right">
                    Tổng tiền
                  </th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                    Giờ đặt
                  </th>
                  <th
                    scope="col"
                    className="w-[392px] min-w-[392px] px-4 py-3.5 whitespace-nowrap text-center"
                  >
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tan/60 text-sm">
                {orders.map((order) => {
                  const isExpanded = expandedOrderId === order.id;
                  const actionStates = getStaffOrderActionStates(order.status);
                  const nextStatus = actionStates.advance.nextStatus;
                  const isThisOrderUpdating = updatingOrderId === order.id;
                  const isAnyOrderUpdating = updatingOrderId !== null;
                  const isAdvanceDisabled = !actionStates.advance.enabled || isAnyOrderUpdating;
                  const isCancelDisabled = !actionStates.cancel.enabled || isAnyOrderUpdating;
                  const advanceTitle =
                    actionStates.advance.enabled && isAnyOrderUpdating
                      ? isThisOrderUpdating && updatingAction === 'advance'
                        ? 'Đang cập nhật trạng thái đơn...'
                        : 'Đang xử lý đơn hàng khác, vui lòng chờ...'
                      : actionStates.advance.reason;
                  const cancelTitle =
                    actionStates.cancel.enabled && isAnyOrderUpdating
                      ? isThisOrderUpdating && updatingAction === 'cancel'
                        ? 'Đang hủy đơn hàng...'
                        : 'Đang xử lý đơn hàng khác, vui lòng chờ...'
                      : actionStates.cancel.reason;
                  const detailTitle = isExpanded
                    ? 'Thu gọn chi tiết đơn hàng'
                    : actionStates.detail.reason;
                  const customerName = order.customer?.displayName?.trim() || 'Khách hàng';

                  return (
                    <React.Fragment key={order.id}>
                      <tr
                        data-testid={`staff-order-row-${order.orderNumber}`}
                        onClick={() => {
                          const selection =
                            typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
                          if (selection) return;
                          toggleOrderDetail(order.id);
                        }}
                        className={`transition cursor-pointer ${
                          isExpanded ? 'bg-tan/25' : 'hover:bg-bone/45'
                        }`}
                      >
                        <td className="px-4 py-4 whitespace-nowrap font-display text-base font-bold text-noir">
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-noir/60" aria-hidden="true">
                              {isExpanded ? '▾' : '▸'}
                            </span>
                            <span>#{order.orderNumber}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-noir">{customerName}</p>
                          <p className="text-xs text-noir/60">
                            {RECEIVE_TYPE_LABELS[order.receiveType] || order.receiveType} •{' '}
                            {order.items.length} dòng món
                          </p>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right font-display font-bold text-kombu">
                          {formatStaffVnd(order.totalAmount)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption ${getOrderStatusBadgeClass(
                              order.status
                            )}`}
                          >
                            {ORDER_STATUS_LABELS[order.status] || order.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-noir/75">
                          {formatVietnamDateTime(order.createdAt)}
                        </td>
                        <td
                          className="w-[392px] min-w-[392px] px-4 py-4 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            data-testid={`staff-order-actions-${order.orderNumber}`}
                            className="mx-auto grid w-[360px] grid-cols-3 gap-1.5"
                          >
                            <span title={detailTitle} className="inline-flex h-10 w-full">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => toggleOrderDetail(order.id)}
                                className="inline-flex h-10 w-full items-center justify-center whitespace-normal rounded-control border border-tan bg-bone/70 px-2 text-center text-xs font-semibold leading-tight text-noir transition hover:bg-tan/50 cursor-pointer"
                              >
                                {isExpanded ? 'Thu gọn' : 'Chi tiết'}
                              </button>
                            </span>

                            <span
                              title={advanceTitle}
                              className={`inline-flex h-10 w-full ${
                                isAdvanceDisabled ? 'cursor-not-allowed' : ''
                              }`}
                            >
                              <button
                                type="button"
                                disabled={isAdvanceDisabled}
                                onClick={() => {
                                  void handleAdvanceOrder(order);
                                }}
                                className={`inline-flex h-10 w-full items-center justify-center whitespace-normal rounded-control px-1.5 text-center text-[11px] font-semibold leading-tight transition ${
                                  actionStates.advance.enabled
                                    ? 'bg-kombu text-bone shadow-soft hover:bg-noir disabled:opacity-50 disabled:pointer-events-none cursor-pointer'
                                    : 'border border-neutral-300 bg-neutral-200/80 text-neutral-500 shadow-none disabled:pointer-events-none'
                                }`}
                              >
                                {isThisOrderUpdating && updatingAction === 'advance'
                                  ? 'Đang cập nhật...'
                                  : 'Chuyển sang bước tiếp theo'}
                              </button>
                            </span>

                            <span
                              title={cancelTitle}
                              className={`inline-flex h-10 w-full ${
                                isCancelDisabled ? 'cursor-not-allowed' : ''
                              }`}
                            >
                              <button
                                type="button"
                                disabled={isCancelDisabled}
                                onClick={() => handleOpenCancelDialog(order)}
                                className={`inline-flex h-10 w-full items-center justify-center whitespace-normal rounded-control px-2 text-center text-xs font-semibold leading-tight transition ${
                                  actionStates.cancel.enabled
                                    ? 'border border-error/45 bg-cream text-error hover:bg-error/10 disabled:opacity-50 disabled:pointer-events-none cursor-pointer'
                                    : 'border border-neutral-300 bg-neutral-200/80 text-neutral-500 shadow-none disabled:pointer-events-none'
                                }`}
                              >
                                {isThisOrderUpdating && updatingAction === 'cancel'
                                  ? 'Đang hủy...'
                                  : 'Hủy đơn'}
                              </button>
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr
                          data-testid={`staff-order-detail-${order.orderNumber}`}
                          className="bg-bone/55"
                        >
                          <td colSpan={6} className="px-6 py-4">
                            <div className="rounded-control border border-tan/80 bg-cream p-4 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tan/50 pb-2.5 text-xs text-noir/75">
                                <div className="flex flex-wrap items-center gap-4">
                                  <span>
                                    <strong className="text-noir">Hình thức nhận:</strong>{' '}
                                    {RECEIVE_TYPE_LABELS[order.receiveType] || order.receiveType}
                                  </span>
                                  {order.customer?.email && (
                                    <span>
                                      <strong className="text-noir">Email khách:</strong>{' '}
                                      {order.customer.email}
                                    </span>
                                  )}
                                </div>
                                {nextStatus && (
                                  <span className="font-semibold text-kombu">
                                    Bước tiếp theo: {ORDER_STATUS_LABELS[nextStatus]}
                                  </span>
                                )}
                              </div>

                              {order.note && (
                                <p className="rounded-control bg-bone/70 border border-tan/60 px-3 py-2 text-xs text-noir">
                                  <strong>Ghi chú đơn:</strong> {order.note}
                                </p>
                              )}

                              <div className="space-y-2">
                                <h2 className="text-xs font-bold uppercase tracking-wide text-noir/70">
                                  Chi tiết món ({order.items.length})
                                </h2>
                                <ul className="divide-y divide-tan/50">
                                  {order.items.map((item, index) => {
                                    const hasDrinkOptions = Boolean(
                                      item.size || item.sugarLevel || item.iceLevel
                                    );
                                    const toppings = item.toppings ?? [];

                                    return (
                                      <li
                                        key={item.id ?? `${order.id}-item-${index}`}
                                        className="py-2.5 flex items-start justify-between gap-4 text-sm"
                                      >
                                        <div className="space-y-1 min-w-0">
                                          <p className="font-semibold text-noir">
                                            {item.productName}{' '}
                                            <span className="text-kombu">x{item.quantity}</span>
                                          </p>

                                          {hasDrinkOptions && (
                                            <p className="text-xs text-noir/70">
                                              {[
                                                item.size ? SIZE_LABELS[item.size] || item.size : null,
                                                item.sugarLevel
                                                  ? `Đường ${
                                                      SUGAR_LABELS[item.sugarLevel] ||
                                                      item.sugarLevel
                                                    }`
                                                  : null,
                                                item.iceLevel
                                                  ? ICE_LABELS[item.iceLevel] || item.iceLevel
                                                  : null,
                                              ]
                                                .filter(Boolean)
                                                .join(' • ')}
                                            </p>
                                          )}

                                          {toppings.length > 0 && (
                                            <p className="text-xs text-noir/70">
                                              Topping:{' '}
                                              {toppings
                                                .map(
                                                  (t) =>
                                                    `${t.name} (+${formatStaffVnd(t.price)})`
                                                )
                                                .join(', ')}
                                            </p>
                                          )}

                                          {item.note && (
                                            <p className="text-xs italic text-noir/65">
                                              Ghi chú món: {item.note}
                                            </p>
                                          )}
                                        </div>

                                        <div className="text-right shrink-0">
                                          <p className="font-semibold text-noir">
                                            {formatStaffVnd(item.lineTotal)}
                                          </p>
                                          <p className="text-xs text-noir/60">
                                            {formatStaffVnd(item.unitPrice)} / món
                                          </p>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hộp xác nhận hủy đơn */}
      <ConfirmDialog
        isOpen={Boolean(cancelTargetOrder)}
        title={cancelTargetOrder ? `Hủy đơn #${cancelTargetOrder.orderNumber}?` : ''}
        description="Bạn có chắc chắn muốn hủy đơn hàng này? Thao tác này không thể hoàn tác."
        cancelLabel="Đóng"
        confirmLabel="Xác nhận hủy"
        processingLabel="Đang hủy..."
        variant="danger"
        isProcessing={updatingOrderId !== null}
        onCancel={handleCloseCancelDialog}
        onConfirm={() => {
          void handleConfirmCancelOrder();
        }}
      >
        {cancelTargetOrder?.status === 'PAID' && (
          <p className="rounded-control border border-tan bg-bone/70 px-3 py-2 text-xs text-noir">
            Đơn hàng này đã thanh toán. Khi hủy, tiền sẽ được hoàn lại (mô phỏng).
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
