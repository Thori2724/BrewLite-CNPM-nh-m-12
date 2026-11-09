'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { SUGAR_LABELS, SugarLevel } from '../../services/api';
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

function getIceLabel(ice?: string): string {
  switch (ice) {
    case 'NONE':
      return 'Không đá';
    case 'LOW':
      return 'Ít đá';
    case 'NORMAL':
      return 'Bình thường';
    case 'FULL':
      return 'Nhiều đá';
    default:
      return ice || '';
  }
}

function CheckoutContent() {
  const router = useRouter();
  const { isChecking, isReady } = useRequireAuth();
  const { items, totalAmount, clearAll, isHydrated } = useCart();

  // Trạng thái các bước trên trang
  const [step, setStep] = useState<'order' | 'payment' | 'success'>('order');

  // Quản lý đơn chờ thanh toán (khởi tạo an toàn từ localStorage một lần duy nhất)
  const [initialPendingOrder] = useState<PendingOrderRecord | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadPendingOrder();
  });
  const [pendingOrder, setPendingOrder] = useState<PendingOrderRecord | null>(initialPendingOrder);

  // Thông tin đơn hàng đang xử lý
  const [createdOrder, setCreatedOrder] = useState<OrderResponse | null>(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string>(
    () => initialPendingOrder?.idempotencyKey || ''
  );

  // Thông tin giao nhận
  const [receiveType, setReceiveType] = useState<ReceiveType>(
    () => initialPendingOrder?.receiveType || 'AT_COUNTER'
  );
  const [note, setNote] = useState<string>('');

  // Trạng thái đặt đơn hàng
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  const [outOfStockDetails, setOutOfStockDetails] = useState<OutOfStockDetail[]>([]);

  // Thông tin thanh toán (bảo mật: không bao giờ lưu storage hay log)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => initialPendingOrder?.method || 'WALLET'
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
  useEffect(() => {
    clearAllRef.current = clearAll;
  });

  // Kiểm tra đơn chờ khi mount (hỗ trợ F5 / mở lại trang)
  useEffect(() => {
    const orderIdToCheck = initialPendingOrder?.orderId;
    if (!orderIdToCheck) return;

    let isMounted = true;
    getOrderByIdApi(orderIdToCheck)
      .then((order) => {
        if (!isMounted) return;
        if (order.status === 'PAID') {
          clearPendingOrder();
          clearAllRef.current();
          setSuccessOrderNumber(order.orderNumber);
          setCreatedOrder(order);
          setPendingOrder(null);
          setPaymentSuccessData({
            id: `paid-${order.id}`,
            orderId: order.id,
            amount: order.totalAmount,
            method: initialPendingOrder?.method || 'WALLET',
            accountLast4: '••••',
            status: 'SUCCESS',
            createdAt: order.createdAt,
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              status: 'PAID',
            },
          });
          setStep('success');
        } else if (order.status === 'PENDING' || order.status === 'PAYMENT_FAILED') {
          setCreatedOrder(order);
          setStep('payment');
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        if (err instanceof OrderApiError && err.statusCode === 404) {
          clearPendingOrder();
          setPendingOrder(null);
          setCreatedOrder(null);
          setStep('order');
          setCreateOrderError(
            'Đơn hàng trước đó không còn tồn tại trên hệ thống. Vui lòng tiến hành đặt lại.'
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialPendingOrder]);

  // Bảo mật: Xóa ô số tài khoản khi component unmount
  useEffect(() => {
    return () => {
      setAccountNumber('');
    };
  }, []);

  // 1. Đang kiểm tra đăng nhập hoặc chưa nạp xong giỏ hàng
  if (isChecking || !isReady || !isHydrated) {
    return (
      <div className="py-20 text-center text-gray-500 text-sm">
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

    return (
      <div className="max-w-lg mx-auto py-10 px-4 text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-5 text-4xl shadow-xs">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán thành công!</h1>
        <p className="text-sm text-gray-600 mb-6">
          Cảm ơn bạn đã đặt món tại BrewLite. Quán đang chuẩn bị đồ uống cho bạn.
        </p>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs text-left text-sm space-y-3 mb-6">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <span className="text-gray-500">Mã đơn hàng:</span>
            <span className="font-bold text-gray-900">
              {finalOrderNum !== undefined ? `#${finalOrderNum}` : 'Đơn hàng'}
            </span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <span className="text-gray-500">Số tiền đã trả:</span>
            <span className="font-bold text-amber-600">
              {paymentSuccessData.amount.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
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

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition shadow-sm text-center"
          >
            ← Quay lại Thực đơn
          </Link>
        </div>
      </div>
    );
  }

  // 3. Giỏ hàng rỗng và không có đơn chờ thanh toán
  if (items.length === 0 && !pendingOrder && step === 'order') {
    return (
      <div className="py-16 px-4 text-center max-w-md mx-auto">
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
      };

      savePendingOrder(newPendingRecord);
      setPendingOrder(newPendingRecord);
      setCreatedOrder(order);
      setCurrentIdempotencyKey(idempotencyKey);
      setLastSubmittedPayment(null);
      setStep('payment');
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
      };
      savePendingOrder(updatedRecord);
      setPendingOrder(updatedRecord);
    }

    try {
      const res = await payOrderApi(
        {
          orderId: targetOrderId,
          method: paymentMethod,
          accountNumber: tempAccount,
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
        clearAll();
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
              clearAll();
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
  };

  const handleCancelPendingOrder = () => {
    clearPendingOrder();
    setPendingOrder(null);
    setStep('order');
  };

  const activeAmount = createdOrder?.totalAmount ?? pendingOrder?.totalAmount ?? totalAmount;
  const activeOrderNumber =
    createdOrder?.orderNumber ?? pendingOrder?.orderNumber ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tiêu đề & Nút quay lại */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <Link
          href="/cart"
          className="inline-flex items-center text-xs sm:text-sm font-medium text-gray-600 hover:text-amber-600 transition"
        >
          <span className="mr-1">←</span> Quay lại Giỏ hàng
        </Link>
        <span className="text-xs text-gray-400">
          {step === 'order' ? 'Bước 1/2: Đặt đơn' : 'Bước 2/2: Thanh toán'}
        </span>
      </div>

      {/* Banner đơn chờ thanh toán nếu có và đang ở bước tạo đơn */}
      {pendingOrder && step === 'order' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
          <div>
            <div className="font-bold text-sm">
              Bạn có đơn hàng đang chờ thanh toán: #{pendingOrder.orderNumber}
            </div>
            <div className="text-xs text-blue-700 mt-0.5">
              Số tiền: <strong>{pendingOrder.totalAmount.toLocaleString('vi-VN')} đ</strong> (Hình
              thức: {RECEIVE_TYPE_LABELS[pendingOrder.receiveType]})
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleResumePendingOrder}
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Tiếp tục thanh toán
            </button>
            <button
              type="button"
              onClick={handleCancelPendingOrder}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-medium transition"
            >
              Hủy đơn này
            </button>
          </div>
        </div>
      )}

      {/* ======================= BƯỚC 1: XÁC NHẬN ĐẶT HÀNG ======================= */}
      {step === 'order' && (
        <form onSubmit={handleCreateOrder} className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* CỘT TRÁI (7 CỘT): Hình thức & Ghi chú */}
          <div className="md:col-span-7 space-y-5">
            {/* Lỗi hết hàng 409 hoặc lỗi tạo đơn */}
            {createOrderError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm space-y-2">
                <div className="font-semibold">{createOrderError}</div>
                {outOfStockDetails.length > 0 && (
                  <div>
                    <p className="text-xs text-red-600 mb-1">Món hiện không đủ tồn kho:</p>
                    <ul className="list-disc list-inside text-xs font-medium">
                      {outOfStockDetails.map((item, idx) => (
                        <li key={idx}>
                          {item.name} {item.available !== undefined ? `(còn ${item.available})` : ''}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3">
                      <Link
                        href="/cart"
                        className="inline-block px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition"
                      >
                        Quay lại giỏ hàng
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 1. Hình thức nhận hàng */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-gray-900">1. Hình thức nhận hàng</h2>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
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
                    className="accent-amber-600 w-4 h-4"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Tại quầy</div>
                    <div className="text-xs text-gray-500">Uống tại quán</div>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
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
                    className="accent-amber-600 w-4 h-4"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Mang đi</div>
                    <div className="text-xs text-gray-500">Đóng gói mang về</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 2. Ghi chú đơn hàng */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
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

          {/* CỘT PHẢI (5 CỘT): Tóm tắt đơn hàng & Nút đặt đơn */}
          <div className="md:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                Tóm tắt đơn hàng ({items.length} món)
              </h2>

              {/* Danh sách món */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-start text-xs border-b border-gray-50 pb-2"
                  >
                    <div className="pr-2 flex-1">
                      <div className="font-semibold text-gray-800">
                        {item.name} <span className="text-amber-700">x{item.quantity}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 space-x-1">
                        {item.size && <span>Size {item.size}</span>}
                        {item.sugarLevel && (
                          <span>
                            • Đường: {SUGAR_LABELS[item.sugarLevel as SugarLevel] || item.sugarLevel}
                          </span>
                        )}
                        {item.iceLevel && <span>• Đá: {getIceLabel(item.iceLevel)}</span>}
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
        <form onSubmit={handlePayOrder} className="max-w-xl mx-auto space-y-5">
          {/* Thông tin đơn hàng cần thanh toán */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 shadow-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-amber-900 font-semibold">Mã đơn hàng:</span>
              <span className="font-extrabold text-amber-900 text-base">
                {activeOrderNumber !== null ? `#${activeOrderNumber}` : 'Đơn hàng mới'}
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-1 border-t border-amber-200/50">
              <span className="text-xs text-amber-900 font-semibold">Số tiền thanh toán:</span>
              <span className="text-2xl font-black text-amber-600">
                {activeAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>

          {/* Thông báo lỗi thanh toán nếu có */}
          {paymentError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs sm:text-sm">
              <strong>Lỗi thanh toán:</strong> {paymentError}
            </div>
          )}

          {/* Chọn phương thức thanh toán */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-gray-900">Chọn phương thức thanh toán</h2>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
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
                  className="accent-amber-600 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-800">Ví điện tử</div>
                  <div className="text-[11px] text-gray-500">Momo, ZaloPay (8 - 19 số)</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
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
                  className="accent-amber-600 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-800">Thẻ ngân hàng</div>
                  <div className="text-[11px] text-gray-500">ATM, Visa (8 - 19 số)</div>
                </div>
              </label>
            </div>
          </div>

          {/* Nhập số thẻ/ví - Bảo mật cao */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
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

          {/* Nút hành động */}
          <div className="space-y-2">
            <button
              type="submit"
              disabled={isSubmittingPayment}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmittingPayment
                ? 'Đang xử lý giao dịch...'
                : `Xác nhận thanh toán (${activeAmount.toLocaleString('vi-VN')} đ)`}
            </button>

            <button
              type="button"
              onClick={() => setStep('order')}
              disabled={isSubmittingPayment}
              className="w-full py-2.5 text-xs text-gray-500 hover:text-gray-700 transition"
            >
              ← Thay đổi thông tin đơn hàng
            </button>
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
        <div className="py-20 text-center text-gray-500 text-sm">
          Đang tải trang đặt đơn và thanh toán...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
