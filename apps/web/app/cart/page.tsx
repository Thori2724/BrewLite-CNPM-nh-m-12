'use client';

import Link from 'next/link';
import { useCart } from '../../context/CartContext';
import { getLineTotal, MAX_ITEM_QUANTITY } from '../../utils/cart';

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

export default function CartPage() {
  const { items, totalAmount, totalCount, isHydrated, updateQuantity, removeFromCart, clearAll } =
    useCart();

  // 1. Chờ hydration từ localStorage để tránh nhấp nháy hoặc lệch giao diện Server/Client
  if (!isHydrated) {
    return (
      <div className="py-16 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
        <p>Đang tải giỏ hàng...</p>
      </div>
    );
  }

  // 2. Trạng thái Giỏ hàng rỗng
  if (items.length === 0) {
    return (
      <div className="py-12 px-4 text-center max-w-md mx-auto">
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
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Thanh điều hướng và Tiêu đề */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <Link
          href="/"
          className="inline-flex items-center text-xs sm:text-sm font-medium text-gray-600 hover:text-amber-600 transition"
        >
          <span className="mr-1">←</span> Tiếp tục chọn món
        </Link>
        <button
          type="button"
          onClick={handleClearAll}
          className="text-xs text-red-500 hover:text-red-700 font-medium transition cursor-pointer"
        >
          Xóa tất cả
        </button>
      </div>

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">
          Giỏ hàng ({totalCount} món)
        </h1>
      </div>

      {/* Danh sách các dòng giỏ hàng */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-3 sm:p-4 bg-white rounded-xl border border-gray-100 shadow-xs flex flex-col gap-2.5"
          >
            {/* Hàng 1: Ảnh, Tên món, Nút Xóa */}
            <div className="flex gap-3 items-start">
              <img
                src={item.image}
                alt={item.name}
                className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0 bg-gray-100"
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-1">
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                    {item.name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    aria-label={`Xóa ${item.name}`}
                    className="text-gray-400 hover:text-red-500 text-xs px-1.5 py-0.5 rounded transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Tùy chọn chi tiết: chỉ hiện khi có dữ liệu, ẩn hoàn toàn nếu undefined (món bánh) */}
                <div className="text-[11px] sm:text-xs text-gray-500 space-y-0.5 mt-0.5">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {item.size && <span>Size: <strong>{item.size}</strong></span>}
                    {item.sugarLevel && <span>Đường: <strong>{item.sugarLevel}</strong></span>}
                    {item.iceLevel && <span>Đá: <strong>{getIceLabel(item.iceLevel)}</strong></span>}
                  </div>

                  {item.toppings && item.toppings.length > 0 && (
                    <div className="text-gray-600">
                      Topping: {item.toppings.map((t) => t.name).join(', ')}
                    </div>
                  )}

                  {item.note && (
                    <div className="italic text-gray-500">
                      Ghi chú: &ldquo;{item.note}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Hàng 2: Bộ đổi số lượng và Giá tiền */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-xs sm:text-sm">
              {/* Bộ tăng/giảm số lượng */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  disabled={item.quantity <= 1}
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  aria-label="Giảm số lượng"
                  className="w-7 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                >
                  -
                </button>
                <span className="w-8 text-center font-bold text-gray-800">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  disabled={item.quantity >= MAX_ITEM_QUANTITY}
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  aria-label="Tăng số lượng"
                  className="w-7 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                >
                  +
                </button>
              </div>

              {/* Đơn giá và Thành tiền */}
              <div className="text-right">
                <div className="text-[11px] text-gray-400">
                  Đơn giá: {item.unitPrice.toLocaleString('vi-VN')} đ
                </div>
                <div className="font-extrabold text-amber-600 text-sm sm:text-base">
                  {getLineTotal(item).toLocaleString('vi-VN')} đ
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tổng tiền và Nút đặt đơn */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs space-y-3 mt-4">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-semibold text-gray-700">Tổng tạm tính:</span>
          <span className="text-xl font-black text-amber-600">
            {totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>
        <p className="text-[11px] text-gray-500">
          * Giá trên là tạm tính; tiền thật do server tính toán chính thức khi tạo đơn hàng.
        </p>

        {/* Nút Tiến hành đặt đơn chuyển sang trang /checkout */}
        <Link
          href="/checkout"
          className="block w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-sm text-center"
        >
          Tiến hành đặt đơn ({totalAmount.toLocaleString('vi-VN')} đ)
        </Link>
      </div>
    </div>
  );
}

