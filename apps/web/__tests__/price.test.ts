import { describe, it, expect } from 'vitest';
import { calculatePrice } from '../utils/price';

describe('Hàm tính giá tạm tính (calculatePrice)', () => {
  const basePrice = 29000;

  it('1. Đổi size: tính đúng theo mức giá chênh lệch của từng size', () => {
    // Size S (chênh lệch 0đ)
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 0, toppings: [], quantity: 1 })
    ).toBe(29000);

    // Size M (chênh lệch +5.000đ)
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 5000, toppings: [], quantity: 1 })
    ).toBe(34000);

    // Size L (chênh lệch +10.000đ)
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 10000, toppings: [], quantity: 1 })
    ).toBe(39000);
  });

  it('2. Thêm và bỏ topping: cộng trừ đúng theo danh sách topping', () => {
    const topping1 = { price: 5000 };
    const topping2 = { price: 7000 };

    // 1 topping
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 0, toppings: [topping1], quantity: 1 })
    ).toBe(34000);

    // 2 toppings
    expect(
      calculatePrice({
        basePrice,
        sizePriceDiff: 0,
        toppings: [topping1, topping2],
        quantity: 1,
      })
    ).toBe(41000);

    // Bỏ hết topping (danh sách rỗng)
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 0, toppings: [], quantity: 1 })
    ).toBe(29000);
  });

  it('3. Đổi số lượng: nhân đúng tổng đơn giá với số lượng, tối thiểu là 1', () => {
    // Số lượng = 2
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 0, toppings: [], quantity: 2 })
    ).toBe(58000);

    // Số lượng = 3
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 0, toppings: [], quantity: 3 })
    ).toBe(87000);

    // Số lượng nhỏ hơn 1 được đưa về tối thiểu 1
    expect(
      calculatePrice({ basePrice, sizePriceDiff: 0, toppings: [], quantity: 0 })
    ).toBe(29000);
  });

  it('4. Phối hợp nhiều topping + đổi size + số lượng > 1', () => {
    // basePrice (29.000) + size M (5.000) + trân châu (5.000) + cheese (10.000) = 49.000
    // 49.000 x 2 = 98.000đ
    const total = calculatePrice({
      basePrice: 29000,
      sizePriceDiff: 5000,
      toppings: [{ price: 5000 }, { price: 10000 }],
      quantity: 2,
    });
    expect(total).toBe(98000);
  });
});

