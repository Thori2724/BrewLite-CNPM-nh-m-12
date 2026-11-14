'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '../../../context/useRequireAuth';
import {
  OrderResponse,
  OrderStatus,
  PaymentStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BANNERS,
  ORDER_MAIN_FLOW_STEPS,
  RECEIVE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  ORDER_ERROR_MESSAGES,
  formatVietnamDateTime,
  getOrderStatusBadgeClass,
} from '../../../services/order-contract';
import {
  SIZE_LABELS,
  SUGAR_LABELS,
  ICE_LABELS,
  SizeId,
  SugarLevel,
  IceLevel,
} from '../../../services/api';
import { getOrderByIdApi, OrderApiError } from '../../../services/orders';
import {
  generateIdempotencyKey,
  loadPendingOrder,
  savePendingOrder,
} from '../../../utils/checkout';
import { calculatePrice } from '../../../utils/price';

function formatVndPrice(amount: number): string {
  const safeValue = calculatePrice({ basePrice: amount, toppings: [], quantity: 1 });
  return `${safeValue.toLocaleString('vi-VN')}đ`;
}

function getBannerStyleClass(status: OrderStatus): string {
  const config = ORDER_STATUS_BANNERS[status];
  switch (config?.variant) {
    case 'success':
      return 'bg-tan/35 border-moss/60 text-kombu';
    case 'warning':
      return 'bg-warning/15 border-warning/40 text-noir';
    case 'error':
      return 'bg-error/10 border-error/45 text-error';
    case 'info':
      return 'bg-tan/30 border-tan text-noir';
    case 'neutral':
    default:
      return 'bg-tan/20 border-tan/60 text-noir';
  }
}

function getPaymentStatusBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-moss text-kombu font-bold';
    case 'FAILED':
      return 'bg-error/15 text-error border border-error/30 font-bold';
    case 'PENDING':
    default:
      return 'bg-warning text-noir font-bold';
  }
}

function OrderDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { isChecking, isReady } = useRequireAuth();

  const orderId =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : '';

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Gọi GET /orders/:id ĐÚNG MỘT LẦN khi mở trang và đã xác nhận đăng nhập (KHÔNG polling, KHÔNG setInterval)
  useEffect(() => {
    if (!isReady || !orderId) return;
    let isCancelled = false;

    getOrderByIdApi(orderId)
      .then((data) => {
        if (!isCancelled) {
          setOrder(data);
          setError(null);
          setIsNotFound(false);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          if (err instanceof OrderApiError) {
            if (err.statusCode === 401) {
              router.push(`/login?redirect=${encodeURIComponent(`/orders/${orderId}`)}&expired=true`);
              return;
            }
            if (err.statusCode === 404) {
              setIsNotFound(true);
              setOrder(null);
              setLoading(false);
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
  }, [isReady, orderId, router]);

  // Gọi lại API khi người dùng bấm nút "Tải lại" hoặc "Thử lại"
  const handleManualReload = useCallback(async () => {
    if (!orderId) return;
    setIsReloading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await getOrderByIdApi(orderId);
      setOrder(data);
    } catch (err: unknown) {
      if (err instanceof OrderApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/orders/${orderId}`)}&expired=true`);
          return;
        }
        if (err.statusCode === 404) {
          setIsNotFound(true);
          setOrder(null);
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
  }, [orderId, router]);

  // Xử lý bấm nút "Thanh toán" / "Thử lại thanh toán" cho đơn PENDING hoặc PAYMENT_FAILED
  // Lưu đơn chờ kèm Idempotency-Key MỚI vào localStorage rồi chuyển sang /checkout (bước thanh toán)
  // TUYỆT ĐỐI không tạo đơn mới
  const handleRetryPayment = () => {
    if (!order) return;

    const newIdempotencyKey = generateIdempotencyKey();
    const sortedPayments = [...(order.payments || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestMethod = sortedPayments[0]?.method || 'WALLET';
    const existingPending = loadPendingOrder();
    const shouldKeepCreatedFromCart =
      existingPending?.orderId === order.id && existingPending.createdFromCart === true;

    savePendingOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      receiveType: order.receiveType,
      idempotencyKey: newIdempotencyKey,
      method: latestMethod,
      createdAt: order.createdAt,
      itemCount: order.items?.length || 1,
      ...(shouldKeepCreatedFromCart ? { createdFromCart: true } : {}),
    });

    router.push(`/checkout?orderId=${encodeURIComponent(order.id)}`);
  };

  // 1. Chờ kiểm tra đăng nhập hoặc đang tải lần đầu
  if (isChecking || !isReady || loading) {
    return (
      <div
        data-testid="order-detail-loading"
        className="max-w-4xl mx-auto py-16 text-center text-noir/65 text-sm space-y-4"
      >
        <div className="animate-spin inline-block w-8 h-8 border-3 border-kombu border-t-transparent rounded-full" />
        <p>Đang tải thông tin đơn hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái 404: Không tìm thấy đơn hàng (hoặc đơn không thuộc về người dùng)
  if (isNotFound) {
    return (
      <div
        data-testid="order-not-found"
        className="max-w-md mx-auto my-8 bg-cream border border-tan/60 rounded-card py-12 px-6 text-center shadow-soft space-y-4"
      >
        <div className="w-16 h-16 bg-tan/45 text-kombu rounded-full flex items-center justify-center mx-auto text-3xl">
          🔍
        </div>
        <h1 className="font-display text-xl font-bold text-noir">Không tìm thấy đơn hàng</h1>
        <p className="text-sm text-noir/65">
          Đơn hàng này không tồn tại hoặc bạn không có quyền truy cập.
        </p>
        <div className="pt-2">
          <Link
            href="/orders"
            className="inline-block px-6 py-2.5 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-sm transition shadow-soft"
          >
            ← Về lịch sử đơn hàng
          </Link>
        </div>
      </div>
    );
  }

  // 3. Trạng thái Lỗi mạng hoặc lỗi khác
  if (error || !order) {
    return (
      <div
        data-testid="order-detail-error"
        className="max-w-md mx-auto my-8 bg-cream border border-tan/60 rounded-card p-6 sm:p-8 text-center shadow-soft space-y-4"
      >
        <div className="bg-error/10 border border-error/45 text-error p-4 rounded-control text-sm font-semibold">
          {error || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR}
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={handleManualReload}
            className="px-5 py-2.5 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-sm transition shadow-soft cursor-pointer"
          >
            Thử lại
          </button>
          <Link
            href="/orders"
            className="px-5 py-2.5 bg-cream hover:bg-tan/30 text-noir border border-tan font-semibold rounded-control text-sm transition shadow-soft"
          >
            Về lịch sử đơn
          </Link>
        </div>
      </div>
    );
  }

  // Sắp xếp lịch sử thanh toán mới nhất lên trước
  const sortedPayments = [...(order.payments || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latestPayment = sortedPayments[0];
  const latestFailureReason =
    order.status === 'PAYMENT_FAILED'
      ? sortedPayments.find((p) => p.status === 'FAILED' && p.failureReason)?.failureReason ||
        latestPayment?.failureReason ||
        null
      : null;

  const bannerConfig = ORDER_STATUS_BANNERS[order.status] || ORDER_STATUS_BANNERS.PENDING;
  const showStepper =
    order.status !== 'PAYMENT_FAILED' &&
    order.status !== 'CANCELLED' &&
    ORDER_MAIN_FLOW_STEPS.includes(order.status);
  const currentStepIndex = ORDER_MAIN_FLOW_STEPS.indexOf(order.status);
  const isPayable = order.status === 'PENDING' || order.status === 'PAYMENT_FAILED';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Thanh điều hướng trên cùng & Nút Tải lại */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tan/60 pb-4">
        <Link
          href="/orders"
          className="inline-flex items-center text-xs sm:text-sm font-semibold text-noir/65 hover:text-kombu transition"
        >
          <span className="mr-1">←</span> Xem lịch sử đơn
        </Link>

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

      {/* 1. Banner đầu trang theo status */}
      <div
        data-testid="order-status-banner"
        className={`p-5 sm:p-6 rounded-card border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${getBannerStyleClass(
          order.status
        )}`}
      >
        <div className="space-y-1">
          <h1 className="font-display text-lg sm:text-xl font-bold">{bannerConfig.title}</h1>
          <p className="text-xs sm:text-sm opacity-90">{bannerConfig.description}</p>
          {order.status === 'PAYMENT_FAILED' && latestFailureReason && (
            <p
              data-testid="banner-failure-reason"
              className="text-xs sm:text-sm font-semibold text-error pt-1"
            >
              Lý do: {latestFailureReason}
            </p>
          )}
        </div>

        {/* 2. Mã đơn #orderNumber nổi bật & 3. Badge trạng thái tiếng Việt */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
          <div className="text-left sm:text-right">
            <span className="text-xs uppercase tracking-wider opacity-75 block">Mã đơn hàng</span>
            <span
              data-testid="order-number-heading"
              className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            >
              #{order.orderNumber}
            </span>
          </div>
          <span
            data-testid="order-status-badge"
            className={`inline-flex items-center px-3 py-1 rounded-full text-caption font-bold ${getOrderStatusBadgeClass(
              order.status
            )}`}
          >
            {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
      </div>

      {/* 4. Thanh tiến trình (Stepper) cho luồng chính (ẩn khi PAYMENT_FAILED hoặc CANCELLED) */}
      {showStepper && (
        <div
          data-testid="order-progress-stepper"
          className="bg-cream p-5 sm:p-6 rounded-card border border-tan/60 shadow-soft"
        >
          <h2 className="font-display text-sm font-bold text-noir mb-4">Tiến trình đơn hàng</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 sm:gap-2">
            {ORDER_MAIN_FLOW_STEPS.map((stepStatus, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={stepStatus}
                  data-current={isCurrent ? 'true' : 'false'}
                  className={`flex sm:flex-col items-center gap-3 sm:gap-2 p-2.5 sm:p-3 rounded-control border text-center transition ${
                    isCurrent
                      ? 'border-kombu bg-tan/30 text-noir font-bold shadow-soft'
                      : isCompleted
                        ? 'border-moss/50 bg-moss/15 text-kombu font-semibold'
                        : 'border-tan/50 bg-bone/40 text-noir/45'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isCurrent
                        ? 'bg-kombu text-bone shadow-soft'
                        : isCompleted
                          ? 'bg-moss text-kombu font-bold'
                          : 'bg-tan/50 text-noir/60'
                    }`}
                  >
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <span className="text-xs sm:text-[13px] leading-tight">
                    {ORDER_STATUS_LABELS[stepStatus]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bố cục 2 cột trên Desktop: Cột trái (Danh sách món + Lịch sử thanh toán), Cột phải (Thông tin đơn + Tổng tiền + Nút hành động) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (7 CỘT) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 6. Danh sách món trong items */}
          <div className="bg-cream p-5 sm:p-6 rounded-card border border-tan/60 shadow-soft space-y-4">
            <h2 className="font-display text-base font-bold text-noir border-b border-tan/60 pb-3">
              Danh sách món đã đặt ({order.items?.length || 0} dòng món)
            </h2>

            <div className="divide-y divide-tan/40">
              {(order.items || []).map((item, idx) => {
                // Món bánh có size, sugarLevel, iceLevel đều là null -> ẩn hoàn toàn
                const hasSize = item.size !== null && item.size !== undefined;
                const hasSugar = item.sugarLevel !== null && item.sugarLevel !== undefined;
                const hasIce = item.iceLevel !== null && item.iceLevel !== undefined;
                const hasDrinkOptions = hasSize || hasSugar || hasIce;
                const hasToppings = Array.isArray(item.toppings) && item.toppings.length > 0;
                const hasItemNote = Boolean(item.note && item.note.trim());

                return (
                  <div
                    key={item.id || `${item.productId}-${idx}`}
                    data-testid={`order-item-row-${idx}`}
                    className="py-3.5 first:pt-0 last:pb-0 flex justify-between items-start gap-4"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="font-display text-sm sm:text-base font-bold text-noir break-words">
                          {item.productName}
                        </h3>
                        <span className="text-xs sm:text-sm font-bold text-kombu bg-tan/40 px-2 py-0.5 rounded-control">
                          x{item.quantity}
                        </span>
                      </div>

                      {/* Size / Đường / Đá: ẩn hoàn toàn nếu giá trị là null */}
                      {hasDrinkOptions && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-noir/70">
                          {hasSize && (
                            <span>
                              Kích cỡ:{' '}
                              <strong>
                                {SIZE_LABELS[item.size as SizeId] || `Size ${item.size}`}
                              </strong>
                            </span>
                          )}
                          {hasSugar && (
                            <span>
                              Đường:{' '}
                              <strong>
                                {SUGAR_LABELS[item.sugarLevel as SugarLevel] || item.sugarLevel}
                              </strong>
                            </span>
                          )}
                          {hasIce && (
                            <span>
                              Đá:{' '}
                              <strong>
                                {ICE_LABELS[item.iceLevel as IceLevel] || item.iceLevel}
                              </strong>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Danh sách toppings (tên + giá) */}
                      {hasToppings && (
                        <div className="text-xs text-noir/65">
                          <span>Topping: </span>
                          <span className="font-medium text-noir">
                            {item.toppings!
                              .map((t) => `${t.name} (+${formatVndPrice(t.price)})`)
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Ghi chú của món (ẩn nếu null) */}
                      {hasItemNote && (
                        <div className="text-xs italic text-noir/60">
                          Ghi chú món: &ldquo;{item.note}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* unitPrice và lineTotal từ server */}
                    <div className="text-right shrink-0">
                      <div className="text-xs text-noir/50">
                        Đơn giá: {formatVndPrice(item.unitPrice)}
                      </div>
                      <div className="font-display text-sm sm:text-base font-bold text-kombu mt-0.5">
                        {formatVndPrice(item.lineTotal)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 8. Lịch sử thanh toán từ mảng payments (sắp xếp mới nhất lên trước, KHÔNG hiển thị amount) */}
          <div className="bg-cream p-5 sm:p-6 rounded-card border border-tan/60 shadow-soft space-y-4">
            <h2 className="font-display text-base font-bold text-noir border-b border-tan/60 pb-3">
              Lịch sử thanh toán
            </h2>

            {sortedPayments.length === 0 ? (
              <p className="text-sm text-noir/65 py-2">Chưa có giao dịch thanh toán</p>
            ) : (
              <div className="space-y-3">
                {sortedPayments.map((payment) => (
                  <div
                    key={payment.id}
                    data-testid="payment-history-item"
                    className="p-3.5 rounded-control border border-tan/60 bg-bone/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-noir">
                          {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                        </span>
                        <span className="font-mono text-xs text-noir/80 bg-cream px-2 py-0.5 rounded-control border border-tan/60">
                          •••• {payment.accountLast4}
                        </span>
                      </div>
                      <div className="text-xs text-noir/60">
                        Thời gian: {formatVietnamDateTime(payment.createdAt)}
                      </div>
                      {payment.failureReason && (
                        <div className="text-xs text-error font-medium">
                          Lý do lỗi: {payment.failureReason}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 self-start sm:self-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-caption font-bold ${getPaymentStatusBadgeClass(
                          payment.status
                        )}`}
                      >
                        {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI (5 CỘT): Thông tin đơn, Tổng tiền & Các nút điều hướng */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-5">
          <div className="bg-cream p-5 sm:p-6 rounded-card border border-tan/60 shadow-soft space-y-4">
            <h2 className="font-display text-base font-bold text-noir border-b border-tan/60 pb-3">
              Thông tin đơn hàng
            </h2>

            {/* 5. Thông tin đơn: hình thức nhận, thời gian đặt, ghi chú đơn (ẩn nếu null) */}
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-noir/65">Mã đơn:</span>
                <span className="font-display font-bold text-noir">#{order.orderNumber}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-noir/65">Trạng thái:</span>
                <span className="font-semibold text-noir">
                  {ORDER_STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-noir/65">Hình thức nhận:</span>
                <span className="font-semibold text-noir">
                  {RECEIVE_TYPE_LABELS[order.receiveType] || order.receiveType}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-noir/65">Thời gian đặt:</span>
                <span className="font-medium text-noir">
                  {formatVietnamDateTime(order.createdAt)}
                </span>
              </div>

              {order.note && order.note.trim() && (
                <div className="pt-2 border-t border-tan/60">
                  <span className="text-noir/65 block text-xs mb-1">Ghi chú đơn hàng:</span>
                  <p className="text-noir bg-tan/25 border border-tan/60 rounded-control p-2.5 text-xs sm:text-sm">
                    {order.note}
                  </p>
                </div>
              )}
            </div>

            {/* 7. Tổng tiền: totalAmount lấy nguyên giá trị server trả về */}
            <div className="pt-3 border-t border-tan/60">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-noir">Tổng tiền đơn hàng:</span>
                <span
                  data-testid="order-total-amount"
                  className="font-display text-xl sm:text-2xl font-bold text-kombu"
                >
                  {formatVndPrice(order.totalAmount)}
                </span>
              </div>
            </div>

            {/* 9. Các nút hành động (KHÔNG có nút Hủy đơn) */}
            <div className="pt-2 space-y-2.5">
              {isPayable && (
                <button
                  type="button"
                  onClick={handleRetryPayment}
                  className="w-full min-h-11 py-3.5 bg-kombu hover:bg-noir text-bone font-bold rounded-control text-sm transition shadow-soft cursor-pointer"
                >
                  {order.status === 'PAYMENT_FAILED' ? 'Thử lại thanh toán' : 'Thanh toán đơn hàng'}
                </button>
              )}

              <Link
                href="/"
                className={`flex items-center justify-center min-h-11 w-full py-3 font-bold rounded-control text-sm transition text-center shadow-soft ${
                  isPayable
                    ? 'bg-cream hover:bg-tan/30 text-noir border border-tan shadow-none'
                    : 'bg-kombu hover:bg-noir text-bone'
                }`}
              >
                Tiếp tục đặt món
              </Link>

              <Link
                href="/orders"
                className="flex items-center justify-center min-h-11 w-full py-2.5 bg-cream hover:bg-tan/30 text-noir/80 border border-tan font-semibold rounded-control text-sm transition text-center"
              >
                Xem lịch sử đơn
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-16 text-center text-noir/65 text-sm">
          Đang tải chi tiết đơn hàng...
        </div>
      }
    >
      <OrderDetailContent />
    </Suspense>
  );
}

