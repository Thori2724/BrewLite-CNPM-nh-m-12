'use client';

import Link from 'next/link';
import { useCart } from '../../context/CartContext';
import { getLineTotal, MAX_ITEM_QUANTITY } from '../../utils/cart';
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
      <div className="max-w-md mx-auto py-16 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
        <p>Đang tải giỏ hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái Giỏ hàng rỗng (kèm thông báo nếu có lỗi storage)
  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto bg-white border border-gray-100 rounded-2xl py-12 px-6 text-center space-y-4 shadow-xs my-6">
        {storageError && (
          <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-xs text-center border border-amber-200">
            Không thể truy cập bộ nhớ trình duyệt để lưu giỏ hàng.
          </div>
        )}
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          🛒
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Giỏ hàng của bạn đang trống</h1>
        <p className="text-sm text-gray-500 mb-6">
          Hãy quay lại thực đơn để chọn những món đồ uống và món bánh yêu thích nhé!
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-amber-600 text-white font-semibold rounded-xl text-sm hover:bg-amber-700 transition shadow-sm"
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
        <div className="max-w-md mx-auto bg-amber-50 text-amber-800 p-3 rounded-xl text-xs text-center border border-amber-200">
          Cảnh báo: Không thể lưu giỏ hàng vào bộ nhớ trình duyệt.
        </div>
      )}

      {/* Thanh điều hướng và Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-4">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center text-xs sm:text-sm font-medium text-gray-600 hover:text-amber-600 transition"
          >
            <span className="mr-1">←</span> Tiếp tục chọn món
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Giỏ hàng ({totalCount} ly)
          </h1>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="self-start sm:self-end text-xs sm:text-sm text-red-500 hover:text-red-700 font-medium transition cursor-pointer"
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
                className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-xs flex flex-col gap-3"
              >
                {/* Hàng 1: Ảnh (imageUrl), Tên món, Nút Xóa */}
                <div className="flex gap-3.5 sm:gap-4 items-start">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl flex-shrink-0 bg-gray-100"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                        {item.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        aria-label={`Xóa ${item.name}`}
                        className="text-gray-400 hover:text-red-500 text-xs sm:text-sm px-2 py-0.5 rounded-lg hover:bg-red-50 transition cursor-pointer shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Tùy chọn chi tiết: ẩn hoàn toàn nếu không có dữ liệu, không in "undefined" hay dòng trống */}
                    <div className="text-xs text-gray-500 space-y-1 mt-1">
                      {hasOptions && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {item.size && (
                            <span className="font-medium text-gray-700">
                              {getSizeLabel(item.size)}
                            </span>
                          )}
                          {item.sugarLevel && (
                            <span>
                              Đường: <strong>{getSugarLabel(item.sugarLevel)}</strong>
                            </span>
                          )}
                          {item.iceLevel && (
                            <span>
                              Đá: <strong>{getIceLabel(item.iceLevel)}</strong>
                            </span>
                          )}
                        </div>
                      )}

                      {hasToppings && (
                        <div className="text-gray-600">
                          Topping: {item.toppings.map((t) => t.name).join(', ')}
                        </div>
                      )}

                      {hasNote && (
                        <div className="italic text-gray-500">
                          Ghi chú: &ldquo;{item.note}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hàng 2: Bộ đổi số lượng và Giá tiền */}
                <div className="flex justify-between items-center pt-2.5 border-t border-gray-100 text-xs sm:text-sm">
                  {/* Bộ tăng/giảm số lượng (kẹp 1..10, giảm dưới 1 không tự xóa) */}
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      aria-label="Giảm số lượng"
                      className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-9 text-center font-bold text-gray-800">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      disabled={item.quantity >= MAX_ITEM_QUANTITY}
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      aria-label="Tăng số lượng"
                      className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Đơn giá và Thành tiền */}
                  <div className="text-right">
                    <div className="text-[11px] sm:text-xs text-gray-400">
                      Đơn giá: {item.unitPrice.toLocaleString('vi-VN')} đ
                    </div>
                    <div className="font-extrabold text-amber-600 text-sm sm:text-base">
                      {getLineTotal(item).toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CỘT PHẢI (4 CỘT): Tổng tiền và Nút đặt đơn (dính khi cuộn trên màn hình lớn) */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
              Tóm tắt giỏ hàng
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Tổng số lượng:</span>
                <span className="font-semibold text-gray-800">{totalCount} ly</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Tổng tạm tính:</span>
                <span className="text-xl sm:text-2xl font-black text-amber-600">
                  {totalAmount.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>

            <p className="text-[11px] sm:text-xs text-gray-500">
              * Giá trên là tạm tính; tiền thật do server tính toán chính thức khi tạo đơn hàng.
            </p>

            {/* Nút Tiến hành đặt đơn chuyển sang trang /checkout */}
            <Link
              href="/checkout"
              className="block w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-sm text-center"
            >
              Tiến hành đặt đơn ({totalAmount.toLocaleString('vi-VN')} đ)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
