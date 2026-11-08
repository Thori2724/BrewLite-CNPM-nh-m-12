import { Category } from '@prisma/client';

export const ALLOWED_CATEGORIES: readonly Category[] = [
  Category.TEA,
  Category.COFFEE,
  Category.MILK_TEA,
  Category.CAKE,
];

export const INVALID_CATEGORY_MESSAGE =
  'Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE';

export const PRODUCT_NOT_FOUND_MESSAGE = 'Không tìm thấy sản phẩm';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DRINK_SIZES = [
  { value: 'S', label: 'Size S', extraPrice: 0 },
  { value: 'M', label: 'Size M', extraPrice: 6000 },
  { value: 'L', label: 'Size L', extraPrice: 10000 },
];

export const DRINK_SUGAR_LEVELS = [
  { value: 'P0', label: '0%' },
  { value: 'P30', label: '30%' },
  { value: 'P50', label: '50%' },
  { value: 'P70', label: '70%' },
  { value: 'P100', label: '100%' },
];

export const DRINK_ICE_LEVELS = [
  { value: 'NONE', label: 'Không đá' },
  { value: 'LOW', label: 'Ít đá' },
  { value: 'NORMAL', label: 'Đá vừa' },
  { value: 'FULL', label: 'Nhiều đá' },
];
