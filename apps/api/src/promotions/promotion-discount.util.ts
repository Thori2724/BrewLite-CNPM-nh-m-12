import { PromotionType } from '@prisma/client';

export function calculatePromotionDiscount(
  type: PromotionType,
  value: number,
  maxDiscount: number | null,
  subtotal: number,
): number {
  let raw: number;

  if (type === PromotionType.PERCENT) {
    raw = Math.floor((subtotal * value) / 100);
    if (maxDiscount !== null && maxDiscount !== undefined) {
      raw = Math.min(raw, Math.floor(maxDiscount));
    }
  } else {
    raw = Math.floor(value);
  }

  const maxAllowedDiscount = Math.floor(subtotal) - 1000;
  const discountAmount = Math.min(raw, maxAllowedDiscount);

  return Math.max(0, Math.trunc(discountAmount));
}
