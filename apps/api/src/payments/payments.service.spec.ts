import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { Response } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  SIMULATED_FAILURE_REASON,
  simulatePaymentGateway,
} from './payment-gateway';
import { PaymentsController } from './payments.controller';
import {
  IDEMPOTENCY_KEY_CONFLICT_MESSAGE,
  IDEMPOTENCY_KEY_INVALID_MESSAGE,
  IS_IDEMPOTENT_REPLAY,
  ORDER_NOT_FOUND_MESSAGE,
  ORDER_NOT_PAYABLE_MESSAGE,
  PaymentsService,
} from './payments.service';

describe('Payments (PaymentsService, PaymentsController, CreatePaymentDto, Gateway)', () => {
  let service: PaymentsService;
  let controller: PaymentsController;
  let txMock: {
    order: {
      updateMany: jest.Mock;
    };
    payment: {
      create: jest.Mock;
    };
    product: {
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let prisma: {
    order: {
      findUnique: jest.Mock;
    };
    payment: {
      findUnique: jest.Mock;
    };
    product: {
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const USER_ID = '99999999-0000-0000-0000-000000000001';
  const OTHER_USER_ID = '99999999-0000-0000-0000-000000000002';
  const ORDER_ID = '33333333-0000-0000-0000-000000000001';
  const OTHER_ORDER_ID = '33333333-0000-0000-0000-000000000002';
  const VALID_KEY = 'idem-order-1001-attempt-1';
  const CREATED_AT = new Date('2026-11-05T03:02:00.000Z');

  const mockPendingOrder = {
    id: ORDER_ID,
    orderNumber: 1001,
    userId: USER_ID,
    status: OrderStatus.PENDING,
    totalAmount: 136000,
  };

  beforeEach(async () => {
    let paymentCounter = 0;

    txMock = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            paymentCounter += 1;
            return Promise.resolve({
              id: `44444444-0000-0000-0000-00000000000${paymentCounter}`,
              orderId: data.orderId,
              userId: data.userId,
              idempotencyKey: data.idempotencyKey,
              method: data.method,
              accountLast4: data.accountLast4,
              amount: data.amount,
              status: data.status,
              failureReason: data.failureReason ?? null,
              createdAt: CREATED_AT,
            });
          }),
      },
      product: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(mockPendingOrder),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      product: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) =>
          cb(txMock),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    service = module.get<PaymentsService>(PaymentsService);
    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe('1. Hàm cổng thanh toán mô phỏng (simulatePaymentGateway)', () => {
    it('trả FAILED kèm failureReason khi số tài khoản kết thúc bằng "0000" và SUCCESS cho các số khác', () => {
      expect(simulatePaymentGateway('1234560000')).toEqual({
        status: PaymentStatus.FAILED,
        accountLast4: '0000',
        failureReason: SIMULATED_FAILURE_REASON,
      });

      expect(simulatePaymentGateway('0987654321')).toEqual({
        status: PaymentStatus.SUCCESS,
        accountLast4: '4321',
        failureReason: null,
      });
    });
  });

  describe('2. DTO và Header Idempotency-Key', () => {
    const validDto: CreatePaymentDto = {
      orderId: ORDER_ID,
      method: PaymentMethod.WALLET,
      accountNumber: '0987654321',
    };

    it('ném 400 mảng chuỗi tiếng Anh khi thiếu Idempotency-Key, hoặc độ dài 7 hay 101 ký tự', async () => {
      for (const badKey of [undefined, '1234567', 'k'.repeat(101)]) {
        let caught: unknown;
        try {
          await service.create(USER_ID, badKey, validDto);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(BadRequestException);
        const res = (caught as BadRequestException).getResponse() as {
          statusCode: number;
          message: string[];
        };
        expect(res.statusCode).toBe(400);
        expect(res.message).toEqual([IDEMPOTENCY_KEY_INVALID_MESSAGE]);
      }
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('từ chối khi method sai, accountNumber có chữ cái, ngắn hơn 8 hoặc dài hơn 19 ký tự, hoặc orderId không phải UUID', async () => {
      const invalidMethodErrors = await validate(
        plainToInstance(CreatePaymentDto, {
          ...validDto,
          method: 'CASH',
        }),
      );
      expect(invalidMethodErrors.some((e) => e.property === 'method')).toBe(
        true,
      );

      for (const badAccount of ['1234abcd', '1234567', '1'.repeat(20)]) {
        const accountErrors = await validate(
          plainToInstance(CreatePaymentDto, {
            ...validDto,
            accountNumber: badAccount,
          }),
        );
        expect(accountErrors.some((e) => e.property === 'accountNumber')).toBe(
          true,
        );
      }

      const badOrderIdErrors = await validate(
        plainToInstance(CreatePaymentDto, {
          ...validDto,
          orderId: 'not-a-uuid',
        }),
      );
      expect(badOrderIdErrors.some((e) => e.property === 'orderId')).toBe(true);
    });
  });

  describe('3. Thanh toán thành công (SUCCESS)', () => {
    it('tạo Payment SUCCESS với đúng amount từ đơn (bỏ qua amount từ client), chuyển đơn sang PAID và chỉ lưu 4 số cuối', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      });

      const dto = (await pipe.transform(
        {
          orderId: ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
          amount: 1,
        },
        { type: 'body', metatype: CreatePaymentDto },
      )) as CreatePaymentDto;

      const result = await service.create(USER_ID, VALID_KEY, dto);

      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          userId: USER_ID,
          status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        },
        data: { status: OrderStatus.PAID },
      });

      expect(txMock.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: ORDER_ID,
          userId: USER_ID,
          idempotencyKey: VALID_KEY,
          method: PaymentMethod.WALLET,
          accountLast4: '4321',
          amount: 136000,
          status: PaymentStatus.SUCCESS,
          failureReason: null,
        },
      });

      expect(result).toEqual({
        id: '44444444-0000-0000-0000-000000000001',
        orderId: ORDER_ID,
        method: PaymentMethod.WALLET,
        accountLast4: '4321',
        amount: 136000,
        status: PaymentStatus.SUCCESS,
        createdAt: CREATED_AT,
        order: {
          id: ORDER_ID,
          orderNumber: 1001,
          status: OrderStatus.PAID,
        },
      });
      expect(result[IS_IDEMPOTENT_REPLAY]).toBe(false);
      expect(result).not.toHaveProperty('failureReason');
    });
  });

  describe('4. Thanh toán thất bại (FAILED)', () => {
    it('chuyển đơn sang PAYMENT_FAILED, trả về failureReason và tuyệt đối không hoàn lại tồn kho', async () => {
      const result = await service.create(USER_ID, VALID_KEY, {
        orderId: ORDER_ID,
        method: PaymentMethod.WALLET,
        accountNumber: '1234560000',
      });

      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          userId: USER_ID,
          status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });

      expect(result).toEqual({
        id: '44444444-0000-0000-0000-000000000001',
        orderId: ORDER_ID,
        method: PaymentMethod.WALLET,
        accountLast4: '0000',
        amount: 136000,
        status: PaymentStatus.FAILED,
        failureReason: SIMULATED_FAILURE_REASON,
        createdAt: CREATED_AT,
        order: {
          id: ORDER_ID,
          orderNumber: 1001,
          status: OrderStatus.PAYMENT_FAILED,
        },
      });
      expect(result[IS_IDEMPOTENT_REPLAY]).toBe(false);
      expect(txMock.product.update).not.toHaveBeenCalled();
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('5. Thử lại thanh toán trên đơn đang PAYMENT_FAILED', () => {
    beforeEach(() => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockPendingOrder,
        status: OrderStatus.PAYMENT_FAILED,
      });
    });

    it('thành công (201 SUCCESS) và chuyển đơn sang PAID khi thử lại với key mới và số tài khoản hợp lệ', async () => {
      const result = await service.create(
        USER_ID,
        'idem-order-1001-attempt-2',
        {
          orderId: ORDER_ID,
          method: PaymentMethod.CARD,
          accountNumber: '0987654321',
        },
      );

      expect(result.status).toBe(PaymentStatus.SUCCESS);
      expect(result.order.status).toBe(OrderStatus.PAID);
      expect(result[IS_IDEMPOTENT_REPLAY]).toBe(false);
    });

    it('chống tái phát: đơn PAYMENT_FAILED thanh toán tiếp với key mới và số kết thúc 0000 vẫn trả 201 FAILED, đơn giữ PAYMENT_FAILED (không bị 409)', async () => {
      const statusMock = jest.fn().mockReturnThis();
      const resMock = {
        status: statusMock,
      } as unknown as Response;
      const reqMock = {
        user: { id: USER_ID },
      } as unknown as AuthenticatedRequest;

      const result = await controller.create(
        reqMock,
        'idem-order-1001-attempt-3',
        {
          orderId: ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '1234560000',
        },
        resMock,
      );

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.failureReason).toBe(SIMULATED_FAILURE_REASON);
      expect(result.order.status).toBe(OrderStatus.PAYMENT_FAILED);
      expect(result[IS_IDEMPOTENT_REPLAY]).toBe(false);
    });
  });

  describe('6. Idempotency-Key (Gửi lại cùng khóa hoặc khác đơn)', () => {
    it('trả kết quả cũ (HTTP 200) và không tạo Payment mới khi gửi lại cùng key và cùng orderId (kể cả khi đơn đã PAID)', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: '44444444-0000-0000-0000-000000000001',
        orderId: ORDER_ID,
        userId: USER_ID,
        idempotencyKey: VALID_KEY,
        method: PaymentMethod.WALLET,
        accountLast4: '4321',
        amount: 136000,
        status: PaymentStatus.SUCCESS,
        failureReason: null,
        createdAt: CREATED_AT,
        order: {
          id: ORDER_ID,
          orderNumber: 1001,
          status: OrderStatus.PAID,
        },
      });

      const statusMock = jest.fn().mockReturnThis();
      const resMock = {
        status: statusMock,
      } as unknown as Response;
      const reqMock = {
        user: { id: USER_ID },
      } as unknown as AuthenticatedRequest;

      const result = await controller.create(
        reqMock,
        VALID_KEY,
        {
          orderId: ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
        },
        resMock,
      );

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result[IS_IDEMPOTENT_REPLAY]).toBe(true);
      expect(result.id).toBe('44444444-0000-0000-0000-000000000001');
      expect(result.order.status).toBe(OrderStatus.PAID);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ném 409 khi dùng lại cùng Idempotency-Key cho một orderId khác', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: '44444444-0000-0000-0000-000000000001',
        orderId: ORDER_ID,
        userId: USER_ID,
        idempotencyKey: VALID_KEY,
        method: PaymentMethod.WALLET,
        accountLast4: '4321',
        amount: 136000,
        status: PaymentStatus.SUCCESS,
        failureReason: null,
        createdAt: CREATED_AT,
        order: {
          id: ORDER_ID,
          orderNumber: 1001,
          status: OrderStatus.PAID,
        },
      });

      await expect(
        service.create(USER_ID, VALID_KEY, {
          orderId: OTHER_ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
        }),
      ).rejects.toThrow(
        new ConflictException(IDEMPOTENCY_KEY_CONFLICT_MESSAGE),
      );
    });
  });

  describe('7. Kiểm tra quyền sở hữu (404) và trạng thái đơn không hợp lệ (409)', () => {
    it('ném 404 khi đơn không tồn tại hoặc thuộc về user khác', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(USER_ID, VALID_KEY, {
          orderId: ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
        }),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));

      prisma.order.findUnique.mockResolvedValueOnce({
        ...mockPendingOrder,
        userId: OTHER_USER_ID,
      });

      await expect(
        service.create(USER_ID, VALID_KEY, {
          orderId: ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
        }),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));
    });

    it('ném 409 với ORDER_NOT_PAYABLE_MESSAGE khi đơn đang ở trạng thái PAID, PREPARING hoặc CANCELLED', async () => {
      for (const nonPayableStatus of [
        OrderStatus.PAID,
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
      ]) {
        prisma.order.findUnique.mockResolvedValueOnce({
          ...mockPendingOrder,
          status: nonPayableStatus,
        });

        await expect(
          service.create(USER_ID, VALID_KEY, {
            orderId: ORDER_ID,
            method: PaymentMethod.WALLET,
            accountNumber: '0987654321',
          }),
        ).rejects.toThrow(new ConflictException(ORDER_NOT_PAYABLE_MESSAGE));
      }

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('8. Tối đa một payment SUCCESS khi có tranh chấp đồng thời', () => {
    it('ném 409 với ORDER_NOT_PAYABLE_MESSAGE và không tạo payment khi updateMany trả count = 0', async () => {
      txMock.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.create(USER_ID, VALID_KEY, {
          orderId: ORDER_ID,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
        }),
      ).rejects.toThrow(new ConflictException(ORDER_NOT_PAYABLE_MESSAGE));

      expect(txMock.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('9. Bảo mật số tài khoản (chỉ lưu 4 số cuối, không ghi log)', () => {
    it('dữ liệu lưu DB, phản hồi trả về, message lỗi DTO và mọi lời gọi logger không bao giờ chứa số tài khoản đầy đủ', async () => {
      const fullSuccessAccount = '9876543210123456';
      const fullInvalidAccount = '9876543210ABCDEF';

      const logSpies = [
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'debug')
          .mockImplementation(() => undefined),
        jest.spyOn(console, 'log').mockImplementation(() => undefined),
        jest.spyOn(console, 'error').mockImplementation(() => undefined),
      ];

      try {
        const result = await service.create(USER_ID, VALID_KEY, {
          orderId: ORDER_ID,
          method: PaymentMethod.CARD,
          accountNumber: fullSuccessAccount,
        });

        const savedData = (
          txMock.payment.create.mock.calls as Array<
            [{ data: Record<string, unknown> }]
          >
        )[0][0].data;

        expect(savedData.accountLast4).toBe('3456');
        expect(savedData).not.toHaveProperty('accountNumber');
        expect(JSON.stringify(savedData)).not.toContain(fullSuccessAccount);
        expect(JSON.stringify(result)).not.toContain(fullSuccessAccount);
        expect(result.accountLast4).toBe('3456');

        const pipe = new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: false,
        });
        let dtoErr: unknown;
        try {
          await pipe.transform(
            {
              orderId: ORDER_ID,
              method: PaymentMethod.CARD,
              accountNumber: fullInvalidAccount,
            },
            { type: 'body', metatype: CreatePaymentDto },
          );
        } catch (err) {
          dtoErr = err;
        }
        expect(
          JSON.stringify((dtoErr as BadRequestException).getResponse()),
        ).not.toContain(fullInvalidAccount);

        for (const spy of logSpies) {
          for (const callArgs of spy.mock.calls) {
            const serialized = JSON.stringify(callArgs);
            expect(serialized).not.toContain(fullSuccessAccount);
            expect(serialized).not.toContain(fullInvalidAccount);
          }
        }
      } finally {
        for (const spy of logSpies) {
          spy.mockRestore();
        }
      }
    });
  });
});
