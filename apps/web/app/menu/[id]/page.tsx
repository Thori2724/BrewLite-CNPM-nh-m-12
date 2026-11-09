'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  getProductById,
  ProductDetail,
  ProductTopping,
  SizeId,
  SugarLevel,
  IceLevel,
  CATEGORY_LABELS,
} from '../../../services/api';
import { calculatePrice } from '../../../utils/price';
import { useCart } from '../../../context/CartContext';

const MAX_TOPPINGS = 3;
const MAX_NOTE_LENGTH = 200;
const MAX_QUANTITY = 10;
const MIN_QUANTITY = 1;

function ProductDetailContent() {
  const params = useParams();
  const id =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : '';

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();

  // Các lựa chọn tùy chỉnh mặc định theo yêu cầu: Size S, Đường P100, Đá NORMAL (không lấy phần tử đầu mảng)
  const [selectedSize, setSelectedSize] = useState<SizeId>('S');
  const [selectedSugar, setSelectedSugar] = useState<SugarLevel>('P100');
  const [selectedIce, setSelectedIce] = useState<IceLevel>('NORMAL');
  const [selectedToppings, setSelectedToppings] = useState<ProductTopping[]>([]);
  const [note, setNote] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [toppingWarning, setToppingWarning] = useState<string | null>(null);
  const [quantityWarning, setQuantityWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isCancelled = false;

    getProductById(id)
      .then((data) => {
        if (!isCancelled) {
          setProduct(data);
          setError(null);
          setLoading(false);

          if (data) {
            // Đặt mặc định theo server options nếu có
            if (data.sizes && data.sizes.length > 0) {
              const hasS = data.sizes.some((s) => s.value === 'S');
              setSelectedSize(hasS ? 'S' : data.sizes[0].value);
            }
            if (data.sugarLevels && data.sugarLevels.length > 0) {
              const hasP100 = data.sugarLevels.some((s) => s.value === 'P100');
              setSelectedSugar(hasP100 ? 'P100' : data.sugarLevels[0].value);
            }
            if (data.iceLevels && data.iceLevels.length > 0) {
              const hasNormal = data.iceLevels.some((i) => i.value === 'NORMAL');
              setSelectedIce(hasNormal ? 'NORMAL' : data.iceLevels[0].value);
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const message =
            err instanceof Error ? err.message : 'Không thể tải thông tin món. Vui lòng thử lại!';
          setError(message);
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
      if (data) {
        if (data.sizes && data.sizes.length > 0) {
          const hasS = data.sizes.some((s) => s.value === 'S');
          setSelectedSize(hasS ? 'S' : data.sizes[0].value);
        }
        if (data.sugarLevels && data.sugarLevels.length > 0) {
          const hasP100 = data.sugarLevels.some((s) => s.value === 'P100');
          setSelectedSugar(hasP100 ? 'P100' : data.sugarLevels[0].value);
        }
        if (data.iceLevels && data.iceLevels.length > 0) {
          const hasNormal = data.iceLevels.some((i) => i.value === 'NORMAL');
          setSelectedIce(hasNormal ? 'NORMAL' : data.iceLevels[0].value);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Không thể tải thông tin món. Vui lòng thử lại!';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Xử lý chọn / bỏ chọn Topping (tối đa 3 loại không trùng)
  const toggleTopping = (topping: ProductTopping) => {
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

  const handleIncreaseQuantity = () => {
    setQuantityWarning(null);
    if (quantity >= MAX_QUANTITY) {
      setQuantityWarning('Số lượng phải từ 1 đến 10.');
      return;
    }
    setQuantity((q) => Math.min(MAX_QUANTITY, q + 1));
  };

  const handleDecreaseQuantity = () => {
    setQuantityWarning(null);
    if (quantity <= MIN_QUANTITY) {
      setQuantityWarning('Số lượng phải từ 1 đến 10.');
      return;
    }
    setQuantity((q) => Math.max(MIN_QUANTITY, q - 1));
  };

  // Tính giá tạm tính phía client
  const isOutOfStock = !product || product.stock <= 0;
  const currentSizeOption = product?.sizes?.find((s) => s.value === selectedSize);
  const sizeExtraPrice = currentSizeOption ? currentSizeOption.extraPrice : 0;
  const activeToppings = (product?.toppings && product.toppings.length > 0) ? selectedToppings : [];

  const estimatedPrice = product
    ? calculatePrice({
        basePrice: product.basePrice,
        sizeExtraPrice,
        toppings: activeToppings,
        quantity,
      })
    : 0;

  // Xử lý khi nhấn nút "Thêm vào giỏ"
  const handleAddToCart = () => {
    if (!product || isOutOfStock) return;

    if (quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
      setQuantityWarning('Số lượng phải từ 1 đến 10.');
      return;
    }

    setCartError(null);

    // Đơn giá 1 ly/món = basePrice + sizeExtraPrice + tổng giá topping
    const unitPrice = calculatePrice({
      basePrice: product.basePrice,
      sizeExtraPrice,
      toppings: activeToppings,
      quantity: 1,
    });

    const result = addToCart({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      size: product.sizes && product.sizes.length > 0 ? selectedSize : undefined,
      sugarLevel: product.sugarLevels && product.sugarLevels.length > 0 ? selectedSugar : undefined,
      iceLevel: product.iceLevels && product.iceLevels.length > 0 ? selectedIce : undefined,
      toppings: activeToppings,
      note: note.trim(),
      unitPrice,
      quantity,
    });

    if (!result.ok) {
      setCartError(result.error || 'Không thể thêm vào giỏ hàng.');
      return;
    }

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
    }, 2500);
  };

  // 1. Trạng thái Loading
  if (loading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
        <p>Đang tải chi tiết món...</p>
      </div>
    );
  }

  // 2. Trạng thái Lỗi API
  if (error) {
    return (
      <div className="max-w-md mx-auto bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 shadow-xs text-center space-y-4 my-6">
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm">
          {error}
        </div>
        <div>
          <button
            type="button"
            onClick={handleRetry}
            className="px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition cursor-pointer"
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
      <div className="max-w-md mx-auto bg-white border border-gray-100 rounded-2xl py-12 px-6 text-center text-gray-500 shadow-xs my-6">
        <span className="text-4xl block mb-3">🍽️</span>
        <h2 className="text-lg font-bold text-gray-800 mb-1">Không tìm thấy món ăn hoặc đồ uống này</h2>
        <p className="text-sm mb-6 text-gray-400">Có thể món này đã bị xóa hoặc đường dẫn không chính xác.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition shadow-xs"
        >
          Quay lại Menu
        </Link>
      </div>
    );
  }

  const hasSizes = product.sizes && product.sizes.length > 0;
  const hasIceLevels = product.iceLevels && product.iceLevels.length > 0;
  const hasSugarLevels = product.sugarLevels && product.sugarLevels.length > 0;
  const hasToppings = product.toppings && product.toppings.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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

      {/* Thông báo lỗi khi thêm vào giỏ hàng thất bại */}
      {cartError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium text-center">
          {cartError}
        </div>
      )}

      {/* Bố cục 2 cột trên máy tính, 1 cột trên điện thoại */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 bg-white p-4 sm:p-6 lg:p-8 rounded-2xl border border-gray-100 shadow-xs">
        {/* CỘT TRÁI: Ảnh món và thông tin cơ bản */}
        <div className="md:col-span-5 md:sticky md:top-24 self-start">
          <div className="relative w-full h-64 sm:h-80 md:h-72 lg:h-80 bg-gray-100 rounded-2xl overflow-hidden shadow-inner">
            <img
              src={product.imageUrl}
              alt={product.name}
              className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale opacity-60' : ''}`}
            />
            {/* Nhãn hết hàng (stock = 0) */}
            {isOutOfStock && (
              <span className="absolute top-3 right-3 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-md font-bold shadow">
                Hết hàng
              </span>
            )}
            <span className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md">
              {CATEGORY_LABELS[product.category] || product.category}
            </span>
          </div>

          <div className="mt-4 space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{product.name}</h1>
            <p className="text-amber-600 font-extrabold text-lg sm:text-xl">
              {product.basePrice.toLocaleString('vi-VN')} đ{' '}
              <span className="text-xs font-normal text-gray-400">(giá gốc)</span>
            </p>
            {isOutOfStock && (
              <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">
                Món này hiện đang tạm hết nguyên liệu, chưa thể đặt thêm vào giỏ hàng.
              </p>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: Các tùy chọn món (render động từ server, ẩn mục rỗng) */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-5">
          {/* 1. Chọn Size (ẩn nếu mảng rỗng) */}
          {hasSizes && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Chọn kích cỡ (Size) <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {product.sizes.map((size) => (
                  <button
                    key={size.value}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => setSelectedSize(size.value)}
                    className={`py-2.5 px-3 rounded-xl border text-center transition ${
                      selectedSize === size.value
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold shadow-xs'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="text-xs sm:text-sm">{size.label}</div>
                    <div className="text-xs text-amber-700 font-semibold mt-0.5">
                      {size.extraPrice > 0 ? `+${size.extraPrice.toLocaleString('vi-VN')} đ` : 'Gốc'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Chọn Đá (ẩn nếu mảng rỗng) */}
          {hasIceLevels && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Lượng đá
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {product.iceLevels.map((ice) => (
                  <button
                    key={ice.value}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => setSelectedIce(ice.value)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition ${
                      selectedIce === ice.value
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {ice.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Chọn Đường (ẩn nếu mảng rỗng) */}
          {hasSugarLevels && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Lượng đường
              </label>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {product.sugarLevels.map((sugar) => (
                  <button
                    key={sugar.value}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => setSelectedSugar(sugar.value)}
                    className={`py-2 px-1 rounded-xl border text-xs font-medium text-center transition ${
                      selectedSugar === sugar.value
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {sugar.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Chọn Topping (ẩn nếu mảng rỗng) */}
          {hasToppings && (
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
                <p className="text-xs text-red-600 mb-2 font-medium">{toppingWarning}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.toppings.map((topping) => {
                  const isChecked = selectedToppings.some((t) => t.id === topping.id);
                  return (
                    <div
                      key={topping.id}
                      onClick={() => !isOutOfStock && toggleTopping(topping)}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border cursor-pointer transition ${
                        isChecked
                          ? 'border-amber-600 bg-amber-50/50'
                          : 'border-gray-200 hover:bg-gray-50'
                      } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isOutOfStock}
                          onChange={() => {}}
                          className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 pointer-events-none shrink-0"
                        />
                        <span className="text-xs font-medium text-gray-800 truncate">{topping.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-amber-700 shrink-0 ml-2">
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
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              disabled={isOutOfStock}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: ít ngọt, pha đậm vị trà..."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          {/* 6. Số lượng và Giá tạm tính */}
          <div className="pt-4 border-t border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Số lượng</span>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  disabled={isOutOfStock || quantity <= MIN_QUANTITY}
                  onClick={handleDecreaseQuantity}
                  className="w-9 h-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                >
                  -
                </button>
                <span className="w-11 text-center text-sm font-bold text-gray-800">{quantity}</span>
                <button
                  type="button"
                  disabled={isOutOfStock || quantity >= MAX_QUANTITY}
                  onClick={handleIncreaseQuantity}
                  className="w-9 h-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {quantityWarning && (
              <p className="text-xs text-red-600 font-medium">{quantityWarning}</p>
            )}

            {/* Hiển thị giá tạm tính */}
            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-100">
              <div className="flex justify-between items-baseline">
                <span className="text-xs sm:text-sm text-amber-900 font-semibold">Tạm tính:</span>
                <span className="text-xl font-black text-amber-600">
                  {estimatedPrice.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                * Giá chính thức do máy chủ tính toán khi tạo đơn hàng.
              </p>
            </div>

            {/* Nút Thêm vào giỏ (khóa nút khi stock <= 0) */}
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={handleAddToCart}
              className={`w-full py-3.5 rounded-xl text-sm font-bold transition shadow-sm ${
                !isOutOfStock
                  ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-98 cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {!isOutOfStock
                ? `+ Thêm vào giỏ (${estimatedPrice.toLocaleString('vi-VN')} đ)`
                : 'Món tạm hết hàng'}
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
        <div className="max-w-md mx-auto py-16 text-center text-gray-500 text-sm">
          <div className="animate-spin inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mb-3" />
          <p>Đang tải chi tiết món...</p>
        </div>
      }
    >
      <ProductDetailContent />
    </Suspense>
  );
}
