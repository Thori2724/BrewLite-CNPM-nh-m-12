export interface PriceCalculationParams {
  basePrice: number;
  sizePriceDiff?: number;
  sizeExtraPrice?: number;
  toppings: { price: number }[];
  quantity: number;
}

/**
 * Tính giá tạm tính phía client:
 * Giá tạm tính = (giá gốc + phụ thu size + tổng giá topping) x số lượng
 * Lưu ý: Tiền thật do server tính khi đặt đơn (không bao giờ tin giá từ client).
 */
export function calculatePrice({
  basePrice,
  sizePriceDiff,
  sizeExtraPrice,
  toppings,
  quantity,
}: PriceCalculationParams): number {
  const extra = sizeExtraPrice !== undefined ? sizeExtraPrice : sizePriceDiff ?? 0;
  const safeQuantity = Math.max(1, Math.floor(quantity || 1));
  const toppingTotal = (toppings || []).reduce((sum, item) => sum + (item.price || 0), 0);
  const unitPrice = Math.max(0, basePrice + extra + toppingTotal);
  return unitPrice * safeQuantity;
}
