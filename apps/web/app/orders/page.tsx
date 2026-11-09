'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
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
  summarizeOrderItems,
} from '../../services/order-contract';
import { getMyOrdersApi, OrderApiError } from '../../services/orders';
import { calculatePrice } from '../../utils/price';

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

function OrdersHistoryContent() {
  const router = useRouter();
  const { isChecking, isReady } = useRequireAuth();

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  // 1. Trạng thái Loading
  if (isChecking || !isReady || loading) {
    return (
      <div
        data-testid="orders-history-loading"
        className="max-w-4xl mx-auto py-16 text-center text-gray-500 text-sm space-y-4"
      >
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full" />
        <p>Đang tải danh sách đơn hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái Error (kèm nút Thử lại)
  if (error) {
    return (
      <div
        data-testid="orders-history-error"
        className="max-w-md mx-auto my-8 bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 text-center shadow-xs space-y-4"
      >
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-medium">
          {error}
        </div>
        <div>
          <button
            type="button"
            onClick={handleManualReload}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition cursor-pointer"
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center text-xs sm:text-sm font-medium text-gray-600 hover:text-amber-600 transition"
          >
            <span className="mr-1">←</span> Quay lại Menu
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Đơn hàng của tôi</h1>
        </div>

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

      {/* 3. Trạng thái Empty ("Bạn chưa có đơn hàng nào" + nút "Xem menu") */}
      {orders.length === 0 ? (
        <div
          data-testid="orders-history-empty"
          className="max-w-md mx-auto my-8 bg-white border border-gray-100 rounded-2xl py-12 px-6 text-center shadow-xs space-y-4"
        >
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-3xl">
            📋
          </div>
          <h2 className="text-lg font-bold text-gray-800">Bạn chưa có đơn hàng nào</h2>
          <p className="text-sm text-gray-500">
            Hãy khám phá thực đơn BrewLite và đặt ngay món đồ uống yêu thích của bạn nhé!
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition shadow-sm"
            >
              Xem menu
            </Link>
          </div>
        </div>
      ) : (
        /* 4. Danh sách đơn hàng (KHÔNG phân trang, KHÔNG lọc/tìm kiếm, giữ nguyên thứ tự server trả về) */
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              data-testid={`order-card-${order.orderNumber}`}
              className="block bg-white hover:bg-amber-50/20 border border-gray-100 hover:border-amber-200 rounded-2xl p-4 sm:p-5 shadow-xs transition group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg sm:text-xl font-black text-gray-900 group-hover:text-amber-700 transition">
                    #{order.orderNumber}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getOrderStatusBadgeClass(
                      order.status
                    )}`}
                  >
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-lg">
                    {RECEIVE_TYPE_LABELS[order.receiveType] || order.receiveType}
                  </span>
                </div>

                <div className="text-xs text-gray-500">
                  {formatVietnamDateTime(order.createdAt)}
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm text-gray-700 font-medium line-clamp-1">
                  {summarizeOrderItems(order.items)}
                </p>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-base sm:text-lg font-extrabold text-amber-600">
                    {formatVndPrice(order.totalAmount)}
                  </span>
                  <span className="text-xs font-semibold text-amber-700 group-hover:translate-x-0.5 transition">
                    Chi tiết →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-16 text-center text-gray-500 text-sm">
          Đang tải lịch sử đơn hàng...
        </div>
      }
    >
      <OrdersHistoryContent />
    </Suspense>
  );
}

