import { BadRequestException } from '@nestjs/common';
import { calculateOrderTotal } from './order-pricing';

describe('calculateOrderTotal (order-pricing)', () => {
  it('tính đúng ví dụ chuẩn trong hợp đồng (Trà sữa size M + 2 topping × 2 = 106.000; Bánh 30.000 × 1; tổng 136.000)', () => {
    const result = calculateOrderTotal([
      {
        basePrice: 35000,
        quantity: 2,
        size: 'M',
        toppingPrices: [5000, 7000],
      },
      {
        basePrice: 30000,
        quantity: 1,
      },
    ]);

    expect(result).toEqual({
      lines: [
        { unitPrice: 53000, lineTotal: 106000 },
        { unitPrice: 30000, lineTotal: 30000 },
      ],
      totalAmount: 136000,
    });
  });

  it('tính đúng phụ thu size L (+10.000), không có size (bánh) và không có topping', () => {
    const result = calculateOrderTotal([
      {
        basePrice: 29000,
        quantity: 1,
        size: 'L',
        toppingPrices: [],
      },
      {
        basePrice: 38000,
        quantity: 2,
        size: null,
      },
    ]);

    expect(result).toEqual({
      lines: [
        { unitPrice: 39000, lineTotal: 39000 },
        { unitPrice: 38000, lineTotal: 76000 },
      ],
      totalAmount: 115000,
    });
  });

  it('tính đúng nhiều dòng cùng một món nhưng khác size', () => {
    const result = calculateOrderTotal([
      {
        basePrice: 29000,
        quantity: 1,
        size: 'S',
        toppingPrices: [5000],
      },
      {
        basePrice: 29000,
        quantity: 3,
        size: 'L',
        toppingPrices: [5000],
      },
    ]);

    expect(result).toEqual({
      lines: [
        { unitPrice: 34000, lineTotal: 34000 },
        { unitPrice: 44000, lineTotal: 132000 },
      ],
      totalAmount: 166000,
    });
  });

  it('trả về totalAmount = 0 và lines rỗng khi danh sách món rỗng', () => {
    expect(calculateOrderTotal([])).toEqual({
      lines: [],
      totalAmount: 0,
    });
  });

  it('từ chối khi quantity <= 0 hoặc là số lẻ (không phải số nguyên dương)', () => {
    expect(() =>
      calculateOrderTotal([{ basePrice: 29000, quantity: 0, size: 'S' }]),
    ).toThrow(BadRequestException);

    expect(() =>
      calculateOrderTotal([{ basePrice: 29000, quantity: -2, size: 'S' }]),
    ).toThrow(BadRequestException);

    expect(() =>
      calculateOrderTotal([{ basePrice: 29000, quantity: 1.5, size: 'S' }]),
    ).toThrow(BadRequestException);
  });
});
