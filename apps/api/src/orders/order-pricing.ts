import { BadRequestException } from '@nestjs/common';
import { DRINK_SIZES } from '../products/products.constants';

export type OrderItemSize = 'S' | 'M' | 'L';

export interface OrderPricingItemInput {
  basePrice: number;
  quantity: number;
  size?: OrderItemSize | null;
  toppingPrices?: number[];
}

export interface OrderPricingLineResult {
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPricingResult {
  lines: OrderPricingLineResult[];
  totalAmount: number;
}

export function calculateOrderTotal(
  items: OrderPricingItemInput[],
): OrderPricingResult {
  const lines: OrderPricingLineResult[] = [];
  let totalAmount = 0;

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new BadRequestException('Số lượng món phải là số nguyên dương');
    }

    let sizeExtraPrice = 0;
    if (item.size) {
      const sizeOption = DRINK_SIZES.find((s) => s.value === item.size);
      if (!sizeOption) {
        throw new BadRequestException(`Kích cỡ không hợp lệ: ${item.size}`);
      }
      sizeExtraPrice = sizeOption.extraPrice;
    }

    const toppingsTotal = (item.toppingPrices ?? []).reduce(
      (sum, price) => sum + price,
      0,
    );

    const unitPrice = item.basePrice + sizeExtraPrice + toppingsTotal;
    const lineTotal = unitPrice * item.quantity;

    lines.push({ unitPrice, lineTotal });
    totalAmount += lineTotal;
  }

  return { lines, totalAmount };
}
