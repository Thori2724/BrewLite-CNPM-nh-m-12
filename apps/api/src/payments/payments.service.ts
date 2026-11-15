import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  OrderStatus as OrderStateMachineStatus,
  validateTransition,
} from '../orders/order-status';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  SIMULATED_FAILURE_REASON,
  simulatePaymentGateway,
} from './payment-gateway';

export const IDEMPOTENCY_KEY_INVALID_MESSAGE =
  'Idempotency-Key must be a string between 8 and 100 characters';
export const IDEMPOTENCY_KEY_CONFLICT_MESSAGE =
  'Khóa Idempotency-Key đã được sử dụng cho một đơn hàng khác';
export const ORDER_NOT_FOUND_MESSAGE = 'Không tìm thấy đơn hàng';
export const ORDER_NOT_PAYABLE_MESSAGE =
  'Đơn hàng này đã được xử lý xong, không thể thao tác lại.';

export const IS_IDEMPOTENT_REPLAY = Symbol('IS_IDEMPOTENT_REPLAY');

export interface PaymentResponseBody {
  id: string;
  orderId: string;
  method: PaymentMethod;
  accountLast4: string;
  amount: number;
  status: PaymentStatus;
  failureReason?: string;
  createdAt: Date;
  order: {
    id: string;
    orderNumber: number;
    status: OrderStatus;
  };
  [IS_IDEMPOTENT_REPLAY]?: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    idempotencyKey: string | string[] | undefined,
    dto: CreatePaymentDto,
  ): Promise<PaymentResponseBody> {
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length < 8 ||
      idempotencyKey.length > 100
    ) {
      throw new BadRequestException([IDEMPOTENCY_KEY_INVALID_MESSAGE]);
    }

    const existingPayment = await this.findExistingPayment(
      userId,
      idempotencyKey,
    );
    if (existingPayment) {
      if (existingPayment.orderId !== dto.orderId) {
        throw new ConflictException(IDEMPOTENCY_KEY_CONFLICT_MESSAGE);
      }
      return this.formatPaymentResponse(
        existingPayment,
        existingPayment.order.orderNumber,
        true,
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        status: true,
        totalAmount: true,
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PAYMENT_FAILED
    ) {
      throw new ConflictException(ORDER_NOT_PAYABLE_MESSAGE);
    }

    const gatewayResult = simulatePaymentGateway(dto.accountNumber);
    const nextOrderStatus =
      gatewayResult.status === PaymentStatus.SUCCESS
        ? OrderStatus.PAID
        : OrderStatus.PAYMENT_FAILED;

    if (nextOrderStatus !== order.status) {
      try {
        validateTransition(
          order.status as unknown as OrderStateMachineStatus,
          nextOrderStatus as unknown as OrderStateMachineStatus,
        );
      } catch {
        throw new ConflictException(ORDER_NOT_PAYABLE_MESSAGE);
      }
    }

    try {
      const createdPayment = await this.prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.updateMany({
          where: {
            id: order.id,
            userId,
            status: {
              in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED],
            },
          },
          data: {
            status: nextOrderStatus,
          },
        });

        if (updatedOrder.count === 0) {
          throw new ConflictException(ORDER_NOT_PAYABLE_MESSAGE);
        }

        return tx.payment.create({
          data: {
            orderId: order.id,
            userId,
            idempotencyKey,
            method: dto.method,
            accountLast4: gatewayResult.accountLast4,
            amount: order.totalAmount,
            status: gatewayResult.status,
            failureReason: gatewayResult.failureReason,
          },
        });
      });

      return this.formatPaymentResponse(
        createdPayment,
        order.orderNumber,
        false,
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const racedPayment = await this.findExistingPayment(
          userId,
          idempotencyKey,
        );
        if (racedPayment) {
          if (racedPayment.orderId !== dto.orderId) {
            throw new ConflictException(IDEMPOTENCY_KEY_CONFLICT_MESSAGE);
          }
          return this.formatPaymentResponse(
            racedPayment,
            racedPayment.order.orderNumber,
            true,
          );
        }
      }
      throw error;
    }
  }

  private async findExistingPayment(userId: string, idempotencyKey: string) {
    return this.prisma.payment.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2002';
    }
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private formatPaymentResponse(
    payment: {
      id: string;
      orderId: string;
      method: PaymentMethod;
      accountLast4: string;
      amount: number;
      status: PaymentStatus;
      failureReason: string | null;
      createdAt: Date;
    },
    orderNumber: number,
    isReplay: boolean,
  ): PaymentResponseBody {
    const orderStatus =
      payment.status === PaymentStatus.SUCCESS
        ? OrderStatus.PAID
        : OrderStatus.PAYMENT_FAILED;

    const response: PaymentResponseBody = {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      accountLast4: payment.accountLast4,
      amount: payment.amount,
      status: payment.status,
      ...(payment.status === PaymentStatus.FAILED
        ? {
            failureReason: payment.failureReason ?? SIMULATED_FAILURE_REASON,
          }
        : {}),
      createdAt: payment.createdAt,
      order: {
        id: payment.orderId,
        orderNumber,
        status: orderStatus,
      },
    };

    Object.defineProperty(response, IS_IDEMPOTENT_REPLAY, {
      value: isReplay,
      enumerable: false,
    });

    return response;
  }
}
