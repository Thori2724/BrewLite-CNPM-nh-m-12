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
import { generateIdempotencyKey, savePendingOrder } from '../../../utils/checkout';
import { calculatePrice } from '../../../utils/price';

function formatVndPrice(amount: number): string {
  const safeValue = calculatePrice({ basePrice: amount, toppings: [], quantity: 1 });
  return `${safeValue.toLocaleString('vi-VN')}đ`;
}

function getOrderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case 'PAID':
    case 'READY':
    case 'COMPLETED':
      return 'bg-green-100 text-green-800 border border-green-200';
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 border border-amber-200';
    case 'PREPARING':
      return 'bg-blue-100 text-blue-800 border border-blue-200';
    case 'PAYMENT_FAILED':
      return 'bg-red-100 text-red-800 border border-red-200';
    case 'CANCELLED':
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}

function getBannerStyleClass(status: OrderStatus): string {
  const config = ORDER_STATUS_BANNERS[status];
  switch (config?.variant) {
    case 'success':
      return 'bg-green-50 border-green-200 text-green-900';
    case 'warning':
      return 'bg-amber-50 border-amber-200 text-amber-900';
    case 'error':
      return 'bg-red-50 border-red-200 text-red-900';
    case 'info':
      return 'bg-blue-50 border-blue-200 text-blue-900';
    case 'neutral':
    default:
      return 'bg-gray-100 border-gray-200 text-gray-800';
  }
}

function getPaymentStatusBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-green-100 text-green-800';
    case 'FAILED':
      return 'bg-red-100 text-red-800';
    case 'PENDING':
    default:
      return 'bg-amber-100 text-amber-800';
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

    savePendingOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      receiveType: order.receiveType,
      idempotencyKey: newIdempotencyKey,
      method: latestMethod,
      createdAt: order.createdAt,
      itemCount: order.items?.length || 1,
    });

    router.push(`/checkout?orderId=${encodeURIComponent(order.id)}`);
  };

  // 1. Chờ kiểm tra đăng nhập hoặc đang tải lần đầu
  if (isChecking || !isReady || loading) {
    return (
      <div
        data-testid="order-detail-loading"
        className="max-w-4xl mx-auto py-16 text-center text-gray-500 text-sm space-y-4"
      >
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full" />
        <p>Đang tải thông tin đơn hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái 404: Không tìm thấy đơn hàng (hoặc đơn không thuộc về người dùng)
  if (isNotFound) {
    return (
      <div
        data-testid="order-not-found"
        className="max-w-md mx-auto my-8 bg-white border border-gray-100 rounded-2xl py-12 px-6 text-center shadow-xs space-y-4"
      >
        <div className="w-16 h-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto text-3xl">
          🔍
        </div>
        <h1 className="text-xl font-bold text-gray-900">Không tìm thấy đơn hàng</h1>
        <p className="text-sm text-gray-500">
          Đơn hàng này không tồn tại hoặc bạn không có quyền truy cập.
        </p>
        <div className="pt-2">
          <Link
            href="/orders"
            className="inline-block px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition shadow-sm"
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
        className="max-w-md mx-auto my-8 bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 text-center shadow-xs space-y-4"
      >
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-medium">
          {error || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR}
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={handleManualReload}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition cursor-pointer"
          >
            Thử lại
          </button>
          <Link
            href="/orders"
            className="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-semibold rounded-xl text-sm transition"
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <Link
          href="/orders"
          className="inline-flex items-center text-xs sm:text-sm font-medium text-gray-600 hover:text-amber-600 transition"
        >
          <span className="mr-1">←</span> Xem lịch sử đơn
        </Link>

        <button
          type="button"
          onClick={handleManualReload}
          disabled={isReloading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold transition shadow-2xs disabled:opacity-50 cursor-pointer"
        >
          <span>↻</span>
          <span>{isReloading ? 'Đang tải lại...' : 'Tải lại'}</span>
        </button>
      </div>

      {/* 1. Banner đầu trang theo status */}
      <div
        data-testid="order-status-banner"
        className={`p-5 sm:p-6 rounded-2xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${getBannerStyleClass(
          order.status
        )}`}
      >
        <div className="space-y-1">
          <h1 className="text-lg sm:text-xl font-extrabold">{bannerConfig.title}</h1>
          <p className="text-xs sm:text-sm opacity-90">{bannerConfig.description}</p>
          {order.status === 'PAYMENT_FAILED' && latestFailureReason && (
            <p
              data-testid="banner-failure-reason"
              className="text-xs sm:text-sm font-semibold text-red-700 pt-1"
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
              className="text-2xl sm:text-3xl font-black tracking-tight"
            >
              #{order.orderNumber}
            </span>
          </div>
          <span
            data-testid="order-status-badge"
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getOrderStatusBadgeClass(
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
          className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs"
        >
          <h2 className="text-sm font-bold text-gray-800 mb-4">Tiến trình đơn hàng</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 sm:gap-2">
            {ORDER_MAIN_FLOW_STEPS.map((stepStatus, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={stepStatus}
                  data-current={isCurrent ? 'true' : 'false'}
                  className={`flex sm:flex-col items-center gap-3 sm:gap-2 p-2.5 sm:p-3 rounded-xl border text-center transition ${
                    isCurrent
                      ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold shadow-2xs'
                      : isCompleted
                        ? 'border-green-200 bg-green-50/60 text-green-800 font-semibold'
                        : 'border-gray-100 bg-gray-50/60 text-gray-400'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isCurrent
                        ? 'bg-amber-600 text-white'
                        : isCompleted
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-500'
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
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
              Danh sách món đã đặt ({order.items?.length || 0} dòng món)
            </h2>

            <div className="divide-y divide-gray-100">
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
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 break-words">
                          {item.productName}
                        </h3>
                        <span className="text-xs sm:text-sm font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          x{item.quantity}
                        </span>
                      </div>

                      {/* Size / Đường / Đá: ẩn hoàn toàn nếu giá trị là null */}
                      {hasDrinkOptions && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
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
                        <div className="text-xs text-gray-600">
                          <span>Topping: </span>
                          <span className="font-medium text-gray-800">
                            {item.toppings!
                              .map((t) => `${t.name} (+${formatVndPrice(t.price)})`)
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Ghi chú của món (ẩn nếu null) */}
                      {hasItemNote && (
                        <div className="text-xs italic text-gray-500">
                          Ghi chú món: &ldquo;{item.note}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* unitPrice và lineTotal từ server */}
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-400">
                        Đơn giá: {formatVndPrice(item.unitPrice)}
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-gray-900 mt-0.5">
                        {formatVndPrice(item.lineTotal)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 8. Lịch sử thanh toán từ mảng payments (sắp xếp mới nhất lên trước, KHÔNG hiển thị amount) */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
              Lịch sử thanh toán
            </h2>

            {sortedPayments.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">Chưa có giao dịch thanh toán</p>
            ) : (
              <div className="space-y-3">
                {sortedPayments.map((payment) => (
                  <div
                    key={payment.id}
                    data-testid="payment-history-item"
                    className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">
                          {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                        </span>
                        <span className="font-mono text-xs text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
                          •••• {payment.accountLast4}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Thời gian: {formatVietnamDateTime(payment.createdAt)}
                      </div>
                      {payment.failureReason && (
                        <div className="text-xs text-red-600 font-medium">
                          Lý do lỗi: {payment.failureReason}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 self-start sm:self-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getPaymentStatusBadgeClass(
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
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
              Thông tin đơn hàng
            </h2>

            {/* 5. Thông tin đơn: hình thức nhận, thời gian đặt, ghi chú đơn (ẩn nếu null) */}
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Mã đơn:</span>
                <span className="font-bold text-gray-900">#{order.orderNumber}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Trạng thái:</span>
                <span className="font-semibold text-gray-800">
                  {ORDER_STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Hình thức nhận:</span>
                <span className="font-semibold text-gray-800">
                  {RECEIVE_TYPE_LABELS[order.receiveType] || order.receiveType}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Thời gian đặt:</span>
                <span className="font-medium text-gray-800">
                  {formatVietnamDateTime(order.createdAt)}
                </span>
              </div>

              {order.note && order.note.trim() && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-500 block text-xs mb-1">Ghi chú đơn hàng:</span>
                  <p className="text-gray-800 bg-amber-50/60 border border-amber-100 rounded-xl p-2.5 text-xs sm:text-sm">
                    {order.note}
                  </p>
                </div>
              )}
            </div>

            {/* 7. Tổng tiền: totalAmount lấy nguyên giá trị server trả về */}
            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-gray-900">Tổng tiền đơn hàng:</span>
                <span
                  data-testid="order-total-amount"
                  className="text-xl sm:text-2xl font-black text-amber-600"
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
                  className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-sm cursor-pointer"
                >
                  {order.status === 'PAYMENT_FAILED' ? 'Thử lại thanh toán' : 'Thanh toán đơn hàng'}
                </button>
              )}

              <Link
                href="/"
                className={`block w-full py-3 font-semibold rounded-xl text-sm transition text-center ${
                  isPayable
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                    : 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                }`}
              >
                Tiếp tục đặt món
              </Link>

              <Link
                href="/orders"
                className="block w-full py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-semibold rounded-xl text-sm transition text-center"
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
        <div className="max-w-4xl mx-auto py-16 text-center text-gray-500 text-sm">
          Đang tải chi tiết đơn hàng...
        </div>
      }
    >
      <OrderDetailContent />
    </Suspense>
  );
}

