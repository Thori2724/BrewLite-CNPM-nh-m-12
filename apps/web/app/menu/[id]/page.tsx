'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
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
import { formatVnd } from '../../../utils/validation';
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
  const [isToastFading, setIsToastFading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [toppingWarning, setToppingWarning] = useState<string | null>(null);
  const [quantityWarning, setQuantityWarning] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dọn bộ đếm giờ khi component unmount / người dùng rời trang
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

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
  const isCake = product?.category === 'CAKE';
  const currentSizeOption = !isCake ? product?.sizes?.find((s) => s.value === selectedSize) : undefined;
  const sizeExtraPrice = currentSizeOption ? currentSizeOption.extraPrice : 0;
  const activeToppings = !isCake && product?.toppings && product.toppings.length > 0 ? selectedToppings : [];

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
      size: !isCake && product.sizes && product.sizes.length > 0 ? selectedSize : undefined,
      sugarLevel: !isCake && product.sugarLevels && product.sugarLevels.length > 0 ? selectedSugar : undefined,
      iceLevel: !isCake && product.iceLevels && product.iceLevels.length > 0 ? selectedIce : undefined,
      toppings: activeToppings,
      note: note.trim(),
      unitPrice,
      quantity,
    });

    if (!result.ok) {
      setCartError(result.error || 'Không thể thêm vào giỏ hàng.');
      return;
    }

    // Đặt lại bộ đếm thời gian nếu người dùng bấm thêm nhiều lần liên tiếp
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    setIsToastFading(false);
    setAddedSuccess(true);

    fadeTimerRef.current = setTimeout(() => {
      setIsToastFading(true);
    }, 5600);

    toastTimerRef.current = setTimeout(() => {
      setAddedSuccess(false);
      setIsToastFading(false);
    }, 6000);
  };

  // 1. Trạng thái Loading
  if (loading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-noir/70 text-sm">
        <div className="animate-spin inline-block w-8 h-8 border-3 border-kombu border-t-transparent rounded-full mb-3" />
        <p>Đang tải chi tiết món...</p>
      </div>
    );
  }

  // 2. Trạng thái Lỗi API
  if (error) {
    return (
      <div className="max-w-md mx-auto bg-cream border border-error/40 rounded-card p-6 sm:p-8 shadow-soft text-center space-y-4 my-6">
        <div className="bg-cream border border-error/30 text-error p-4 rounded-control text-sm">
          {error}
        </div>
        <div>
          <button
            type="button"
            onClick={handleRetry}
            className="px-5 py-2.5 bg-kombu text-bone rounded-control text-sm font-semibold hover:bg-noir transition cursor-pointer"
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
      <div className="max-w-md mx-auto bg-cream border border-tan/60 rounded-card py-12 px-6 text-center text-noir shadow-soft my-6">
        <span className="text-4xl block mb-3">🍽️</span>
        <h2 className="text-lg font-display font-bold text-noir mb-1">Không tìm thấy món ăn hoặc đồ uống này</h2>
        <p className="text-sm mb-6 text-noir/60">Có thể món này đã bị xóa hoặc đường dẫn không chính xác.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-kombu text-bone text-sm font-semibold rounded-control hover:bg-noir transition shadow-soft"
        >
          Quay lại Menu
        </Link>
      </div>
    );
  }

  const hasSizes = !isCake && Boolean(product.sizes && product.sizes.length > 0);
  const hasIceLevels = !isCake && Boolean(product.iceLevels && product.iceLevels.length > 0);
  const hasSugarLevels = !isCake && Boolean(product.sugarLevels && product.sugarLevels.length > 0);
  const hasToppings = !isCake && Boolean(product.toppings && product.toppings.length > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Nút quay lại Menu */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-noir/70 hover:text-kombu transition"
        >
          <span className="mr-1.5">←</span> Quay lại Menu
        </Link>
      </div>

      {/* Popup thông báo thêm vào giỏ thành công (nổi góc phải, thẳng hàng dưới biểu tượng giỏ) */}
      {addedSuccess && (
        <div className="fixed top-[92px] inset-x-0 z-50 pointer-events-none">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end">
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-auto max-w-[calc(100vw-2rem)] sm:max-w-sm bg-cream border border-moss text-kombu px-4 py-3 rounded-control text-sm font-semibold shadow-raised flex items-center gap-2 transition-all duration-400 ease-out ${
                isToastFading ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
              }`}
            >
              ✓ Đã thêm vào giỏ hàng!
            </div>
          </div>
        </div>
      )}

      {/* Thông báo lỗi khi thêm vào giỏ hàng thất bại */}
      {cartError && (
        <div className="bg-cream border border-error/40 text-error px-4 py-3 rounded-control text-sm font-medium text-center shadow-soft">
          {cartError}
        </div>
      )}

      {/* Bố cục 2 cột trên máy tính, 1 cột trên điện thoại */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 bg-cream p-4 sm:p-6 lg:p-8 rounded-card border border-tan/60 shadow-soft">
        {/* CỘT TRÁI: Ảnh món và thông tin cơ bản */}
        <div className="md:col-span-5 md:sticky md:top-24 self-start">
          <div className="relative w-full h-64 sm:h-80 md:h-72 lg:h-80 bg-bone rounded-card overflow-hidden shadow-inner border border-tan/40">
            <img
              src={product.imageUrl}
              alt={product.name}
              className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale opacity-60' : ''}`}
            />
            {/* Nhãn hết hàng (stock = 0) */}
            {isOutOfStock && (
              <span className="absolute top-3 right-3 bg-error text-bone text-xs px-3 py-1.5 rounded-control font-bold shadow-xs">
                Hết hàng
              </span>
            )}
            <span className="absolute bottom-3 left-3 bg-kombu/85 text-bone text-xs px-2.5 py-1 rounded-control font-semibold backdrop-blur-xs">
              {CATEGORY_LABELS[product.category] || product.category}
            </span>
          </div>

          <div className="mt-4 space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-noir break-words">{product.name}</h1>
            <p className="text-kombu font-bold text-lg sm:text-xl">
              {formatVnd(product.basePrice)}{' '}
              <span className="text-xs font-normal text-noir/50">(giá gốc)</span>
            </p>
            {isOutOfStock && (
              <p className="text-xs text-error font-medium bg-cream border border-error/30 rounded-control px-3 py-2 mt-2">
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
              <span className="block text-sm font-bold text-noir mb-2">
                Chọn kích cỡ (Size) <span className="text-error">*</span>
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {product.sizes.map((size) => {
                  const isSelected = selectedSize === size.value;
                  return (
                    <button
                      key={size.value}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isOutOfStock}
                      onClick={() => setSelectedSize(size.value)}
                      className={`py-2.5 px-2 sm:px-3 rounded-control border text-center transition ${
                        isSelected
                          ? 'border-kombu bg-kombu text-bone font-bold shadow-xs'
                          : 'border-tan bg-cream text-noir hover:bg-tan/30'
                      } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="text-xs sm:text-sm">{size.label}</div>
                      <div
                        className={`text-xs font-semibold mt-0.5 ${
                          isSelected ? 'text-tan' : 'text-kombu'
                        }`}
                      >
                        {size.extraPrice > 0 ? `+${formatVnd(size.extraPrice)}` : 'Gốc'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Chọn Đá (ẩn nếu mảng rỗng) */}
          {hasIceLevels && (
            <div>
              <span className="block text-sm font-bold text-noir mb-2">
                Lượng đá
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {product.iceLevels.map((ice) => {
                  const isSelected = selectedIce === ice.value;
                  return (
                    <button
                      key={ice.value}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isOutOfStock}
                      onClick={() => setSelectedIce(ice.value)}
                      className={`py-2 px-2.5 rounded-control border text-xs font-medium text-center transition ${
                        isSelected
                          ? 'border-kombu bg-kombu text-bone font-bold shadow-xs'
                          : 'border-tan bg-cream text-noir hover:bg-tan/30'
                      } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {ice.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Chọn Đường (ẩn nếu mảng rỗng) */}
          {hasSugarLevels && (
            <div>
              <span className="block text-sm font-bold text-noir mb-2">
                Lượng đường
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
                {product.sugarLevels.map((sugar) => {
                  const isSelected = selectedSugar === sugar.value;
                  return (
                    <button
                      key={sugar.value}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isOutOfStock}
                      onClick={() => setSelectedSugar(sugar.value)}
                      className={`py-2 px-1 rounded-control border text-xs font-medium text-center transition ${
                        isSelected
                          ? 'border-kombu bg-kombu text-bone font-bold shadow-xs'
                          : 'border-tan bg-cream text-noir hover:bg-tan/30'
                      } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {sugar.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Chọn Topping (ẩn nếu mảng rỗng) */}
          {hasToppings && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-noir">
                  Topping thêm <span className="text-xs font-normal text-noir/60">(Tối đa {MAX_TOPPINGS})</span>
                </span>
                <span className="text-xs text-noir/60">
                  Đã chọn {selectedToppings.length}/{MAX_TOPPINGS}
                </span>
              </div>

              {toppingWarning && (
                <p className="text-xs text-error mb-2 font-medium">{toppingWarning}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.toppings.map((topping) => {
                  const isChecked = selectedToppings.some((t) => t.id === topping.id);
                  return (
                    <div
                      key={topping.id}
                      onClick={() => !isOutOfStock && toggleTopping(topping)}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-control border cursor-pointer transition ${
                        isChecked
                          ? 'border-kombu bg-tan/30 shadow-xs'
                          : 'border-tan bg-cream hover:bg-tan/20'
                      } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isOutOfStock}
                          onChange={() => {}}
                          aria-label={topping.name}
                          className="w-4 h-4 accent-kombu rounded border-tan focus:ring-moss pointer-events-none shrink-0"
                        />
                        <span className="text-xs font-semibold text-noir break-words">{topping.name}</span>
                      </div>
                      <span className="text-xs font-bold text-kombu shrink-0 ml-2">
                        +{formatVnd(topping.price)}
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
              <label htmlFor="item-note" className="text-sm font-bold text-noir">
                Ghi chú cho quán
              </label>
              <span className="text-xs text-noir/50">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>
            <textarea
              id="item-note"
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              disabled={isOutOfStock}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: ít ngọt, pha đậm vị trà..."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-cream border border-tan rounded-control text-noir placeholder:text-noir/40 focus:outline-none focus:border-moss focus:ring-2 focus:ring-moss/30 disabled:bg-bone disabled:text-noir/40"
            />
          </div>

          {/* 6. Số lượng và Giá tạm tính */}
          <div className="pt-4 border-t border-tan/40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-noir">Số lượng</span>
              <div className="flex items-center border border-tan rounded-control overflow-hidden bg-cream">
                <button
                  type="button"
                  disabled={isOutOfStock || quantity <= MIN_QUANTITY}
                  onClick={handleDecreaseQuantity}
                  className="w-9 h-9 flex items-center justify-center bg-bone hover:bg-tan/40 text-noir disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer transition"
                >
                  -
                </button>
                <span className="w-11 text-center text-sm font-bold text-noir">{quantity}</span>
                <button
                  type="button"
                  disabled={isOutOfStock || quantity >= MAX_QUANTITY}
                  onClick={handleIncreaseQuantity}
                  className="w-9 h-9 flex items-center justify-center bg-bone hover:bg-tan/40 text-noir disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer transition"
                >
                  +
                </button>
              </div>
            </div>

            {quantityWarning && (
              <p className="text-xs text-error font-medium">{quantityWarning}</p>
            )}

            {/* Hiển thị giá tạm tính */}
            <div className="bg-tan/30 p-4 rounded-control border border-tan/60">
              <div className="flex justify-between items-baseline">
                <span className="text-xs sm:text-sm text-noir font-bold">Tạm tính:</span>
                <span className="text-xl sm:text-2xl font-bold text-kombu">
                  {formatVnd(estimatedPrice)}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-noir/60 mt-1">
                * Giá chính thức do máy chủ tính toán khi tạo đơn hàng.
              </p>
            </div>

            {/* Nút Thêm vào giỏ (khóa nút khi stock <= 0) */}
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={handleAddToCart}
              className={`w-full py-3.5 rounded-control text-sm font-bold transition shadow-soft ${
                !isOutOfStock
                  ? 'bg-kombu text-bone hover:bg-noir active:scale-98 cursor-pointer'
                  : 'bg-tan/40 text-noir/40 cursor-not-allowed'
              }`}
            >
              {!isOutOfStock
                ? `+ Thêm vào giỏ (${formatVnd(estimatedPrice)})`
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
        <div className="max-w-md mx-auto py-16 text-center text-noir/70 text-sm">
          <div className="animate-spin inline-block w-8 h-8 border-3 border-kombu border-t-transparent rounded-full mb-3" />
          <p>Đang tải chi tiết món...</p>
        </div>
      }
    >
      <ProductDetailContent />
    </Suspense>
  );
}
