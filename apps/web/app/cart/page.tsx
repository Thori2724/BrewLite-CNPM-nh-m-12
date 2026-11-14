'use client';

import Link from 'next/link';
import { useCart } from '../../context/CartContext';
import { getLineTotal, MAX_ITEM_QUANTITY } from '../../utils/cart';
import { formatVnd } from '../../utils/validation';
import {
  SIZE_LABELS,
  SUGAR_LABELS,
  ICE_LABELS,
  SizeId,
  SugarLevel,
  IceLevel,
} from '../../services/api';

function getSizeLabel(size?: SizeId): string {
  if (!size) return '';
  return SIZE_LABELS[size] || `Size ${size}`;
}

function getSugarLabel(sugar?: SugarLevel): string {
  if (!sugar) return '';
  return SUGAR_LABELS[sugar] || sugar;
}

function getIceLabel(ice?: IceLevel): string {
  if (!ice) return '';
  return ICE_LABELS[ice] || ice;
}

export default function CartPage() {
  const {
    items,
    totalAmount,
    totalCount,
    isHydrated,
    storageError,
    updateQuantity,
    removeFromCart,
    clearAll,
  } = useCart();

  // 1. Trạng thái Loading: Chờ hydration từ localStorage để tránh nhấp nháy hoặc lệch giao diện Server/Client
  if (!isHydrated) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-kombu border-t-transparent rounded-full mb-3" />
        <p>Đang tải giỏ hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái Giỏ hàng rỗng (kèm thông báo nếu có lỗi storage)
  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto bg-cream border border-tan/60 rounded-card py-12 px-6 text-center space-y-4 shadow-soft my-6">
        {storageError && (
          <div className="bg-tan/25 text-noir p-3 rounded-control text-xs text-center border border-tan/80">
            Không thể truy cập bộ nhớ trình duyệt để lưu giỏ hàng.
          </div>
        )}
        <div className="w-20 h-20 bg-bone border border-tan rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-kombu">
          🛒
        </div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-noir mb-2">
          Giỏ hàng của bạn đang trống
        </h1>
        <p className="text-sm text-noir/65 mb-6 max-w-xs mx-auto leading-relaxed">
          Hãy quay lại thực đơn để chọn những món đồ uống và món bánh yêu thích nhé!
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-kombu text-bone font-semibold rounded-control text-sm hover:bg-noir active:scale-[0.98] transition shadow-soft"
        >
          ← Quay lại Menu
        </Link>
      </div>
    );
  }

  // 3. Xử lý xóa toàn bộ giỏ có xác nhận
  const handleClearAll = () => {
    if (typeof window !== 'undefined' && window.confirm('Bạn có chắc chắn muốn xóa toàn bộ món trong giỏ hàng?')) {
      clearAll();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Cảnh báo lỗi truy cập storage nếu có */}
      {storageError && (
        <div className="max-w-md mx-auto bg-tan/25 text-noir p-3 rounded-control text-xs text-center border border-tan/80">
          Cảnh báo: Không thể lưu giỏ hàng vào bộ nhớ trình duyệt.
        </div>
      )}

      {/* Thanh điều hướng và Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-tan/60 pb-4">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center text-xs sm:text-sm font-medium text-noir/65 hover:text-kombu transition"
          >
            <span className="mr-1">←</span> Tiếp tục chọn món
          </Link>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-noir">
            Giỏ hàng ({totalCount} món)
          </h1>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="self-start sm:self-end text-xs sm:text-sm text-error hover:underline font-medium transition cursor-pointer"
        >
          Xóa tất cả
        </button>
      </div>

      {/* Bố cục 2 cột trên desktop (trái: danh sách món, phải: tóm tắt tổng tiền dính khi cuộn), 1 cột trên điện thoại */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* CỘT TRÁI (8 CỘT): Danh sách các dòng giỏ hàng */}
        <div className="lg:col-span-8 space-y-3.5">
          {items.map((item) => {
            const hasOptions = Boolean(item.size || item.sugarLevel || item.iceLevel);
            const hasToppings = Boolean(item.toppings && item.toppings.length > 0);
            const hasNote = Boolean(item.note && item.note.trim());

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 bg-cream rounded-card border border-tan/60 shadow-soft flex flex-col gap-3"
              >
                {/* Hàng 1: Ảnh (imageUrl), Tên món, Nút Xóa */}
                <div className="flex gap-3.5 sm:gap-4 items-start">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-control flex-shrink-0 bg-bone border border-tan/40"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h2 className="font-display text-sm sm:text-base font-bold text-noir break-words">
                        {item.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        aria-label={`Xóa ${item.name}`}
                        className="text-noir/40 hover:text-error text-xs sm:text-sm px-2 py-0.5 rounded-control hover:bg-error/10 transition cursor-pointer shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Tùy chọn chi tiết: ẩn hoàn toàn nếu không có dữ liệu, không in "undefined" hay dòng trống */}
                    <div className="text-xs text-noir/65 space-y-1 mt-1">
                      {hasOptions && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {item.size && (
                            <span className="font-medium text-noir/80">
                              {getSizeLabel(item.size)}
                            </span>
                          )}
                          {item.sugarLevel && (
                            <span>
                              Đường: <strong className="text-noir">{getSugarLabel(item.sugarLevel)}</strong>
                            </span>
                          )}
                          {item.iceLevel && (
                            <span>
                              Đá: <strong className="text-noir">{getIceLabel(item.iceLevel)}</strong>
                            </span>
                          )}
                        </div>
                      )}

                      {hasToppings && (
                        <div className="text-noir/70 break-words">
                          Topping: {item.toppings.map((t) => t.name).join(', ')}
                        </div>
                      )}

                      {hasNote && (
                        <div className="italic text-noir/60 break-words">
                          Ghi chú: &ldquo;{item.note}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hàng 2: Bộ đổi số lượng và Giá tiền */}
                <div className="flex justify-between items-center pt-2.5 border-t border-tan/40 text-xs sm:text-sm">
                  {/* Bộ tăng/giảm số lượng (kẹp 1..10, giảm dưới 1 không tự xóa) */}
                  <div className="flex items-center border border-tan rounded-control overflow-hidden bg-bone">
                    <button
                      type="button"
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      aria-label="Giảm số lượng"
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-bone hover:bg-cream text-noir disabled:opacity-30 disabled:cursor-not-allowed font-bold cursor-pointer transition"
                    >
                      -
                    </button>
                    <span className="w-9 text-center font-bold text-noir">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      disabled={item.quantity >= MAX_ITEM_QUANTITY}
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      aria-label="Tăng số lượng"
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-bone hover:bg-cream text-noir disabled:opacity-30 disabled:cursor-not-allowed font-bold cursor-pointer transition"
                    >
                      +
                    </button>
                  </div>

                  {/* Đơn giá và Thành tiền */}
                  <div className="text-right">
                    <div className="text-[11px] sm:text-xs text-noir/50">
                      Đơn giá: {formatVnd(item.unitPrice)}
                    </div>
                    <div className="font-bold text-kombu text-sm sm:text-base">
                      {formatVnd(getLineTotal(item))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CỘT PHẢI (4 CỘT): Tổng tiền và Nút đặt đơn (dính khi cuộn trên màn hình lớn) */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <div className="bg-kombu text-bone p-5 sm:p-6 rounded-card shadow-soft space-y-4">
            <h2 className="text-base font-bold text-bone border-b border-bone/20 pb-3">
              Tóm tắt giỏ hàng
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-bone/80">
                <span>Tổng số lượng:</span>
                <span className="font-semibold text-bone">{totalCount} món</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-bone/20">
                <span className="text-sm font-semibold text-bone/90">Tính tổng:</span>
                <span className="text-xl sm:text-2xl font-bold text-bone">
                  {formatVnd(totalAmount)}
                </span>
              </div>
            </div>

            {/* Nút Tiến hành đặt đơn chuyển sang trang /checkout */}
            <Link
              href="/checkout"
              className="block w-full py-3.5 bg-bone hover:bg-cream text-kombu hover:text-noir font-bold rounded-control text-sm transition shadow-soft text-center active:scale-[0.98]"
            >
              Tiến hành đặt đơn ({formatVnd(totalAmount)})
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
