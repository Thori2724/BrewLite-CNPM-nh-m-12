'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  getProductById,
  ProductDetail,
  SIZES,
  SUGAR_LEVELS,
  ICE_LEVELS,
  TOPPINGS,
  SizeId,
  SugarLevel,
  IceLevel,
  Topping,
} from '../../../services/api';
import { calculatePrice } from '../../../utils/price';
import { useCart } from '../../../context/CartContext';

export interface OrderItemDraft {
  productId: string;
  productName: string;
  size: SizeId;
  sugarLevel?: SugarLevel;
  iceLevel?: IceLevel;
  toppings: Topping[];
  note: string;
  quantity: number;
  estimatedPrice: number;
}

const MAX_TOPPINGS = 3;
const MAX_NOTE_LENGTH = 200;
const MAX_QUANTITY = 10;

function ProductDetailContent() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();

  // Các lựa chọn tùy chỉnh
  const [selectedSize, setSelectedSize] = useState<SizeId>('M');
  const [selectedSugar, setSelectedSugar] = useState<SugarLevel>('100%');
  const [selectedIce, setSelectedIce] = useState<IceLevel>('NORMAL');
  const [selectedToppings, setSelectedToppings] = useState<Topping[]>([]);
  const [note, setNote] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);
  const [toppingWarning, setToppingWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isCancelled = false;

    getProductById(id)
      .then((data) => {
        if (!isCancelled) {
          setProduct(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setError('Không thể tải thông tin món. Vui lòng thử lại!');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const handleRetry = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProductById(id);
      setProduct(data);
    } catch {
      setError('Không thể tải thông tin món. Vui lòng thử lại!');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý chọn / bỏ chọn Topping (tối đa 3 loại)
  const toggleTopping = (topping: Topping) => {
    setToppingWarning(null);
    const exists = selectedToppings.some((t) => t.id === topping.id);
    if (exists) {
      setSelectedToppings(selectedToppings.filter((t) => t.id !== topping.id));
    } else {
      if (selectedToppings.length >= MAX_TOPPINGS) {
        setToppingWarning(`Chỉ được chọn tối đa ${MAX_TOPPINGS} loại topping.`);
        return;
      }
      setSelectedToppings([...selectedToppings, topping]);
    }
  };

  // Tính giá tạm tính
  const currentSizeOption = SIZES.find((s) => s.id === selectedSize) || SIZES[0];
  const sizePriceDiff = product?.allowSize ? currentSizeOption.priceDiff : 0;
  const activeToppings = product?.allowTopping ? selectedToppings : [];

  const estimatedPrice = product
    ? calculatePrice({
        basePrice: product.price,
        sizePriceDiff,
        toppings: activeToppings,
        quantity,
      })
    : 0;

  // Xử lý khi nhấn nút "Thêm vào giỏ"
  const handleAddToCart = () => {
    if (!product || !product.isAvailable) return;

    // Đơn giá 1 ly = (giá món theo size + tổng giá topping)
    const unitPrice = calculatePrice({
      basePrice: product.price,
      sizePriceDiff,
      toppings: activeToppings,
      quantity: 1,
    });

    addToCart({
      productId: product.id,
      name: product.name,
      image: product.image,
      size: product.allowSize ? selectedSize : undefined,
      sugarLevel: product.allowSugar ? selectedSugar : undefined,
      iceLevel: product.allowIce ? selectedIce : undefined,
      toppings: activeToppings,
      note: note.trim(),
      unitPrice,
      quantity,
    });

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
    }, 2500);
  };

  // 1. Trạng thái Loading
  if (loading) {
    return (
      <div className="py-16 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
        <p>Đang tải chi tiết món...</p>
      </div>
    );
  }

  // 2. Trạng thái Lỗi API
  if (error) {
    return (
      <div className="py-12 px-4 text-center">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-4 inline-block max-w-sm">
          {error}
        </div>
        <div>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // 3. Trạng thái Không tìm thấy sản phẩm
  if (!product) {
    return (
      <div className="py-16 px-4 text-center text-gray-500">
        <span className="text-4xl block mb-2">🍽️</span>
        <h2 className="text-lg font-bold text-gray-800 mb-1">Không tìm thấy món ăn hoặc đồ uống này</h2>
        <p className="text-sm mb-6 text-gray-400">Có thể món này đã bị xóa hoặc đường dẫn không chính xác.</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition"
        >
          Quay lại Menu
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Nút quay lại Menu */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-amber-600 transition"
        >
          <span className="mr-1">←</span> Quay lại Menu
        </Link>
      </div>

      {/* Thông báo thêm vào giỏ thành công */}
      {addedSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-medium text-center">
          ✓ Đã thêm vào giỏ hàng! Xem tại biểu tượng 🛒
        </div>
      )}

      {/* Bố cục 2 cột trên máy tính, 1 cột trên điện thoại */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
        {/* CỘT TRÁI: Ảnh món và thông tin cơ bản */}
        <div>
          <div className="relative w-full h-64 sm:h-80 bg-gray-100 rounded-xl overflow-hidden shadow-inner">
            <img
              src={product.image}
              alt={product.name}
              className={`w-full h-full object-cover ${!product.isAvailable ? 'grayscale opacity-60' : ''}`}
            />
            {/* Nhãn hết hàng */}
            {!product.isAvailable && (
              <span className="absolute top-3 right-3 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-md font-bold shadow">
                Hết hàng
              </span>
            )}
            <span className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md">
              {product.category}
            </span>
          </div>

          <div className="mt-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{product.name}</h1>
            <p className="text-amber-600 font-extrabold text-lg sm:text-xl mt-1">
              {product.price.toLocaleString('vi-VN')} đ <span className="text-xs font-normal text-gray-400">(giá gốc)</span>
            </p>
            <p className="text-gray-600 text-sm mt-3 leading-relaxed">
              {product.description}
            </p>
          </div>
        </div>

        {/* CỘT PHẢI: Các tùy chọn món */}
        <div className="space-y-5">
          {/* 1. Chọn Size (chỉ hiển thị nếu món hỗ trợ) */}
          {product.allowSize && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Chọn kích cỡ (Size) <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SIZES.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    disabled={!product.isAvailable}
                    onClick={() => setSelectedSize(size.id)}
                    className={`py-2 px-3 rounded-xl border text-center transition ${
                      selectedSize === size.id
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold shadow-xs'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    } ${!product.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-xs">{size.name}</div>
                    <div className="text-xs text-amber-700 font-semibold mt-0.5">
                      {size.priceDiff > 0 ? `+${size.priceDiff.toLocaleString('vi-VN')} đ` : 'Gốc'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Chọn Đá (nếu món hỗ trợ) */}
          {product.allowIce && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Lượng đá
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ICE_LEVELS.map((ice) => (
                  <button
                    key={ice.id}
                    type="button"
                    disabled={!product.isAvailable}
                    onClick={() => setSelectedIce(ice.id)}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-medium text-center transition ${
                      selectedIce === ice.id
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    } ${!product.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {ice.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Chọn Đường (nếu món hỗ trợ) */}
          {product.allowSugar && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Lượng đường
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {SUGAR_LEVELS.map((sugar) => (
                  <button
                    key={sugar.id}
                    type="button"
                    disabled={!product.isAvailable}
                    onClick={() => setSelectedSugar(sugar.id)}
                    className={`py-1.5 px-1 rounded-lg border text-xs font-medium text-center transition ${
                      selectedSugar === sugar.id
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    } ${!product.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {sugar.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Chọn Topping (chỉ hiển thị nếu món hỗ trợ) */}
          {product.allowTopping && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-gray-800">
                  Topping thêm <span className="text-xs font-normal text-gray-500">(Tối đa {MAX_TOPPINGS})</span>
                </label>
                <span className="text-xs text-gray-400">
                  Đã chọn {selectedToppings.length}/{MAX_TOPPINGS}
                </span>
              </div>

              {toppingWarning && (
                <p className="text-xs text-amber-600 mb-2 font-medium">{toppingWarning}</p>
              )}

              <div className="space-y-2">
                {TOPPINGS.map((topping) => {
                  const isChecked = selectedToppings.some((t) => t.id === topping.id);
                  return (
                    <div
                      key={topping.id}
                      onClick={() => product.isAvailable && toggleTopping(topping)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                        isChecked
                          ? 'border-amber-600 bg-amber-50/50'
                          : 'border-gray-200 hover:bg-gray-50'
                      } ${!product.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!product.isAvailable}
                          onChange={() => {}}
                          className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 pointer-events-none"
                        />
                        <span className="text-xs font-medium text-gray-800">{topping.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-amber-700">
                        +{topping.price.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Ghi chú */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm font-bold text-gray-800">Ghi chú cho quán</label>
              <span className="text-xs text-gray-400">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              disabled={!product.isAvailable}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: ít ngọt, pha đậm vị trà..."
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          {/* 6. Số lượng và Giá tạm tính */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-gray-800">Số lượng</span>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  disabled={!product.isAvailable || quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  -
                </button>
                <span className="w-10 text-center text-sm font-bold text-gray-800">{quantity}</span>
                <button
                  type="button"
                  disabled={!product.isAvailable || quantity >= MAX_QUANTITY}
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                  className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Hiển thị giá tạm tính */}
            <div className="bg-amber-50/70 p-3 rounded-xl mb-4 border border-amber-100">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-amber-900 font-semibold">Tạm tính:</span>
                <span className="text-lg font-black text-amber-600">
                  {estimatedPrice.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                * Giá chính thức do máy chủ tính toán khi tạo đơn hàng.
              </p>
            </div>

            {/* Nút Thêm vào giỏ */}
            <button
              type="button"
              disabled={!product.isAvailable}
              onClick={handleAddToCart}
              className={`w-full py-3 rounded-xl text-sm font-bold transition shadow-sm ${
                product.isAvailable
                  ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-98'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {product.isAvailable ? `+ Thêm vào giỏ (${estimatedPrice.toLocaleString('vi-VN')} đ)` : 'Món tạm hết hàng'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-gray-500 text-sm">
          <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
          <p>Đang tải chi tiết món...</p>
        </div>
      }
    >
      <ProductDetailContent />
    </Suspense>
  );
}
