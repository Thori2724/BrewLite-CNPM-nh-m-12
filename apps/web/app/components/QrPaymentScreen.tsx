'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  DEFAULT_QR_WALLET,
  QR_PAYMENT_COUNTDOWN_SECONDS,
  QR_PAYMENT_FAILURE_ACCOUNT,
  QR_PAYMENT_METHOD,
  QR_PAYMENT_SUCCESS_ACCOUNT,
  QR_WALLET_CONFIGS,
  QR_WALLET_OPTIONS,
  QrWalletProvider,
  buildQrPayload,
} from '../../constants/payment';
import {
  ORDER_STATUS_LABELS,
  OrderResponse,
  PaymentResponse,
  RECEIVE_TYPE_LABELS,
} from '../../services/order-contract';
import { OrderApiError, getOrderByIdApi, payOrderApi } from '../../services/orders';
import {
  clearPendingOrder,
  generateIdempotencyKey,
  loadPendingOrder,
  savePendingOrder,
} from '../../utils/checkout';
import { formatVnd } from '../../utils/validation';

export interface QrPaymentScreenProps {
  orderId: string;
  initialOrder?: OrderResponse | null;
  initialWallet?: QrWalletProvider;
  autoStartQr?: boolean;
  createdFromCart?: boolean;
  onClearCart?: () => void;
}

type QrSubView = 'select' | 'qr' | 'failed' | 'success';

interface UncertainPaymentRequest {
  accountNumber: string;
  idempotencyKey: string;
}

function WalletBadge({ wallet }: { wallet: QrWalletProvider }) {
  const config = QR_WALLET_CONFIGS[wallet];
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold tracking-tight shadow-sm ${config.badgeBgClass}`}
      aria-hidden="true"
    >
      {config.badgeText}
    </span>
  );
}

function getOrderStatusBadgeClass(status: OrderResponse['status']): string {
  switch (status) {
    case 'PAID':
    case 'COMPLETED':
      return 'border-moss/30 bg-moss/10 text-moss';
    case 'PREPARING':
    case 'READY':
    case 'PENDING':
      return 'border-tan/50 bg-tan/15 text-kombu';
    case 'PAYMENT_FAILED':
    case 'CANCELLED':
    default:
      return 'border-error/30 bg-error/10 text-error';
  }
}

export default function QrPaymentScreen({
  orderId,
  initialOrder = null,
  initialWallet = DEFAULT_QR_WALLET,
  autoStartQr = false,
  createdFromCart,
  onClearCart,
}: QrPaymentScreenProps) {
  const router = useRouter();
  const normalizedOrderId = orderId.trim();

  const [order, setOrder] = useState<OrderResponse | null>(
    initialOrder && initialOrder.id === normalizedOrderId ? initialOrder : null
  );
  const [isLoadingOrder, setIsLoadingOrder] = useState<boolean>(
    Boolean(normalizedOrderId) && !(initialOrder && initialOrder.id === normalizedOrderId)
  );
  const [loadOrderError, setLoadOrderError] = useState<string | null>(null);

  const [selectedWallet, setSelectedWallet] = useState<QrWalletProvider>(initialWallet);
  const [subView, setSubView] = useState<QrSubView>(autoStartQr ? 'qr' : 'select');
  const [qrAttemptId, setQrAttemptId] = useState<number>(autoStartQr ? 1 : 0);
  const [secondsLeft, setSecondsLeft] = useState<number>(QR_PAYMENT_COUNTDOWN_SECONDS);

  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [uncertainRequest, setUncertainRequest] = useState<UncertainPaymentRequest | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<PaymentResponse | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const routerRef = useRef(router);
  const onClearCartRef = useRef(onClearCart);
  const qrAttemptIdRef = useRef<number>(autoStartQr ? 1 : 0);
  const triggeredAttemptRef = useRef<number | null>(null);
  const activeIdempotencyKeyRef = useRef<string>(
    autoStartQr ? generateIdempotencyKey() : ''
  );

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    onClearCartRef.current = onClearCart;
  }, [onClearCart]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isOrderCreatedFromCart = useCallback(
    (targetOrderId: string): boolean => {
      if (typeof createdFromCart === 'boolean') {
        return createdFromCart;
      }
      const storedPending = loadPendingOrder();
      return Boolean(
        storedPending &&
          storedPending.orderId === targetOrderId &&
          storedPending.createdFromCart === true
      );
    },
    [createdFromCart]
  );

  const redirectToLogin = useCallback((targetOrderId: string) => {
    const redirectTarget = targetOrderId
      ? `/checkout?orderId=${encodeURIComponent(targetOrderId)}`
      : '/checkout';
    routerRef.current.replace(
      `/login?redirect=${encodeURIComponent(redirectTarget)}&expired=true`
    );
  }, []);

  const handleOrderLoaded = useCallback(
    (fetched: OrderResponse) => {
      setOrder(fetched);
      setIsLoadingOrder(false);
      setLoadOrderError(null);

      if (fetched.status === 'PAID') {
        const shouldClearCart = isOrderCreatedFromCart(fetched.id);
        clearPendingOrder();
        if (shouldClearCart) {
          onClearCartRef.current?.();
        }
      } else if (fetched.status !== 'PENDING' && fetched.status !== 'PAYMENT_FAILED') {
        clearPendingOrder();
      }
    },
    [isOrderCreatedFromCart]
  );

  const handleOrderLoadError = useCallback(
    (err: unknown) => {
      setIsLoadingOrder(false);

      if (err instanceof OrderApiError && err.statusCode === 401) {
        redirectToLogin(normalizedOrderId);
        return;
      }

      if (err instanceof OrderApiError && err.statusCode === 404) {
        setLoadOrderError('Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập.');
        return;
      }

      setLoadOrderError(
        err instanceof Error && err.message
          ? err.message
          : 'Không thể tải thông tin đơn hàng. Vui lòng thử lại.'
      );
    },
    [normalizedOrderId, redirectToLogin]
  );

  const fetchOrder = useCallback(async () => {
    if (!normalizedOrderId) {
      setOrder(null);
      setIsLoadingOrder(false);
      setLoadOrderError(null);
      return;
    }

    setIsLoadingOrder(true);
    setLoadOrderError(null);

    try {
      const fetched = await getOrderByIdApi(normalizedOrderId);
      if (!isMountedRef.current) return;
      handleOrderLoaded(fetched);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      handleOrderLoadError(err);
    }
  }, [handleOrderLoadError, handleOrderLoaded, normalizedOrderId]);

  // Chỉ tải đơn từ API khi chưa có initialOrder khớp với orderId
  useEffect(() => {
    if (!normalizedOrderId || (initialOrder && initialOrder.id === normalizedOrderId)) {
      return;
    }

    let cancelled = false;
    getOrderByIdApi(normalizedOrderId)
      .then((fetched) => {
        if (cancelled || !isMountedRef.current) return;
        handleOrderLoaded(fetched);
      })
      .catch((err: unknown) => {
        if (cancelled || !isMountedRef.current) return;
        handleOrderLoadError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [handleOrderLoadError, handleOrderLoaded, initialOrder, normalizedOrderId]);

  const startNewQrAttempt = useCallback(() => {
    if (isSubmittingPayment) return;
    const nextAttemptId = qrAttemptIdRef.current + 1;
    qrAttemptIdRef.current = nextAttemptId;
    triggeredAttemptRef.current = null;
    activeIdempotencyKeyRef.current = generateIdempotencyKey();

    setPaymentError(null);
    setUncertainRequest(null);
    setSecondsLeft(QR_PAYMENT_COUNTDOWN_SECONDS);
    setQrAttemptId(nextAttemptId);
    setSubView('qr');
  }, [isSubmittingPayment]);

  const executePayment = useCallback(
    async (params: {
      accountNumber: string;
      idempotencyKey: string;
    }) => {
      if (!order) return;

      setIsSubmittingPayment(true);
      setPaymentError(null);

      try {
        const payment = await payOrderApi(
          {
            orderId: order.id,
            method: QR_PAYMENT_METHOD,
            accountNumber: params.accountNumber,
          },
          params.idempotencyKey
        );

        if (!isMountedRef.current) return;
        setIsSubmittingPayment(false);

        if (payment.status === 'SUCCESS') {
          const shouldClearCart = isOrderCreatedFromCart(order.id);
          clearPendingOrder();
          if (shouldClearCart) {
            onClearCartRef.current?.();
          }

          setUncertainRequest(null);
          setPaymentSuccessData(payment);
          setOrder((prev) => (prev ? { ...prev, status: 'PAID' } : prev));
          setSubView('success');
          return;
        }

        // Giao dịch FAILED (ví dụ hủy QR với 0900000000 -> PAYMENT_FAILED)
        const shouldKeepCartFlag = isOrderCreatedFromCart(order.id);
        savePendingOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          receiveType: order.receiveType,
          idempotencyKey: generateIdempotencyKey(),
          method: QR_PAYMENT_METHOD,
          createdAt: new Date().toISOString(),
          itemCount: order.items.length,
          createdFromCart: shouldKeepCartFlag,
        });

        setUncertainRequest(null);
        setOrder((prev) => (prev ? { ...prev, status: 'PAYMENT_FAILED' } : prev));
        setPaymentError(
          params.accountNumber === QR_PAYMENT_FAILURE_ACCOUNT
            ? 'Bạn đã hủy thanh toán QR. Đơn hàng chưa được thanh toán, bạn có thể thử lại.'
            : payment.failureReason || 'Thanh toán chưa thành công. Vui lòng thử lại.'
        );
        setSubView('failed');
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        setIsSubmittingPayment(false);

        if (err instanceof OrderApiError) {
          if (err.statusCode === 401) {
            redirectToLogin(order.id);
            return;
          }

          if (err.statusCode === 409) {
            setUncertainRequest(null);
            setPaymentError(err.message);
            try {
              const latest = await getOrderByIdApi(order.id);
              if (!isMountedRef.current) return;
              setOrder(latest);
              if (latest.status === 'PAID') {
                const shouldClearCart = isOrderCreatedFromCart(latest.id);
                clearPendingOrder();
                if (shouldClearCart) {
                  onClearCartRef.current?.();
                }
                setPaymentSuccessData({
                  id: `paid-${latest.id}`,
                  orderId: latest.id,
                  amount: latest.totalAmount,
                  method: QR_PAYMENT_METHOD,
                  accountLast4: '0001',
                  status: 'SUCCESS',
                  createdAt: latest.createdAt,
                  order: {
                    id: latest.id,
                    orderNumber: latest.orderNumber,
                    status: 'PAID',
                  },
                });
                setSubView('success');
                return;
              }
              if (latest.status !== 'PENDING' && latest.status !== 'PAYMENT_FAILED') {
                clearPendingOrder();
                return;
              }
            } catch {
              // Giữ lại thông báo 409 vừa nhận nếu không tải lại được đơn
            }
            setSubView('failed');
            return;
          }

          if (err.statusCode === 400) {
            setUncertainRequest(null);
            setPaymentError('Yêu cầu thanh toán không hợp lệ. Vui lòng thử lại.');
            setSubView('failed');
            return;
          }

          if (err.statusCode === 404) {
            clearPendingOrder();
            setUncertainRequest(null);
            setOrder(null);
            setLoadOrderError(
              err.message
                ? `${err.message}. Đơn hàng trước đó không còn tồn tại trên hệ thống.`
                : 'Không tìm thấy đơn hàng để thanh toán.'
            );
            return;
          }

          // Lỗi 5xx hoặc lỗi mạng không rõ kết quả -> giữ nguyên key và accountNumber để thử lại đúng request đó
          const shouldKeepCartFlag = isOrderCreatedFromCart(order.id);
          savePendingOrder({
            orderId: order.id,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            receiveType: order.receiveType,
            idempotencyKey: params.idempotencyKey,
            method: QR_PAYMENT_METHOD,
            createdAt: order.createdAt,
            itemCount: order.items.length,
            createdFromCart: shouldKeepCartFlag,
          });
          setUncertainRequest({
            accountNumber: params.accountNumber,
            idempotencyKey: params.idempotencyKey,
          });
          setPaymentError(
            err.statusCode >= 500
              ? 'Máy chủ đang gặp sự cố tạm thời. Vui lòng bấm Thử lại.'
              : err.message ||
                  'Không thể kết nối máy chủ khi xử lý thanh toán. Vui lòng bấm Thử lại.'
          );
          setSubView('failed');
          return;
        }

        // Lỗi mạng / không xác định -> giữ nguyên key để thử lại cùng giao dịch
        const shouldKeepCartFlag = isOrderCreatedFromCart(order.id);
        savePendingOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          receiveType: order.receiveType,
          idempotencyKey: params.idempotencyKey,
          method: QR_PAYMENT_METHOD,
          createdAt: order.createdAt,
          itemCount: order.items.length,
          createdFromCart: shouldKeepCartFlag,
        });
        setUncertainRequest({
          accountNumber: params.accountNumber,
          idempotencyKey: params.idempotencyKey,
        });
        setPaymentError('Lỗi kết nối mạng khi xử lý thanh toán. Vui lòng bấm Thử lại.');
        setSubView('failed');
      }
    },
    [isOrderCreatedFromCart, order, redirectToLogin]
  );

  // Bộ đếm ngược 5 giây trên màn QR (dọn timer khi unmount, tuyệt đối không gọi API khi unmount/F5)
  const isPayableOrder =
    Boolean(order) &&
    (order?.status === 'PENDING' || order?.status === 'PAYMENT_FAILED');
  const shouldTickCountdown =
    subView === 'qr' &&
    isPayableOrder &&
    !isSubmittingPayment &&
    secondsLeft > 0;

  useEffect(() => {
    if (!shouldTickCountdown) {
      return;
    }

    const timerId = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [shouldTickCountdown, qrAttemptId]);

  // Kích hoạt thanh toán thành công khi đếm về 0 (chống gọi trùng & an toàn với StrictMode)
  useEffect(() => {
    if (
      subView !== 'qr' ||
      !order ||
      !isPayableOrder ||
      secondsLeft > 0 ||
      isSubmittingPayment
    ) {
      return;
    }

    if (triggeredAttemptRef.current === qrAttemptId) {
      return;
    }

    triggeredAttemptRef.current = qrAttemptId;
    const idempotencyKey =
      activeIdempotencyKeyRef.current || generateIdempotencyKey();
    activeIdempotencyKeyRef.current = idempotencyKey;

    void executePayment({
      accountNumber: QR_PAYMENT_SUCCESS_ACCOUNT,
      idempotencyKey,
    });
  }, [
    executePayment,
    isPayableOrder,
    isSubmittingPayment,
    order,
    qrAttemptId,
    secondsLeft,
    subView,
  ]);

  const handleCancelQr = () => {
    if (
      subView !== 'qr' ||
      !order ||
      !isPayableOrder ||
      isSubmittingPayment ||
      triggeredAttemptRef.current === qrAttemptId
    ) {
      return;
    }

    triggeredAttemptRef.current = qrAttemptId;
    const idempotencyKey =
      activeIdempotencyKeyRef.current || generateIdempotencyKey();
    activeIdempotencyKeyRef.current = idempotencyKey;

    void executePayment({
      accountNumber: QR_PAYMENT_FAILURE_ACCOUNT,
      idempotencyKey,
    });
  };

  const handleRetryUncertainPayment = () => {
    if (!uncertainRequest || isSubmittingPayment) return;
    void executePayment({
      accountNumber: uncertainRequest.accountNumber,
      idempotencyKey: uncertainRequest.idempotencyKey,
    });
  };

  // Trạng thái trống khi thiếu orderId
  if (!normalizedOrderId) {
    return (
      <div className="rounded-card border border-noir/10 bg-cream p-10 text-center shadow-soft">
        <h2 className="font-display text-2xl font-bold text-noir">
          Chưa có thông tin đơn hàng
        </h2>
        <p className="mt-2 text-sm text-noir/65">
          Không tìm thấy mã đơn hàng để mở màn thanh toán QR.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-control bg-kombu px-6 py-2.5 text-sm font-semibold text-bone hover:bg-moss transition-colors"
          >
            Quay lại thực đơn
          </Link>
          <Link
            href="/orders"
            className="rounded-control border border-noir/15 bg-white px-6 py-2.5 text-sm font-medium text-noir hover:bg-bone transition-colors"
          >
            Lịch sử đơn hàng
          </Link>
        </div>
      </div>
    );
  }

  // Trạng thái loading đơn hàng
  if (isLoadingOrder) {
    return (
      <div
        className="rounded-card border border-noir/10 bg-cream p-10 text-center shadow-soft"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-kombu border-t-transparent" />
        <p className="text-sm font-medium text-noir/75">
          Đang tải thông tin đơn hàng...
        </p>
      </div>
    );
  }

  // Trạng thái lỗi tải đơn hàng hoặc đơn không còn tồn tại (404)
  if (loadOrderError || !order) {
    return (
      <div
        className="rounded-card border border-error/25 bg-cream p-8 text-center shadow-soft"
        role="alert"
      >
        <h2 className="font-display text-xl font-bold text-noir">
          Không thể mở thanh toán QR
        </h2>
        <p className="mt-2 text-sm text-error">
          {loadOrderError || 'Không tìm thấy đơn hàng.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void fetchOrder()}
            className="rounded-control bg-kombu px-6 py-2.5 text-sm font-semibold text-bone hover:bg-moss transition-colors"
          >
            Thử lại
          </button>
          <Link
            href="/orders"
            className="rounded-control border border-noir/15 bg-white px-6 py-2.5 text-sm font-medium text-noir hover:bg-bone transition-colors"
          >
            Xem lịch sử đơn
          </Link>
        </div>
      </div>
    );
  }

  const walletConfig = QR_WALLET_CONFIGS[selectedWallet];

  // Màn xác nhận thành công
  if (subView === 'success' && paymentSuccessData) {
    return (
      <div className="rounded-card border border-moss/25 bg-cream p-8 text-center shadow-soft max-w-2xl mx-auto">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-moss/15 text-moss text-3xl font-bold">
          ✓
        </div>
        <h2 className="font-display text-2xl font-bold text-noir">
          Thanh toán thành công!
        </h2>
        <p className="mt-2 text-sm text-noir/75">
          Đơn hàng <strong className="text-noir">#{order.orderNumber}</strong> đã được ghi nhận thành công qua ví {walletConfig.name}.
        </p>

        <div className="mt-6 rounded-xl border border-noir/10 bg-white/75 p-5 text-left text-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Mã đơn hàng:</span>
            <span className="font-bold text-noir">#{order.orderNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Trạng thái:</span>
            <span className="inline-flex items-center rounded-full border border-moss/30 bg-moss/10 px-2.5 py-0.5 text-xs font-semibold text-moss">
              {ORDER_STATUS_LABELS.PAID}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Hình thức nhận:</span>
            <span className="font-medium text-noir">
              {RECEIVE_TYPE_LABELS[order.receiveType]}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Ví thanh toán:</span>
            <span className="font-medium text-noir">{walletConfig.displayLabel}</span>
          </div>
          <div className="flex justify-between items-center border-t border-noir/10 pt-2.5">
            <span className="text-noir/65">Tổng tiền đã thanh toán:</span>
            <span className="font-bold text-kombu text-base">
              {formatVnd(paymentSuccessData.amount || order.totalAmount)}
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/orders/${order.id}`}
            className="rounded-control bg-kombu px-6 py-3 text-sm font-semibold text-bone shadow-sm hover:bg-moss transition-colors"
          >
            Xem chi tiết đơn hàng
          </Link>
          <Link
            href="/orders"
            className="rounded-control border border-noir/15 bg-white px-6 py-3 text-sm font-medium text-noir hover:bg-bone transition-colors"
          >
            Lịch sử đơn hàng
          </Link>
          <Link
            href="/"
            className="rounded-control border border-noir/15 bg-transparent px-6 py-3 text-sm font-medium text-noir/80 hover:bg-bone transition-colors"
          >
            Tiếp tục mua hàng
          </Link>
        </div>
      </div>
    );
  }

  // Đơn không ở trạng thái PENDING hoặc PAYMENT_FAILED -> không cho thanh toán
  if (!isPayableOrder) {
    const statusLabel = ORDER_STATUS_LABELS[order.status];
    return (
      <div className="rounded-card border border-noir/10 bg-cream p-8 text-center shadow-soft max-w-2xl mx-auto">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getOrderStatusBadgeClass(order.status)}`}
        >
          {statusLabel}
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold text-noir">
          Đơn hàng #{order.orderNumber} không thể thanh toán
        </h2>
        {paymentError && (
          <p className="mt-2 text-sm font-medium text-error" role="alert">
            {paymentError}
          </p>
        )}
        <p className="mt-2 text-sm text-noir/70">
          {order.status === 'PAID'
            ? `Đơn hàng #${order.orderNumber} đã ở trạng thái "${statusLabel}". Bạn không cần thanh toán lại.`
            : `Đơn hàng #${order.orderNumber} đang ở trạng thái "${statusLabel}". Chỉ đơn ở trạng thái "Chờ thanh toán" hoặc "Thanh toán lỗi" mới có thể thanh toán.`}
        </p>

        <div className="mt-5 rounded-xl border border-noir/10 bg-white/75 p-4 text-sm flex items-center justify-between">
          <span className="text-noir/65">Tổng thanh toán:</span>
          <span className="font-bold text-kombu">{formatVnd(order.totalAmount)}</span>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <Link
            href={`/orders/${order.id}`}
            className="rounded-control bg-kombu px-6 py-2.5 text-sm font-semibold text-bone hover:bg-moss transition-colors"
          >
            Xem chi tiết đơn hàng
          </Link>
          <Link
            href="/orders"
            className="rounded-control border border-noir/15 bg-white px-6 py-2.5 text-sm font-medium text-noir hover:bg-bone transition-colors"
          >
            Xem lịch sử đơn
          </Link>
        </div>
      </div>
    );
  }

  // Màn thất bại sau khi hủy QR hoặc gặp lỗi khi gọi POST /payments
  if (subView === 'failed') {
    return (
      <div className="rounded-card border border-error/25 bg-cream p-6 sm:p-8 shadow-soft max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-noir/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-error">
              Thanh toán chưa hoàn tất
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-noir">
              Đơn hàng <span>#{order.orderNumber}</span>
            </h2>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getOrderStatusBadgeClass(order.status)}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>

        {paymentError && (
          <div
            className="rounded-control border border-error/30 bg-error/10 p-4 text-sm text-error"
            role="alert"
          >
            <p className="font-semibold">{paymentError}</p>
            {uncertainRequest ? (
              <p className="mt-1 text-xs text-error/85">
                Hệ thống sẽ gửi lại đúng yêu cầu giao dịch bị gián đoạn để tránh trừ tiền trùng.
              </p>
            ) : (
              <p className="mt-1 text-xs text-error/85">
                Giỏ hàng và mã đơn #{order.orderNumber} của bạn vẫn được giữ nguyên.
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-noir/10 bg-white/75 p-4 text-sm space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Hình thức nhận:</span>
            <span className="font-medium text-noir">
              {RECEIVE_TYPE_LABELS[order.receiveType]}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-noir/10 pt-2">
            <span className="text-noir/65">Số tiền cần thanh toán:</span>
            <span className="text-lg font-bold text-kombu">
              {formatVnd(order.totalAmount)}
            </span>
          </div>
        </div>

        {!uncertainRequest && (
          <div>
            <p className="mb-2.5 text-sm font-semibold text-noir">
              Chọn ví hiển thị khi thử lại
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QR_WALLET_OPTIONS.map((wallet) => {
                const isSelected = selectedWallet === wallet.id;
                return (
                  <button
                    key={wallet.id}
                    type="button"
                    onClick={() => setSelectedWallet(wallet.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-3 rounded-control border p-3.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? wallet.cardActiveClass
                        : 'border-noir/15 bg-white hover:border-noir/30'
                    }`}
                  >
                    <WalletBadge wallet={wallet.id} />
                    <div>
                      <p className="text-sm font-bold text-noir">{wallet.name}</p>
                      <p className="text-xs text-noir/60">{wallet.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {uncertainRequest ? (
            <button
              type="button"
              disabled={isSubmittingPayment}
              onClick={handleRetryUncertainPayment}
              className="flex-1 rounded-control bg-kombu py-3 px-6 text-sm font-semibold text-bone shadow-sm hover:bg-moss transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmittingPayment ? 'Đang xử lý...' : 'Thử lại'}
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmittingPayment}
              onClick={startNewQrAttempt}
              className="flex-1 rounded-control bg-kombu py-3 px-6 text-sm font-semibold text-bone shadow-sm hover:bg-moss transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmittingPayment ? 'Đang xử lý...' : 'Thử lại thanh toán'}
            </button>
          )}
          <Link
            href={`/orders/${order.id}`}
            className="rounded-control border border-noir/15 bg-white py-3 px-5 text-center text-sm font-medium text-noir hover:bg-bone transition-colors"
          >
            Xem chi tiết đơn
          </Link>
        </div>
      </div>
    );
  }

  // Cách A khi mở trực tiếp bằng ?orderId=: bước chọn ví + nút "Thanh toán bằng QR"
  if (subView === 'select') {
    const latestFailureReason =
      order.payments?.find((p) => p.status === 'FAILED')?.failureReason || null;

    return (
      <div className="rounded-card border border-noir/10 bg-cream p-6 sm:p-8 shadow-soft max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-noir/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-noir/55">
              Thanh toán đơn hàng
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-noir">
              Đơn hàng <span>#{order.orderNumber}</span>
            </h2>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getOrderStatusBadgeClass(order.status)}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>

        {order.status === 'PAYMENT_FAILED' && (
          <div
            className="rounded-control border border-warning/40 bg-warning/10 p-4 text-sm text-noir"
            role="status"
          >
            <p className="font-semibold">
              Lần thanh toán trước chưa thành công.
            </p>
            {latestFailureReason && (
              <p className="mt-1 text-xs text-noir/75">{latestFailureReason}</p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-noir/10 bg-white/75 p-4 text-sm space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Hình thức nhận:</span>
            <span className="font-medium text-noir">
              {RECEIVE_TYPE_LABELS[order.receiveType]}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-noir/65">Số món trong đơn:</span>
            <span className="font-medium text-noir">{order.items.length} món</span>
          </div>
          <div className="flex justify-between items-center border-t border-noir/10 pt-2">
            <span className="text-noir/65">Tổng tiền thanh toán:</span>
            <span className="text-xl font-bold text-kombu">
              {formatVnd(order.totalAmount)}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-noir">
            Chọn ví điện tử hiển thị mã QR
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QR_WALLET_OPTIONS.map((wallet) => {
              const isSelected = selectedWallet === wallet.id;
              return (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => setSelectedWallet(wallet.id)}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-3 rounded-control border p-4 text-left transition-all cursor-pointer ${
                    isSelected
                      ? wallet.cardActiveClass
                      : 'border-noir/15 bg-white hover:border-noir/30'
                  }`}
                >
                  <WalletBadge wallet={wallet.id} />
                  <div>
                    <p className="text-sm font-bold text-noir">{wallet.name}</p>
                    <p className="text-xs text-noir/60">{wallet.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            disabled={isSubmittingPayment}
            onClick={startNewQrAttempt}
            className="flex-1 rounded-control bg-kombu py-3.5 px-6 text-base font-semibold text-bone shadow-sm hover:bg-moss transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmittingPayment ? 'Đang xử lý...' : 'Thanh toán bằng QR'}
          </button>
          <Link
            href={`/orders/${order.id}`}
            className="rounded-control border border-noir/15 bg-white py-3.5 px-5 text-center text-sm font-medium text-noir hover:bg-bone transition-colors"
          >
            Xem chi tiết đơn
          </Link>
        </div>
      </div>
    );
  }

  // Màn hiển thị QR và đếm ngược 5 giây
  const qrPayload = buildQrPayload({
    orderId: order.id,
    orderNumber: order.orderNumber,
    wallet: selectedWallet,
  });

  return (
    <div
      className="rounded-card border border-noir/10 bg-cream p-6 sm:p-8 shadow-soft max-w-2xl mx-auto space-y-6"
      data-wallet={selectedWallet}
    >
      <div
        className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${walletConfig.headerBgClass}`}
      >
        <div className="flex items-center gap-3">
          <WalletBadge wallet={selectedWallet} />
          <div>
            <p className={`text-sm font-bold ${walletConfig.accentTextClass}`}>
              Ví điện tử {walletConfig.name}
            </p>
            <p className="text-xs text-noir/70">
              Mã đơn <span className="font-semibold">#{order.orderNumber}</span> •{' '}
              {RECEIVE_TYPE_LABELS[order.receiveType]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCancelQr}
          disabled={isSubmittingPayment}
          aria-label="Đóng màn thanh toán QR"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-noir/15 bg-white text-noir/75 hover:bg-bone hover:text-noir transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
        <div
          className={`mx-auto flex flex-col items-center justify-center rounded-2xl border-2 p-5 ${walletConfig.qrBorderClass}`}
        >
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <QRCodeSVG
              value={qrPayload}
              size={196}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#1A1A1A"
              role="img"
              aria-label={`Mã QR ${walletConfig.name} cho đơn hàng #${order.orderNumber}`}
            />
          </div>
          <span
            className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${walletConfig.pillClass}`}
          >
            {walletConfig.name} • #{order.orderNumber}
          </span>
        </div>

        <div className="space-y-4 text-center md:text-left">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-noir/55">
              Số tiền thanh toán
            </p>
            <p className="mt-1 font-display text-3xl font-bold text-kombu">
              {formatVnd(order.totalAmount)}
            </p>
          </div>

          <div
            className="rounded-xl border border-noir/10 bg-white/80 p-4 space-y-2"
            role="status"
            aria-live="polite"
          >
            {isSubmittingPayment ? (
              <div className="flex items-center justify-center md:justify-start gap-2.5 text-kombu">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-kombu border-t-transparent" />
                <span className="text-sm font-semibold">Đang xử lý...</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-noir">
                  Tự động xác nhận thanh toán sau{' '}
                  <span
                    className={`inline-block font-extrabold tabular-nums ${walletConfig.accentTextClass}`}
                    data-testid="qr-countdown"
                  >
                    {secondsLeft}
                  </span>{' '}
                  giây
                </p>
                <p className="text-xs text-noir/65">
                  Vui lòng giữ nguyên màn hình để hoàn tất giao dịch qua {walletConfig.name}, hoặc bấm Hủy thanh toán nếu muốn dừng lại.
                </p>
              </>
            )}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={handleCancelQr}
              disabled={isSubmittingPayment}
              className="w-full rounded-control border border-error/35 bg-white py-3 px-5 text-sm font-semibold text-error hover:bg-error/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmittingPayment ? 'Đang xử lý...' : 'Hủy thanh toán'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
