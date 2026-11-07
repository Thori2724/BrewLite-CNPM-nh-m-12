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
} from '../../services/order-contract';
import {
  createOrderApi,
  payOrderApi,
  getOrderByIdApi,
  OrderApiError,
} from '../../services/orders';
import {
  buildCreateOrderPayload,
  checkPendingOrderStatus,
  clearPendingOrder,
  generateIdempotencyKey,
  PendingOrderRecord,
  resolveIdempotencyKey,
  savePendingOrder,
  validateAccountNumber,
  validateCustomerPhone,
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
  const { user, isChecking, isReady } = useRequireAuth();
  const { items, totalAmount, clearAll, isHydrated } = useCart();

  // Trạng thái các bước trên trang
  const [step, setStep] = useState<'order' | 'payment' | 'success'>('order');

  // Quản lý đơn chờ thanh toán (khởi tạo an toàn từ localStorage một lần duy nhất)
  const [initialOrderStatus] = useState(() => {
    if (typeof window === 'undefined') return { pendingOrder: null, wasExpired: false };
    return checkPendingOrderStatus();
  });
  const [pendingOrder, setPendingOrder] = useState<PendingOrderRecord | null>(
    initialOrderStatus.pendingOrder
  );
  const [wasExpiredNotice, setWasExpiredNotice] = useState<boolean>(
    initialOrderStatus.wasExpired
  );

  // Thông tin đơn hàng đang xử lý
  const [createdOrder, setCreatedOrder] = useState<OrderResponse | null>(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string>('');

  // Thông tin giao nhận & Người nhận
  const [receiveType, setReceiveType] = useState<ReceiveType>('AT_COUNTER');
  const [customCustomerName, setCustomCustomerName] = useState<string | null>(null);
  const customerName = customCustomerName !== null ? customCustomerName : (user?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Trạng thái đặt đơn hàng
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  const [outOfStockList, setOutOfStockList] = useState<string[]>([]);

  // Thông tin thanh toán (bảo mật: không bao giờ lưu storage hay log)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('E_WALLET');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountNumberError, setAccountNumberError] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<PaymentResponse | null>(null);
  const [successOrderNumber, setSuccessOrderNumber] = useState<string>('');
  const [lastSubmittedPayment, setLastSubmittedPayment] = useState<{
    method: PaymentMethod;
    accountNumber: string;
    isRejected?: boolean;
  } | null>(null);

  // Bảo mật: Xóa ô số tài khoản khi component unmount
  useEffect(() => {
    return () => {
      setAccountNumber('');
    };
  }, []);

  // Kiểm tra nếu đơn chờ đã được thanh toán thành công từ trước (F5 / mở lại trang)
  useEffect(() => {
    const orderIdToCheck = pendingOrder?.orderId;
    if (!orderIdToCheck) return;

    let isMounted = true;
    getOrderByIdApi(orderIdToCheck)
      .then((order) => {
        if (!isMounted) return;
        if (order.status === 'PAID') {
          clearPendingOrder();
          clearAll();
          setSuccessOrderNumber(order.orderNumber);
          setCreatedOrder(order);
          setPendingOrder(null);
          setPaymentSuccessData({
            id: `paid-${order.id}`,
            orderId: order.id,
            amount: order.totalAmount,
            method: 'E_WALLET',
            status: 'SUCCESS',
            orderStatus: 'PAID',
            idempotencyKey: pendingOrder.idempotencyKey,
            gatewayRef: 'Đã hoàn tất thanh toán',
            createdAt: order.createdAt,
          });
          setStep('success');
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        // Nếu server trả đúng 404 (đơn không còn tồn tại trên server/mock):
        // Xóa đơn chờ, quay về bước đặt đơn, thông báo rõ ràng và giữ nguyên giỏ hàng
        if (err instanceof OrderApiError && err.statusCode === 404) {
          clearPendingOrder();
          setPendingOrder(null);
          setCreatedOrder(null);
          setStep('order');
          setCreateOrderError(
            'Đơn hàng trước đó không còn tồn tại trên hệ thống. Vui lòng tiến hành đặt lại.'
          );
        }
        // Các trường hợp khác (lỗi mạng, timeout, 5xx): GIỮ NGUYÊN đơn chờ
      });

    return () => {
      isMounted = false;
    };
  }, [pendingOrder?.orderId, pendingOrder?.idempotencyKey, clearAll]);

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
              {successOrderNumber || createdOrder?.orderNumber || pendingOrder?.orderNumber || 'Đơn hàng'}
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
              {paymentSuccessData.method === 'E_WALLET' ? 'Ví điện tử' : 'Thẻ ngân hàng'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Mã giao dịch cổng:</span>
            <span className="font-mono text-xs text-gray-600">{paymentSuccessData.gatewayRef}</span>
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

  // Xử lý tạo đơn hàng
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingOrder) return;

    // Validate số điện thoại nhận hàng
    const phoneCheck = validateCustomerPhone(customerPhone);
    if (!phoneCheck.isValid) {
      setPhoneError(phoneCheck.error || 'Số điện thoại không hợp lệ');
      return;
    }
    setPhoneError(null);
    setCreateOrderError(null);
    setOutOfStockList([]);
    setIsCreatingOrder(true);

    try {
      const payload = buildCreateOrderPayload(items, receiveType, {
        note,
        customerName,
        customerPhone,
      });

      const order = await createOrderApi(payload);
      const idempotencyKey = generateIdempotencyKey();

      const newPendingRecord: PendingOrderRecord = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        receiveType: order.receiveType,
        idempotencyKey,
        expiresAt: order.expiresAt,
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
          // Lỗi hết hàng
          setOutOfStockList(err.outOfStockItems || []);
          setCreateOrderError(err.message);
        } else {
          setCreateOrderError(err.message);
        }
      } else {
        setCreateOrderError('Không thể tạo đơn hàng lúc này. Vui lòng thử lại sau.');
      }
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Xử lý thanh toán đơn hàng
  const handlePayOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPayment) return;

    // Validate số tài khoản theo phương thức
    const accCheck = validateAccountNumber(accountNumber, paymentMethod);
    if (!accCheck.isValid) {
      setAccountNumberError(accCheck.error || 'Số thẻ / ví không hợp lệ');
      return;
    }
    setAccountNumberError(null);

    const targetOrderId = createdOrder?.id || pendingOrder?.orderId;
    if (!targetOrderId) {
      setPaymentError('Không tìm thấy thông tin đơn hàng để thanh toán.');
      return;
    }

    // Kiểm tra đơn đã quá thời hạn 15 phút hay chưa
    const activeOrder = createdOrder || pendingOrder;
    if (activeOrder && new Date(activeOrder.expiresAt).getTime() <= Date.now()) {
      clearPendingOrder();
      setPendingOrder(null);
      setCreatedOrder(null);
      setStep('order');
      setWasExpiredNotice(true);
      setPaymentError('Đơn hàng đã hết hạn thanh toán (quá 15 phút). Vui lòng tạo đơn mới.');
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError(null);

    const tempAccount = accountNumber;
    const cleanAccount = tempAccount.replace(/[\s-]+/g, '');
    // Bảo mật: Xóa số tài khoản khỏi input ngay sau khi bấm gửi
    setAccountNumber('');

    // Xác định xem thông tin thanh toán có thay đổi so với lần trước không
    const hasPaymentInfoChanged = Boolean(
      lastSubmittedPayment &&
        (lastSubmittedPayment.method !== paymentMethod ||
          lastSubmittedPayment.accountNumber !== cleanAccount)
    );
    const isPaymentRejectedClearly = Boolean(lastSubmittedPayment?.isRejected);
    const isUncertainResult = Boolean(
      lastSubmittedPayment && !lastSubmittedPayment.isRejected && !hasPaymentInfoChanged
    );

    // Quyết định Idempotency-Key chuẩn xác cho lượt gửi này
    const { key: effectiveKey } = resolveIdempotencyKey({
      currentKey: currentIdempotencyKey,
      hasPaymentInfoChanged,
      isPaymentRejectedClearly,
      isUncertainResult,
    });

    // Luôn đồng bộ key hữu hiệu vào state và storage
    setCurrentIdempotencyKey(effectiveKey);

    if (activeOrder) {
      const updatedRecord: PendingOrderRecord = {
        orderId: 'id' in activeOrder ? activeOrder.id : activeOrder.orderId,
        orderNumber: activeOrder.orderNumber,
        totalAmount: activeOrder.totalAmount,
        receiveType: activeOrder.receiveType,
        idempotencyKey: effectiveKey,
        expiresAt: activeOrder.expiresAt,
        createdAt: activeOrder.createdAt,
        itemCount: 'itemCount' in activeOrder ? activeOrder.itemCount : items.length,
      };
      savePendingOrder(updatedRecord);
      setPendingOrder(updatedRecord);
    }

    try {
      const res = await payOrderApi(
        targetOrderId,
        {
          method: paymentMethod,
          accountNumber: tempAccount,
        },
        effectiveKey
      );

      // Thanh toán thành công: Dọn dẹp giỏ hàng và đơn chờ
      const resolvedOrderNumber =
        createdOrder?.orderNumber || pendingOrder?.orderNumber || 'Đơn hàng';
      setSuccessOrderNumber(resolvedOrderNumber);
      clearAll();
      clearPendingOrder();
      setPendingOrder(null);
      setLastSubmittedPayment(null);
      setPaymentSuccessData(res);
      setStep('success');
    } catch (err: unknown) {
      if (err instanceof OrderApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent('/checkout')}&expired=true`);
          return;
        }
        if (err.statusCode === 404) {
          // Server (hoặc mock) trả 404: không tìm thấy đơn
          // Bắt buộc xóa bản ghi đơn chờ, quay về bước tạo đơn, hiển thị thông báo tiếng Việt rõ ràng, giữ nguyên giỏ hàng
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
        if (err.statusCode === 410) {
          clearPendingOrder();
          setPendingOrder(null);
          setCreatedOrder(null);
          setStep('order');
          setWasExpiredNotice(true);
          setPaymentError('Đơn hàng đã hết hạn thanh toán (quá 15 phút). Vui lòng tạo đơn mới.');
          return;
        }
        if (err.statusCode === 402) {
          // Bị từ chối rõ ràng: Đánh dấu lần gửi này bị từ chối
          setLastSubmittedPayment({
            method: paymentMethod,
            accountNumber: cleanAccount,
            isRejected: true,
          });

          // Chuẩn bị sẵn key mới cho lần thử lại tiếp theo
          const { key: nextKey } = resolveIdempotencyKey({
            currentKey: effectiveKey,
            isPaymentRejectedClearly: true,
          });
          setCurrentIdempotencyKey(nextKey);

          if (activeOrder) {
            const nextRecord: PendingOrderRecord = {
              orderId: 'id' in activeOrder ? activeOrder.id : activeOrder.orderId,
              orderNumber: activeOrder.orderNumber,
              totalAmount: activeOrder.totalAmount,
              receiveType: activeOrder.receiveType,
              idempotencyKey: nextKey,
              expiresAt: activeOrder.expiresAt,
              createdAt: activeOrder.createdAt,
              itemCount: 'itemCount' in activeOrder ? activeOrder.itemCount : items.length,
            };
            savePendingOrder(nextRecord);
            setPendingOrder(nextRecord);
          }
          const rawErr = err.message || '';
          const cleanErr = rawErr.toLowerCase().includes('idempotency')
            ? 'Yêu cầu thanh toán không khớp với dữ liệu giao dịch trước đó. Vui lòng thử lại.'
            : rawErr;
          setPaymentError(cleanErr || 'Giao dịch bị từ chối. Vui lòng kiểm tra lại số thẻ/ví.');
        } else if (err.statusCode === 0 || err.statusCode >= 500) {
          // Lỗi mạng, timeout hoặc lỗi máy chủ 5xx (kết quả chưa rõ ràng): Bắt buộc giữ nguyên đơn chờ và key cũ
          setLastSubmittedPayment({
            method: paymentMethod,
            accountNumber: cleanAccount,
            isRejected: false,
          });

          const { key: keepKey } = resolveIdempotencyKey({
            currentKey: effectiveKey,
            isUncertainResult: true,
          });
          setCurrentIdempotencyKey(keepKey);

          if (activeOrder) {
            const keepRecord: PendingOrderRecord = {
              orderId: 'id' in activeOrder ? activeOrder.id : activeOrder.orderId,
              orderNumber: activeOrder.orderNumber,
              totalAmount: activeOrder.totalAmount,
              receiveType: activeOrder.receiveType,
              idempotencyKey: keepKey,
              expiresAt: activeOrder.expiresAt,
              createdAt: activeOrder.createdAt,
              itemCount: 'itemCount' in activeOrder ? activeOrder.itemCount : items.length,
            };
            savePendingOrder(keepRecord);
            setPendingOrder(keepRecord);
          }
          setPaymentError(
            err.statusCode >= 500
              ? 'Máy chủ đang gặp sự cố tạm thời. Vui lòng bấm Thử lại.'
              : err.message || 'Kết nối mạng bị gián đoạn. Vui lòng bấm Thử lại.'
          );
        } else {
          const rawErr = err.message || '';
          const cleanErr = rawErr.toLowerCase().includes('idempotency')
            ? 'Yêu cầu thanh toán không khớp với dữ liệu giao dịch trước đó. Vui lòng thử lại.'
            : rawErr;
          setPaymentError(cleanErr);
        }
      } else {
        setPaymentError('Có lỗi xảy ra khi xử lý thanh toán.');
      }
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Tiếp tục thanh toán đơn chờ
  const handleResumePendingOrder = () => {
    if (!pendingOrder) return;
    setCurrentIdempotencyKey(pendingOrder.idempotencyKey);
    setLastSubmittedPayment(null);
    setStep('payment');
  };

  // Hủy đơn chờ để tạo đơn mới
  const handleCancelPendingOrder = () => {
    clearPendingOrder();
    setPendingOrder(null);
    setStep('order');
  };

  const activeAmount = createdOrder?.totalAmount ?? pendingOrder?.totalAmount ?? totalAmount;
  const activeOrderNumber = createdOrder?.orderNumber ?? pendingOrder?.orderNumber ?? 'Đơn hàng mới';

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

      {/* Cảnh báo đơn trước đó đã hết hạn */}
      {wasExpiredNotice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-xs sm:text-sm flex items-start justify-between gap-3">
          <div>
            <strong>Lưu ý:</strong> Đơn hàng trước đó của bạn đã quá thời hạn 15 phút và đã tự động
            bị hủy. Bạn có thể tiến hành tạo đơn hàng mới bên dưới.
          </div>
          <button
            type="button"
            onClick={() => setWasExpiredNotice(false)}
            className="text-amber-600 hover:text-amber-800 font-bold"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner đơn chờ thanh toán nếu có và đang ở bước tạo đơn */}
      {pendingOrder && step === 'order' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
          <div>
            <div className="font-bold text-sm">
              Bạn có đơn hàng đang chờ thanh toán: {pendingOrder.orderNumber}
            </div>
            <div className="text-xs text-blue-700 mt-0.5">
              Số tiền: <strong>{pendingOrder.totalAmount.toLocaleString('vi-VN')} đ</strong> (Hạn
              15 phút kể từ lúc đặt)
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
          {/* CỘT TRÁI (7 CỘT): Hình thức & Người nhận */}
          <div className="md:col-span-7 space-y-5">
            {/* Lỗi hết hàng 409 hoặc lỗi tạo đơn */}
            {createOrderError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm space-y-2">
                <div className="font-semibold">{createOrderError}</div>
                {outOfStockList.length > 0 && (
                  <div>
                    <p className="text-xs text-red-600 mb-1">Món hiện không đủ tồn kho:</p>
                    <ul className="list-disc list-inside text-xs font-medium">
                      {outOfStockList.map((itemName, idx) => (
                        <li key={idx}>{itemName}</li>
                      ))}
                    </ul>
                    <div className="mt-3">
                      <Link
                        href="/cart"
                        className="inline-block px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition"
                      >
                        Về giỏ hàng để chỉnh sửa món
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

            {/* 2. Thông tin người nhận */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">2. Thông tin người nhận</h2>
                <span className="text-[11px] text-gray-400 italic">
                  [Chờ xác nhận từ backend]
                </span>
              </div>

              <div>
                <label htmlFor="customerName" className="block text-xs font-semibold text-gray-700 mb-1">
                  Họ và tên người nhận
                </label>
                <input
                  id="customerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomCustomerName(e.target.value)}
                  placeholder="Nhập tên người nhận..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="customerPhone" className="block text-xs font-semibold text-gray-700 mb-1">
                  Số điện thoại nhận hàng <span className="text-red-500">*</span>
                </label>
                <input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (phoneError) setPhoneError(null);
                  }}
                  placeholder="Ví dụ: 0901234567"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none ${
                    phoneError ? 'border-red-400 bg-red-50/20' : 'border-gray-200 focus:border-amber-600'
                  }`}
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? 'phone-error' : undefined}
                />
                {phoneError && (
                  <p id="phone-error" className="text-xs text-red-600 mt-1">
                    {phoneError}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="orderNote" className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú đơn hàng (không bắt buộc)
                </label>
                <textarea
                  id="orderNote"
                  rows={2}
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Giao nhanh giúp mình, để riêng ống hút..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:border-amber-600 focus:outline-none"
                />
              </div>
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
                  <div key={item.id} className="flex justify-between items-start text-xs border-b border-gray-50 pb-2">
                    <div className="pr-2 flex-1">
                      <div className="font-semibold text-gray-800">
                        {item.name} <span className="text-amber-700">x{item.quantity}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 space-x-1">
                        {item.size && <span>Size {item.size}</span>}
                        {item.sugarLevel && <span>• Đường: {item.sugarLevel}</span>}
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
              <span className="font-extrabold text-amber-900 text-base">{activeOrderNumber}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1 border-t border-amber-200/50">
              <span className="text-xs text-amber-900 font-semibold">Số tiền thanh toán:</span>
              <span className="text-2xl font-black text-amber-600">
                {activeAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
            <p className="text-[11px] text-amber-800 italic">
              Đơn hàng có hiệu lực trong 15 phút. Vui lòng hoàn tất thanh toán để quán pha chế.
            </p>
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
                  paymentMethod === 'E_WALLET'
                    ? 'border-amber-600 bg-amber-50/50'
                    : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="E_WALLET"
                  checked={paymentMethod === 'E_WALLET'}
                  onChange={() => {
                    setPaymentMethod('E_WALLET');
                    setAccountNumberError(null);
                  }}
                  className="accent-amber-600 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-800">Ví điện tử</div>
                  <div className="text-[11px] text-gray-500">Momo, ZaloPay (10 số)</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
                  paymentMethod === 'BANK_CARD'
                    ? 'border-amber-600 bg-amber-50/50'
                    : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="BANK_CARD"
                  checked={paymentMethod === 'BANK_CARD'}
                  onChange={() => {
                    setPaymentMethod('BANK_CARD');
                    setAccountNumberError(null);
                  }}
                  className="accent-amber-600 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-800">Thẻ ngân hàng</div>
                  <div className="text-[11px] text-gray-500">ATM / Visa (16 số)</div>
                </div>
              </label>
            </div>
          </div>

          {/* Nhập số thẻ/ví - Bảo mật cao */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-gray-900">
              {paymentMethod === 'E_WALLET' ? 'Số ví điện tử' : 'Số thẻ ngân hàng'}
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
                  paymentMethod === 'E_WALLET'
                    ? 'Nhập số điện thoại ví điện tử (10 số)...'
                    : 'Nhập số thẻ ngân hàng (16 số)...'
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
                🔒 Thông tin thanh toán được gửi trực tiếp và không bao giờ lưu trữ trên thiết bị.
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
              ← Thay đổi thông tin nhận hàng
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
