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
    case 'COMPLETED':
      return 'bg-moss text-kombu font-bold';
    case 'PENDING':
    case 'PREPARING':
      return 'bg-warning text-noir font-bold';
    case 'READY':
      return 'bg-tan/50 text-noir border border-tan font-bold';
    case 'PAYMENT_FAILED':
    case 'CANCELLED':
      return 'bg-error/15 text-error border border-error/30 font-bold';
    default:
      return 'bg-tan/40 text-noir font-semibold';
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
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              data-testid={`order-card-${order.orderNumber}`}
              className="block bg-cream hover:bg-tan/20 border border-tan/60 hover:border-tan rounded-card p-4 sm:p-5 shadow-soft hover:shadow-raised transition group"
            >
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

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm text-noir/75 font-medium line-clamp-2 sm:line-clamp-1 break-words">
                  {summarizeOrderItems(order.items)}
                </p>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="font-display text-base sm:text-lg font-bold text-kombu">
                    {formatVndPrice(order.totalAmount)}
                  </span>
                  <span className="text-xs font-semibold text-kombu group-hover:translate-x-0.5 transition">
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
        <div className="max-w-4xl mx-auto py-16 text-center text-noir/65 text-sm">
          Đang tải lịch sử đơn hàng...
        </div>
      }
    >
      <OrdersHistoryContent />
    </Suspense>
  );
}

