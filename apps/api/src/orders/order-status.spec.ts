import { ConflictException } from '@nestjs/common';
import { OrderStatus, validateTransition } from './order-status';

describe('validateTransition (order-status)', () => {
  const allStatuses = Object.values(OrderStatus);

  it('cho phép tất cả các chuyển đổi trạng thái hợp lệ theo bảng mục 4 hợp đồng', () => {
    const validPairs: Array<[OrderStatus, OrderStatus]> = [
      [OrderStatus.PENDING, OrderStatus.PAID],
      [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED],
      [OrderStatus.PAYMENT_FAILED, OrderStatus.PAID],
      [OrderStatus.PAYMENT_FAILED, OrderStatus.PAYMENT_FAILED],
      [OrderStatus.PAID, OrderStatus.PREPARING],
      [OrderStatus.PREPARING, OrderStatus.READY],
      [OrderStatus.READY, OrderStatus.COMPLETED],
      [OrderStatus.PENDING, OrderStatus.CANCELLED],
      [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
      [OrderStatus.PAID, OrderStatus.CANCELLED],
    ];

    for (const [from, to] of validPairs) {
      expect(() => validateTransition(from, to)).not.toThrow();
    }
  });

  it('từ chối các chuyển đổi sai tiêu biểu (PENDING→READY, PAID→PENDING, PAID→PAID) với ConflictException tiếng Việt', () => {
    const invalidSamples: Array<[OrderStatus, OrderStatus]> = [
      [OrderStatus.PENDING, OrderStatus.READY],
      [OrderStatus.PAID, OrderStatus.PENDING],
      [OrderStatus.PAID, OrderStatus.PAID],
      [OrderStatus.PENDING, OrderStatus.PENDING],
      [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.READY, OrderStatus.CANCELLED],
    ];

    for (const [from, to] of invalidSamples) {
      expect(() => validateTransition(from, to)).toThrow(
        new ConflictException(
          `Không thể chuyển đơn từ trạng thái ${from} sang ${to}`,
        ),
      );
    }
  });

  it('COMPLETED và CANCELLED là trạng thái kết thúc, từ chối chuyển sang mọi trạng thái', () => {
    const terminalStatuses = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

    for (const from of terminalStatuses) {
      for (const to of allStatuses) {
        expect(() => validateTransition(from, to)).toThrow(
          new ConflictException(
            `Không thể chuyển đơn từ trạng thái ${from} sang ${to}`,
          ),
        );
      }
    }
  });
});
