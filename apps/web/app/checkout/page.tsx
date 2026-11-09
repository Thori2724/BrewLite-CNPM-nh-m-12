'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '../../context/useRequireAuth';
import { useCart } from '../../context/CartContext';
import {
  ReceiveType,
  PaymentMethod,
  OrderResponse,
  PaymentResponse,
  RECEIVE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  OutOfStockDetail,
  ORDER_ERROR_MESSAGES,
} from '../../services/order-contract';
import {
  SUGAR_LABELS,
  ICE_LABELS,
  SIZE_LABELS,
  SugarLevel,
  IceLevel,
  SizeId,
} from '../../services/api';
import {
  createOrderApi,
  payOrderApi,
  getOrderByIdApi,
  OrderApiError,
} from '../../services/orders';
import {
  buildCreateOrderPayload,
  clearPendingOrder,
  generateIdempotencyKey,
  loadPendingOrder,
  PendingOrderRecord,
  resolveIdempotencyKey,
  savePendingOrder,
  validateAccountNumber,
} from '../../utils/checkout';
import { getLineTotal } from '../../utils/cart';

function getIceLabel(ice?: IceLevel): string {
  if (!ice) return '';
  return ICE_LABELS[ice] || ice;
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryOrderId = (searchParams?.get('orderId') || '').trim();
  const { isChecking, isReady } = useRequireAuth();
  const { items, totalAmount, clearAll, isHydrated } = useCart();

  // Trạng thái các bước trên trang
  const [step, setStep] = useState<'order' | 'payment' | 'success'>('order');

  // Quản lý đơn chờ thanh toán
  const [pendingOrder, setPendingOrder] = useState<PendingOrderRecord | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadPendingOrder();
  });
  const [isCheckingQueryOrder, setIsCheckingQueryOrder] = useState<boolean>(() =>
    Boolean(queryOrderId)
  );

  // Thông tin đơn hàng đang xử lý
  const [createdOrder, setCreatedOrder] = useState<OrderResponse | null>(null);
  // Đánh dấu đơn được tạo mới từ giỏ hàng ở Bước 1 trong cùng phiên làm việc (chỉ xóa giỏ khi thanh toán đơn này)
  const [sessionCreatedOrderId, setSessionCreatedOrderId] = useState<string | null>(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string>(
    () => pendingOrder?.idempotencyKey || ''
  );

  // Thông tin giao nhận
  const [receiveType, setReceiveType] = useState<ReceiveType>(
    () => pendingOrder?.receiveType || 'AT_COUNTER'
  );
  const [note, setNote] = useState<string>('');

  // Trạng thái đặt đơn hàng
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  const [outOfStockDetails, setOutOfStockDetails] = useState<OutOfStockDetail[]>([]);

  // Thông tin thanh toán (bảo mật: không bao giờ lưu storage hay log)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => pendingOrder?.method || 'WALLET'
  );
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountNumberError, setAccountNumberError] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<PaymentResponse | null>(null);
  const [successOrderNumber, setSuccessOrderNumber] = useState<number | null>(null);
  const [lastSubmittedPayment, setLastSubmittedPayment] = useState<{
    method: PaymentMethod;
    accountNumber: string;
    isFailed?: boolean;
  } | null>(null);

  const clearAllRef = React.useRef(clearAll);
  const itemsLengthRef = React.useRef(items.length);
  const routerRef = React.useRef(router);
  const sessionCreatedOrderIdRef = React.useRef(sessionCreatedOrderId);
  const stepRef = React.useRef(step);
  useEffect(() => {
    clearAllRef.current = clearAll;
    itemsLengthRef.current = items.length;
    routerRef.current = router;
    sessionCreatedOrderIdRef.current = sessionCreatedOrderId;
    stepRef.current = step;
  });

  // Kiểm tra đơn chờ khi mount / khi queryOrderId đổi / khi Activity của Next.js 16 hiện lại trang
  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;
    const storedPending = loadPendingOrder();

    // Nếu vào /checkout không có ?orderId mà state cũ đang ở màn 'success' (do Cache Components giữ state)
    // thì reset toàn bộ state màn thành công về Bước 1
    if (!queryOrderId && stepRef.current === 'success') {
      queueMicrotask(() => {
        if (!isMounted) return;
        setStep('order');
        setPaymentSuccessData(null);
        setSuccessOrderNumber(null);
        setCreatedOrder(null);
        setSessionCreatedOrderId(null);
        setLastSubmittedPayment(null);
        setPaymentError(null);
        setPendingOrder(storedPending);
      });
    }

    const orderIdToCheck = queryOrderId || storedPending?.orderId;
    if (!orderIdToCheck) {
      queueMicrotask(() => {
        if (!isMounted) return;
        setIsCheckingQueryOrder(false);
        setPendingOrder(null);
      });
      return () => {
        isMounted = false;
      };
    }

    getOrderByIdApi(orderIdToCheck)
      .then((order) => {
        if (!isMounted) return;
        setIsCheckingQueryOrder(false);

        if (order.status === 'PAID') {
          const isCreatedFromCart = Boolean(
            storedPending &&
              storedPending.orderId === order.id &&
              storedPending.createdFromCart === true
          );
          clearPendingOrder();
          setPendingOrder(null);

          // Nếu pendingOrder có cờ createdFromCart: true thì coi là đơn của giỏ này: xóa giỏ và chuyển sang /orders/<id>
          if (isCreatedFromCart) {
            clearAllRef.current();
            routerRef.current.replace(`/orders/${order.id}`);
            return;
          }

          // Nếu mở /checkout?orderId=<id> mà đơn đã PAID thì chuyển sang /orders/<id>, không xóa giỏ
          if (queryOrderId) {
            routerRef.current.replace(`/orders/${order.id}`);
            return;
          }

          // Mở /checkout không có ?orderId mà pendingOrder cũ đã PAID (không có cờ createdFromCart):
          // chỉ xóa pendingOrder, giữ nguyên giỏ, ở lại Bước 1 (tuyệt đối không hiện màn thành công lúc mount)
          setCreatedOrder(null);
          setStep('order');
          return;
        } else if (order.status === 'PENDING' || order.status === 'PAYMENT_FAILED') {
          // Giữ lại key cũ nếu cùng đơn và đang PENDING; sinh key mới nếu chưa có (đổi trình duyệt) hoặc đơn đang PAYMENT_FAILED
          const matchedStored =
            storedPending && storedPending.orderId === order.id ? storedPending : null;
          const effectiveKey =
            matchedStored && order.status === 'PENDING' && matchedStored.idempotencyKey
              ? matchedStored.idempotencyKey
              : generateIdempotencyKey();

          const syncedRecord: PendingOrderRecord = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            receiveType: order.receiveType,
            idempotencyKey: effectiveKey,
            method: matchedStored?.method || 'WALLET',
            createdAt: order.createdAt,
            itemCount: order.items?.length || matchedStored?.itemCount || 1,
            ...(matchedStored?.createdFromCart ? { createdFromCart: true } : {}),
          };

          savePendingOrder(syncedRecord);
          setPendingOrder(syncedRecord);
          setCreatedOrder(order);
          setCurrentIdempotencyKey(effectiveKey);

          // Chỉ nhảy thẳng sang Bước 2 (payment) khi:
          // (a) Có ?orderId= trên URL (đi từ /orders/[id] hoặc F5 tại Bước 2); HOẶC
          // (b) Giỏ hàng đang rỗng (items.length === 0) nhưng còn đơn chờ
          // Nếu giỏ có món và không có ?orderId=: giữ nguyên Bước 1 (order) và hiện banner nhắc đơn chờ
          if (Boolean(queryOrderId) || itemsLengthRef.current === 0) {
            setStep('payment');
          } else {
            setStep('order');
          }
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsCheckingQueryOrder(false);
        if (err instanceof OrderApiError && err.statusCode === 404) {
          clearPendingOrder();
          setPendingOrder(null);
          setCreatedOrder(null);
          setStep('order');
          if (queryOrderId) {
            routerRef.current.replace('/checkout');
          }
          setCreateOrderError(
            'Đơn hàng trước đó không còn tồn tại trên hệ thống. Vui lòng tiến hành đặt lại.'
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [queryOrderId, isHydrated]);

  // Bảo mật: Xóa ô số tài khoản khi component unmount
  useEffect(() => {
    return () => {
      setAccountNumber('');
    };
  }, []);

  // 1. Đang kiểm tra đăng nhập, chưa nạp xong giỏ hàng hoặc đang kiểm tra đơn từ ?orderId=
  if (isChecking || !isReady || !isHydrated || isCheckingQueryOrder) {
    return (
      <div className="max-w-md mx-auto py-20 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
        <p>Đang chuẩn bị trang thanh toán...</p>
      </div>
    );
  }

  // 2. Màn hình thanh toán thành công
  if (step === 'success' && paymentSuccessData) {
    const finalOrderNum =
      successOrderNumber ??
      paymentSuccessData.order?.orderNumber ??
      createdOrder?.orderNumber ??
      pendingOrder?.orderNumber;
    const finalOrderId =
      paymentSuccessData.orderId ||
      paymentSuccessData.order?.id ||
      createdOrder?.id ||
      pendingOrder?.orderId;

    return (
      <div className="max-w-lg mx-auto my-6 bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 shadow-xs text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-5 text-4xl shadow-xs">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán thành công!</h1>
        <p className="text-sm text-gray-600 mb-6">
          Cảm ơn bạn đã đặt món tại BrewLite. Quán đang chuẩn bị đồ uống cho bạn.
        </p>

        <div className="bg-gray-50/80 border border-gray-100 rounded-2xl p-5 text-left text-sm space-y-3 mb-6">
          <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
            <span className="text-gray-500">Mã đơn hàng:</span>
            <span className="font-bold text-gray-900">
              {finalOrderNum !== undefined ? `#${finalOrderNum}` : 'Đơn hàng'}
            </span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
            <span className="text-gray-500">Trạng thái:</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              Đã thanh toán
            </span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
            <span className="text-gray-500">Số tiền đã trả:</span>
            <span className="font-bold text-amber-600">
              {paymentSuccessData.amount.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
            <span className="text-gray-500">Phương thức:</span>
            <span className="font-medium text-gray-800">
              {PAYMENT_METHOD_LABELS[paymentSuccessData.method] || paymentSuccessData.method}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Số tài khoản:</span>
            <span className="font-mono text-xs text-gray-600">
              •••• {paymentSuccessData.accountLast4}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
          {finalOrderId && (
            <Link
              href={`/orders/${finalOrderId}`}
              className="w-full sm:w-auto px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition shadow-sm text-center"
            >
              Xem chi tiết & Theo dõi đơn
            </Link>
          )}
          <Link
            href="/orders"
            className="w-full sm:w-auto px-5 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold rounded-xl text-sm transition text-center"
          >
            Xem lịch sử đơn
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-semibold rounded-xl text-sm transition text-center"
          >
            ← Quay lại Thực đơn
          </Link>
        </div>
      </div>
    );
  }

  // 3. Giỏ hàng rỗng và không có đơn chờ thanh toán
  if (items.length === 0 && !pendingOrder && !queryOrderId && step === 'order') {
    return (
      <div className="max-w-md mx-auto my-6 bg-white border border-gray-100 rounded-2xl py-12 px-6 text-center shadow-xs">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          🛒
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Giỏ hàng của bạn đang trống</h1>
        <p className="text-sm text-gray-500 mb-6">
          Vui lòng chọn món trước khi tiến hành đặt đơn và thanh toán.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-amber-600 text-white font-semibold rounded-xl text-sm hover:bg-amber-700 transition shadow-sm"
        >
          ← Xem Menu chọn món
        </Link>
      </div>
    );
  }

  // Xử lý tạo đơn hàng POST /orders
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingOrder) return;

    setCreateOrderError(null);
    setOutOfStockDetails([]);
    setIsCreatingOrder(true);

    try {
      const payload = buildCreateOrderPayload(items, receiveType, { note });
      const order = await createOrderApi(payload);
      const idempotencyKey = generateIdempotencyKey();

      const newPendingRecord: PendingOrderRecord = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        receiveType: order.receiveType,
        idempotencyKey,
        method: paymentMethod,
        createdAt: order.createdAt,
        itemCount: items.length,
        createdFromCart: true,
      };

      savePendingOrder(newPendingRecord);
      setPendingOrder(newPendingRecord);
      setCreatedOrder(order);
      setSessionCreatedOrderId(order.id);
      setCurrentIdempotencyKey(idempotencyKey);
      setLastSubmittedPayment(null);
      setStep('payment');
      router.replace(`/checkout?orderId=${encodeURIComponent(order.id)}`);
    } catch (err: unknown) {
      if (err instanceof OrderApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent('/checkout')}&expired=true`);
          return;
        }
        if (err.statusCode === 409) {
          // Lỗi hết hàng 409
          setOutOfStockDetails(err.details || []);
          setCreateOrderError(err.message || ORDER_ERROR_MESSAGES.OUT_OF_STOCK);
        } else {
          setCreateOrderError(err.message || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
        }
      } else {
        setCreateOrderError(ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
      }
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Xử lý thanh toán POST /payments
  const handlePayOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPayment) return;

    const accCheck = validateAccountNumber(accountNumber, paymentMethod);
    if (!accCheck.isValid) {
      setAccountNumberError(accCheck.error || ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID);
      return;
    }
    setAccountNumberError(null);

    const targetOrderId = createdOrder?.id || pendingOrder?.orderId;
    if (!targetOrderId) {
      setPaymentError(ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND);
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError(null);

    const tempAccount = accountNumber;
    const cleanAccount = tempAccount.replace(/[\s-]+/g, '');

    // Bảo mật: Xóa số tài khoản khỏi input ngay sau khi bấm gửi
    setAccountNumber('');

    const hasPaymentInfoChanged = Boolean(
      lastSubmittedPayment &&
        (lastSubmittedPayment.method !== paymentMethod ||
          lastSubmittedPayment.accountNumber !== cleanAccount)
    );
    const isPaymentFailed = Boolean(lastSubmittedPayment?.isFailed);
    const isUncertainResult = Boolean(
      lastSubmittedPayment && !lastSubmittedPayment.isFailed && !hasPaymentInfoChanged
    );

    const { key: effectiveKey } = resolveIdempotencyKey({
      currentKey: currentIdempotencyKey,
      hasPaymentInfoChanged,
      isPaymentFailed,
      isUncertainResult,
    });

    setCurrentIdempotencyKey(effectiveKey);

    const storedBeforePay = loadPendingOrder();
    const isCreatedFromCart = Boolean(
      sessionCreatedOrderId === targetOrderId ||
        (pendingOrder?.orderId === targetOrderId && pendingOrder.createdFromCart === true) ||
        (storedBeforePay?.orderId === targetOrderId && storedBeforePay.createdFromCart === true)
    );

    const activeOrder = createdOrder || pendingOrder;
    if (activeOrder) {
      const updatedRecord: PendingOrderRecord = {
        orderId: 'id' in activeOrder ? activeOrder.id : activeOrder.orderId,
        orderNumber: activeOrder.orderNumber,
        totalAmount: activeOrder.totalAmount,
        receiveType: activeOrder.receiveType,
        idempotencyKey: effectiveKey,
        method: paymentMethod,
        createdAt: activeOrder.createdAt,
        itemCount: 'itemCount' in activeOrder ? activeOrder.itemCount : items.length,
        ...(isCreatedFromCart ? { createdFromCart: true } : {}),
      };
      savePendingOrder(updatedRecord);
      setPendingOrder(updatedRecord);
    }

    try {
      const res = await payOrderApi(
        {
          orderId: targetOrderId,
          method: paymentMethod,
          accountNumber: cleanAccount,
        },
        effectiveKey
      );

      // Cả 201 và 200 (gửi lại) đều trả PaymentResponse
      if (res.status === 'SUCCESS') {
        const resolvedOrderNumber =
          res.order?.orderNumber ||
          createdOrder?.orderNumber ||
          pendingOrder?.orderNumber ||
          null;
        setSuccessOrderNumber(resolvedOrderNumber);

        // Chỉ xóa giỏ hàng khi đơn vừa thanh toán trùng với pendingOrder có cờ createdFromCart: true
        if (isCreatedFromCart) {
          clearAll();
        }

        clearPendingOrder();
        setPendingOrder(null);
        setLastSubmittedPayment(null);
        setPaymentSuccessData(res);
        setStep('success');
      } else {
        // status === 'FAILED': Giữ nguyên orderId, KHÔNG tạo đơn mới
        setLastSubmittedPayment({
          method: paymentMethod,
          accountNumber: cleanAccount,
          isFailed: true,
        });

        // Chuẩn bị sẵn key mới cho lần thử lại tiếp theo
        const nextKey = generateIdempotencyKey();
        setCurrentIdempotencyKey(nextKey);

        if (activeOrder) {
          const nextRecord: PendingOrderRecord = {
            orderId: 'id' in activeOrder ? activeOrder.id : activeOrder.orderId,
            orderNumber: activeOrder.orderNumber,
            totalAmount: activeOrder.totalAmount,
            receiveType: activeOrder.receiveType,
            idempotencyKey: nextKey,
            method: paymentMethod,
            createdAt: activeOrder.createdAt,
            itemCount: 'itemCount' in activeOrder ? activeOrder.itemCount : items.length,
            ...(isCreatedFromCart ? { createdFromCart: true } : {}),
          };
          savePendingOrder(nextRecord);
          setPendingOrder(nextRecord);
        }

        setPaymentError(
          res.failureReason || 'Thanh toán thất bại. Vui lòng kiểm tra lại tài khoản hoặc thử lại.'
        );
      }
    } catch (err: unknown) {
      if (err instanceof OrderApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent('/checkout')}&expired=true`);
          return;
        }

        if (err.statusCode === 404) {
          clearPendingOrder();
          setPendingOrder(null);
          setCreatedOrder(null);
          setLastSubmittedPayment(null);
          setStep('order');
          setCreateOrderError(
            'Đơn hàng trước đó không còn tồn tại trên hệ thống. Vui lòng tiến hành đặt lại.'
          );
          return;
        }

        if (err.statusCode === 409) {
          // Xử lý 409: đơn không còn thanh toán được hoặc xung đột Idempotency
          try {
            const checkOrder = await getOrderByIdApi(targetOrderId);
            if (checkOrder.status === 'PAID') {
              if (isCreatedFromCart) {
                clearAll();
              }
              clearPendingOrder();
              setPendingOrder(null);
              setSuccessOrderNumber(checkOrder.orderNumber);
              setPaymentSuccessData({
                id: `paid-${checkOrder.id}`,
                orderId: checkOrder.id,
                amount: checkOrder.totalAmount,
                method: paymentMethod,
                accountLast4: cleanAccount.slice(-4) || '••••',
                status: 'SUCCESS',
                createdAt: checkOrder.createdAt,
                order: {
                  id: checkOrder.id,
                  orderNumber: checkOrder.orderNumber,
                  status: 'PAID',
                },
              });
              setStep('success');
              return;
            }
          } catch {
            // Bỏ qua lỗi tra cứu
          }

          setPaymentError(
            'Đơn hàng không còn ở trạng thái cho phép thanh toán. Vui lòng quay lại giỏ hàng.'
          );
          return;
        }

        if (err.statusCode === 400) {
          setPaymentError(ORDER_ERROR_MESSAGES.ACCOUNT_NUMBER_INVALID);
          return;
        }

        // Lỗi mạng, timeout, 5xx: GIỮ NGUYÊN đơn chờ và key cũ
        if (err.statusCode === 0 || err.statusCode >= 500) {
          setLastSubmittedPayment({
            method: paymentMethod,
            accountNumber: cleanAccount,
            isFailed: false,
          });

          setPaymentError(
            err.statusCode >= 500
              ? 'Máy chủ đang gặp sự cố tạm thời. Vui lòng bấm Thử lại.'
              : err.message || 'Kết nối mạng bị gián đoạn. Vui lòng bấm Thử lại.'
          );
          return;
        }

        setPaymentError(err.message || ORDER_ERROR_MESSAGES.UNKNOWN_ERROR);
      } else {
        setPaymentError('Có lỗi xảy ra khi xử lý thanh toán. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleResumePendingOrder = () => {
    if (!pendingOrder) return;
    setCurrentIdempotencyKey(pendingOrder.idempotencyKey);
    setLastSubmittedPayment(null);
    setStep('payment');
    router.replace(`/checkout?orderId=${encodeURIComponent(pendingOrder.orderId)}`);
  };

  const handleCancelPendingOrder = () => {
    clearPendingOrder();
    setPendingOrder(null);
    setStep('order');
  };

  const activeAmount = createdOrder?.totalAmount ?? pendingOrder?.totalAmount ?? totalAmount;
  const activeOrderNumber =
    createdOrder?.orderNumber ?? pendingOrder?.orderNumber ?? null;
  const activeReceiveType =
    createdOrder?.receiveType ?? pendingOrder?.receiveType ?? receiveType;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Tiêu đề & Nút quay lại */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <Link
          href="/cart"
          className="inline-flex items-center text-xs sm:text-sm font-medium text-gray-600 hover:text-amber-600 transition"
        >
          <span className="mr-1">←</span> Quay lại Giỏ hàng
        </Link>
        <span className="text-xs sm:text-sm font-medium text-gray-500">
          {step === 'order' ? 'Bước 1/2: Đặt đơn' : 'Bước 2/2: Thanh toán'}
        </span>
      </div>

      {/* Banner đơn chờ thanh toán nếu có và đang ở bước tạo đơn */}
      {pendingOrder && step === 'order' && (
        <div className="max-w-3xl mx-auto bg-blue-50 border border-blue-200 text-blue-900 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
          <div>
            <div className="font-bold text-sm">
              Bạn có đơn hàng đang chờ thanh toán: #{pendingOrder.orderNumber}
            </div>
            <div className="text-xs text-blue-700 mt-0.5">
              Số tiền: <strong>{pendingOrder.totalAmount.toLocaleString('vi-VN')} đ</strong> (Hình
              thức: {RECEIVE_TYPE_LABELS[pendingOrder.receiveType]})
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={handleResumePendingOrder}
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Tiếp tục thanh toán
            </button>
            <button
              type="button"
              onClick={handleCancelPendingOrder}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              Hủy đơn này
            </button>
          </div>
        </div>
      )}

      {/* ======================= BƯỚC 1: XÁC NHẬN ĐẶT HÀNG ======================= */}
      {step === 'order' && (
        <form onSubmit={handleCreateOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* CỘT TRÁI (7 CỘT): Hình thức & Ghi chú */}
          <div className="lg:col-span-7 space-y-5">
            {/* Lỗi hết hàng 409 hoặc lỗi tạo đơn (ví dụ 404 đơn cũ không còn tồn tại) */}
            {createOrderError && (
              <div className="max-w-xl mx-auto lg:max-w-none bg-red-50 border border-red-200 text-red-700 p-4 sm:p-5 rounded-2xl text-sm space-y-2 shadow-xs">
                <div className="font-semibold">{createOrderError}</div>
                {outOfStockDetails.length > 0 && (
                  <div>
                    <p className="text-xs text-red-600 mb-1">Món hiện không đủ tồn kho:</p>
                    <ul className="list-disc list-inside text-xs font-medium space-y-0.5">
                      {outOfStockDetails.map((item, idx) => (
                        <li key={idx}>
                          {item.name} {item.available !== undefined ? `(còn ${item.available})` : ''}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3">
                      <Link
                        href="/cart"
                        className="inline-block px-3.5 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 transition"
                      >
                        Quay lại giỏ hàng
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 1. Hình thức nhận hàng */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-3.5">
              <h2 className="text-base font-bold text-gray-900">1. Hình thức nhận hàng</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                    receiveType === 'AT_COUNTER'
                      ? 'border-amber-600 bg-amber-50/50'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="receiveType"
                    value="AT_COUNTER"
                    checked={receiveType === 'AT_COUNTER'}
                    onChange={() => setReceiveType('AT_COUNTER')}
                    className="accent-amber-600 w-4 h-4 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Tại quầy</div>
                    <div className="text-xs text-gray-500">Uống tại quán</div>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                    receiveType === 'TAKE_AWAY'
                      ? 'border-amber-600 bg-amber-50/50'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="receiveType"
                    value="TAKE_AWAY"
                    checked={receiveType === 'TAKE_AWAY'}
                    onChange={() => setReceiveType('TAKE_AWAY')}
                    className="accent-amber-600 w-4 h-4 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Mang đi</div>
                    <div className="text-xs text-gray-500">Đóng gói mang về</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 2. Ghi chú đơn hàng */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-3">
              <label htmlFor="orderNote" className="block text-sm font-bold text-gray-900">
                2. Ghi chú đơn hàng (không bắt buộc)
              </label>
              <textarea
                id="orderNote"
                rows={3}
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Giao nhanh giúp mình, để riêng ống hút..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-amber-600 focus:outline-none"
              />
              <p className="text-[11px] text-gray-400 text-right">{note.length}/200 ký tự</p>
            </div>
          </div>

          {/* CỘT PHẢI (5 CỘT): Tóm tắt đơn hàng & Nút đặt đơn (dính khi cuộn trên màn lớn) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                Tóm tắt đơn hàng ({items.length} món)
              </h2>

              {/* Danh sách món */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-start text-xs border-b border-gray-50 pb-2.5"
                  >
                    <div className="pr-2 flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">
                        {item.name} <span className="text-amber-700">x{item.quantity}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 space-x-1">
                        {item.size && (
                          <span>{SIZE_LABELS[item.size as SizeId] || `Size ${item.size}`}</span>
                        )}
                        {item.sugarLevel && (
                          <span>
                            • Đường: {SUGAR_LABELS[item.sugarLevel as SugarLevel] || item.sugarLevel}
                          </span>
                        )}
                        {item.iceLevel && (
                          <span>• Đá: {getIceLabel(item.iceLevel as IceLevel)}</span>
                        )}
                      </div>
                      {item.toppings && item.toppings.length > 0 && (
                        <div className="text-[11px] text-gray-400">
                          Topping: {item.toppings.map((t) => t.name).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-gray-900 whitespace-nowrap">
                      {getLineTotal(item).toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                ))}
              </div>

              {/* Tạm tính & Tổng cộng */}
              <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Tạm tính:</span>
                  <span>{totalAmount.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-gray-50">
                  <span className="font-bold text-gray-900">Tổng cộng:</span>
                  <span className="text-xl font-black text-amber-600">
                    {totalAmount.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 italic pt-1">
                  * Giá tạm tính. Tổng tiền chính thức do server xác nhận khi tạo đơn.
                </p>
              </div>

              {/* Nút Đặt đơn */}
              <button
                type="submit"
                disabled={isCreatingOrder || items.length === 0}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCreatingOrder
                  ? 'Đang tạo đơn hàng...'
                  : `Đặt đơn hàng (${totalAmount.toLocaleString('vi-VN')} đ)`}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ======================= BƯỚC 2: THANH TOÁN ======================= */}
      {step === 'payment' && (
        <form onSubmit={handlePayOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* CỘT TRÁI (7 CỘT): Chọn phương thức thanh toán & Nhập số tài khoản */}
          <div className="lg:col-span-7 space-y-5">
            {/* Thông báo lỗi thanh toán nếu có */}
            {paymentError && (
              <div className="max-w-xl mx-auto lg:max-w-none bg-red-50 border border-red-200 text-red-700 p-4 sm:p-5 rounded-2xl text-xs sm:text-sm shadow-xs space-y-3">
                <div>
                  <strong>Lỗi thanh toán:</strong> {paymentError}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(createdOrder?.id || pendingOrder?.orderId) && (
                    <Link
                      href={`/orders/${createdOrder?.id || pendingOrder?.orderId}`}
                      className="inline-block px-3.5 py-1.5 bg-white hover:bg-red-100/50 text-red-700 border border-red-300 font-semibold rounded-xl text-xs transition"
                    >
                      Xem chi tiết & Theo dõi đơn
                    </Link>
                  )}
                  <Link
                    href="/orders"
                    className="inline-block px-3.5 py-1.5 bg-white hover:bg-red-100/50 text-red-700 border border-red-300 font-semibold rounded-xl text-xs transition"
                  >
                    Xem lịch sử đơn
                  </Link>
                </div>
              </div>
            )}

            {/* Chọn phương thức thanh toán */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-3.5">
              <h2 className="text-base font-bold text-gray-900">Chọn phương thức thanh toán</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                    paymentMethod === 'WALLET'
                      ? 'border-amber-600 bg-amber-50/50'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="WALLET"
                    checked={paymentMethod === 'WALLET'}
                    onChange={() => {
                      setPaymentMethod('WALLET');
                      setAccountNumberError(null);
                    }}
                    className="accent-amber-600 w-4 h-4 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Ví điện tử</div>
                    <div className="text-[11px] text-gray-500">Momo, ZaloPay (8 - 19 số)</div>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                    paymentMethod === 'CARD'
                      ? 'border-amber-600 bg-amber-50/50'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="CARD"
                    checked={paymentMethod === 'CARD'}
                    onChange={() => {
                      setPaymentMethod('CARD');
                      setAccountNumberError(null);
                    }}
                    className="accent-amber-600 w-4 h-4 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Thẻ ngân hàng</div>
                    <div className="text-[11px] text-gray-500">ATM, Visa (8 - 19 số)</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Nhập số thẻ/ví - Bảo mật cao */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-gray-900">
                {paymentMethod === 'WALLET' ? 'Số ví điện tử' : 'Số thẻ ngân hàng'}
              </h2>

              <div>
                <input
                  id="accountNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value);
                    if (accountNumberError) setAccountNumberError(null);
                  }}
                  placeholder={
                    paymentMethod === 'WALLET'
                      ? 'Nhập số ví điện tử (8 - 19 chữ số)...'
                      : 'Nhập số thẻ ngân hàng (8 - 19 chữ số)...'
                  }
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none ${
                    accountNumberError
                      ? 'border-red-400 bg-red-50/20'
                      : 'border-gray-200 focus:border-amber-600'
                  }`}
                  aria-invalid={Boolean(accountNumberError)}
                  aria-describedby={accountNumberError ? 'acc-error' : undefined}
                />
                {accountNumberError && (
                  <p id="acc-error" className="text-xs text-red-600 mt-1">
                    {accountNumberError}
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-2">
                  🔒 Thanh toán mô phỏng, không dùng thẻ thật. Thông tin thanh toán được gửi trực tiếp
                  và không bao giờ lưu trữ trên thiết bị.
                </p>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (5 CỘT): Tóm tắt đơn cần thanh toán & Nút hành động (dính khi cuộn trên màn lớn) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                Thông tin thanh toán
              </h2>

              {/* Thông tin đơn hàng cần thanh toán */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-amber-900 font-semibold">Mã đơn hàng:</span>
                  <span className="font-extrabold text-amber-900 text-base">
                    {activeOrderNumber !== null ? `#${activeOrderNumber}` : 'Đơn hàng mới'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-amber-900 font-semibold">Hình thức nhận:</span>
                  <span className="font-semibold text-amber-900">
                    {RECEIVE_TYPE_LABELS[activeReceiveType]}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-amber-200/60">
                  <span className="text-xs sm:text-sm text-amber-900 font-semibold">Số tiền thanh toán:</span>
                  <span className="text-xl sm:text-2xl font-black text-amber-600">
                    {activeAmount.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              {/* Nút hành động */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmittingPayment
                    ? 'Đang xử lý giao dịch...'
                    : lastSubmittedPayment?.isFailed || createdOrder?.status === 'PAYMENT_FAILED'
                      ? `Thử lại thanh toán (${activeAmount.toLocaleString('vi-VN')} đ)`
                      : `Xác nhận thanh toán (${activeAmount.toLocaleString('vi-VN')} đ)`}
                </button>

                <button
                  type="button"
                  onClick={() => setStep('order')}
                  disabled={isSubmittingPayment}
                  className="w-full py-2.5 text-xs text-gray-500 hover:text-gray-700 transition cursor-pointer"
                >
                  ← Thay đổi thông tin đơn hàng
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto py-20 text-center text-gray-500 text-sm">
          Đang tải trang đặt đơn và thanh toán...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
