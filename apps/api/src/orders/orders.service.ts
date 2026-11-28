import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  IceLevel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReceiveType,
  Size,
  SugarLevel,
} from '@prisma/client';
import { ORDER_NOT_FOUND_MESSAGE } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_NOT_FOUND_MESSAGE,
  UUID_REGEX,
} from '../products/products.constants';
import { calculatePromotionDiscount } from '../promotions/promotion-discount.util';
import {
  PROMOTION_CODE_NOT_FOUND_MESSAGE,
  PROMOTION_INACTIVE_MESSAGE,
} from '../promotions/promotions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  STAFF_ALLOWED_ORDER_STATUSES,
  UpdateOrderStatusDto,
} from './dto/update-order-status.dto';
import { calculateOrderTotal } from './order-pricing';
import {
  OrderStatus as TransitionOrderStatus,
  validateTransition,
} from './order-status';

export const TOPPING_NOT_FOUND_MESSAGE = 'Không tìm thấy topping';
export const INVALID_ORDER_STATUS_MESSAGE = 'Trạng thái không hợp lệ';
export const ORDER_CANNOT_CANCEL_MESSAGE =
  'Không thể hủy đơn ở trạng thái hiện tại';
export const ORDER_STATUS_CHANGED_MESSAGE =
  'Trạng thái đơn đã thay đổi, vui lòng tải lại';
export { ORDER_NOT_FOUND_MESSAGE };

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  [OrderStatus.PENDING]: 'Chờ thanh toán',
  [OrderStatus.PAID]: 'Đã thanh toán',
  [OrderStatus.PREPARING]: 'Đang pha chế',
  [OrderStatus.READY]: 'Sẵn sàng nhận',
  [OrderStatus.COMPLETED]: 'Hoàn thành',
  [OrderStatus.PAYMENT_FAILED]: 'Thanh toán lỗi',
  [OrderStatus.CANCELLED]: 'Đã hủy',
};

interface OrderToppingRecord {
  id?: string;
  toppingId?: string;
  name: string;
  price: number;
}

interface OrderItemRecord {
  id: string;
  productId: string;
  productName: string;
  size: Size | null;
  sugarLevel: SugarLevel | null;
  iceLevel: IceLevel | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
  toppings: OrderToppingRecord[];
}

interface OrderRecord {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  receiveType: ReceiveType;
  note: string | null;
  subtotalAmount?: number;
  discountAmount?: number;
  promotionCode?: string | null;
  pointsUsed?: number;
  pointsEarned?: number;
  totalAmount: number;
  createdAt: Date;
  items: OrderItemRecord[];
}

interface CustomerRecord {
  id: string;
  displayName: string;
  email: string;
}

interface OrderWithCustomerRecord extends OrderRecord {
  user: CustomerRecord;
}

interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  accountLast4: string;
  status: PaymentStatus;
  failureReason: string | null;
  createdAt: Date;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    let normalizedPromotionCode: string | null = null;
    if (dto.promotionCode !== undefined) {
      if (typeof dto.promotionCode !== 'string') {
        throw new BadRequestException(['promotionCode must be a string']);
      }
      const trimmedCode = dto.promotionCode.trim().toUpperCase();
      if (trimmedCode.length < 1 || trimmedCode.length > 30) {
        throw new BadRequestException([
          'promotionCode must be between 1 and 30 characters',
        ]);
      }
      normalizedPromotionCode = trimmedCode;
    }

    const uniqueProductIds = Array.from(
      new Set(dto.items.map((item) => item.productId)),
    );

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        isVisible: true,
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        stock: true,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      if (!productMap.has(item.productId)) {
        throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
      }
    }

    const cakeErrors: string[] = [];
    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;
      if (product.category === Category.CAKE) {
        if (item.size !== undefined && item.size !== null) {
          cakeErrors.push('size is not allowed for CAKE products');
        }
        if (item.sugarLevel !== undefined && item.sugarLevel !== null) {
          cakeErrors.push('sugarLevel is not allowed for CAKE products');
        }
        if (item.iceLevel !== undefined && item.iceLevel !== null) {
          cakeErrors.push('iceLevel is not allowed for CAKE products');
        }
        if (item.toppingIds !== undefined && item.toppingIds !== null) {
          cakeErrors.push('toppingIds is not allowed for CAKE products');
        }
      }
    }

    if (cakeErrors.length > 0) {
      throw new BadRequestException(cakeErrors);
    }

    const uniqueToppingIds = Array.from(
      new Set(dto.items.flatMap((item) => item.toppingIds ?? [])),
    );

    const toppingMap = new Map<
      string,
      { id: string; name: string; price: number }
    >();

    if (uniqueToppingIds.length > 0) {
      const toppings = await this.prisma.topping.findMany({
        where: {
          id: { in: uniqueToppingIds },
          isVisible: true,
        },
        select: {
          id: true,
          name: true,
          price: true,
        },
      });

      for (const topping of toppings) {
        toppingMap.set(topping.id, topping);
      }

      for (const item of dto.items) {
        for (const toppingId of item.toppingIds ?? []) {
          if (!toppingMap.has(toppingId)) {
            throw new NotFoundException(TOPPING_NOT_FOUND_MESSAGE);
          }
        }
      }
    }

    const normalizedItems = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const isCake = product.category === Category.CAKE;
      const toppings = isCake
        ? []
        : (item.toppingIds ?? []).map((id) => toppingMap.get(id)!);

      return {
        product,
        quantity: item.quantity,
        size: isCake ? null : (item.size ?? Size.S),
        sugarLevel: isCake ? null : (item.sugarLevel ?? SugarLevel.P100),
        iceLevel: isCake ? null : (item.iceLevel ?? IceLevel.NORMAL),
        note: item.note ?? null,
        toppings,
      };
    });

    const pricing = calculateOrderTotal(
      normalizedItems.map((item) => ({
        basePrice: item.product.basePrice,
        quantity: item.quantity,
        size: item.size,
        toppingPrices: item.toppings.map((t) => t.price),
      })),
    );

    const requestedByProduct = new Map<string, number>();
    for (const item of dto.items) {
      requestedByProduct.set(
        item.productId,
        (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const receiveType = dto.receiveType ?? ReceiveType.AT_COUNTER;
    const orderNote = dto.note ?? null;
    const subtotalAmount = pricing.totalAmount;

    return this.prisma.$transaction(
      async (tx) => {
        let matchedPromotion: {
          code: string;
          type: import('@prisma/client').PromotionType;
          value: number;
          maxDiscount: number | null;
          isActive: boolean;
        } | null = null;

        if (normalizedPromotionCode !== null) {
          matchedPromotion = await tx.promotion.findUnique({
            where: { code: normalizedPromotionCode },
            select: {
              code: true,
              type: true,
              value: true,
              maxDiscount: true,
              isActive: true,
            },
          });

          if (!matchedPromotion) {
            throw new NotFoundException(PROMOTION_CODE_NOT_FOUND_MESSAGE);
          }

          if (!matchedPromotion.isActive) {
            throw new ConflictException(PROMOTION_INACTIVE_MESSAGE);
          }
        }

        const failedProductIds: string[] = [];

        for (const [productId, requiredQty] of requestedByProduct.entries()) {
          const updated = await tx.product.updateMany({
            where: {
              id: productId,
              isVisible: true,
              stock: { gte: requiredQty },
            },
            data: {
              stock: { decrement: requiredQty },
            },
          });

          if (updated.count === 0) {
            failedProductIds.push(productId);
          }
        }

        if (failedProductIds.length > 0) {
          const currentProducts = await tx.product.findMany({
            where: { id: { in: failedProductIds } },
            select: { id: true, name: true, stock: true },
          });
          const currentById = new Map(currentProducts.map((p) => [p.id, p]));

          const details = failedProductIds.map((productId) => {
            const current = currentById.get(productId);
            const original = productMap.get(productId)!;
            return {
              productId,
              name: current?.name ?? original.name,
              available: current?.stock ?? 0,
            };
          });

          const firstShortage = details[0];
          const message =
            firstShortage.available === 0
              ? `Sản phẩm '${firstShortage.name}' hiện đã tạm hết`
              : `Sản phẩm '${firstShortage.name}' chỉ còn ${firstShortage.available}`;

          throw new ConflictException({
            statusCode: HttpStatus.CONFLICT,
            message,
            error: 'Conflict',
            details,
          });
        }

        const discountAmount = matchedPromotion
          ? calculatePromotionDiscount(
              matchedPromotion.type,
              matchedPromotion.value,
              matchedPromotion.maxDiscount,
              subtotalAmount,
            )
          : 0;
        const promotionCode = matchedPromotion ? matchedPromotion.code : null;
        const pointsUsed = 0;
        const pointsEarned = 0;
        const totalAmount = subtotalAmount - discountAmount - pointsUsed * 1000;

        const createdOrder = await tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING,
            receiveType,
            note: orderNote,
            subtotalAmount,
            discountAmount,
            promotionCode,
            pointsUsed,
            pointsEarned,
            totalAmount,
          },
        });

        const createdItems: OrderItemRecord[] = [];

        for (let i = 0; i < normalizedItems.length; i++) {
          const item = normalizedItems[i];
          const linePricing = pricing.lines[i];

          const createdItem = await tx.orderItem.create({
            data: {
              orderId: createdOrder.id,
              productId: item.product.id,
              productName: item.product.name,
              unitPrice: linePricing.unitPrice,
              quantity: item.quantity,
              size: item.size,
              sugarLevel: item.sugarLevel,
              iceLevel: item.iceLevel,
              lineTotal: linePricing.lineTotal,
              note: item.note,
            },
          });

          const createdToppings: OrderToppingRecord[] = [];
          for (const topping of item.toppings) {
            await tx.orderItemTopping.create({
              data: {
                orderItemId: createdItem.id,
                toppingId: topping.id,
                name: topping.name,
                price: topping.price,
              },
            });
            createdToppings.push({
              toppingId: topping.id,
              name: topping.name,
              price: topping.price,
            });
          }

          createdItems.push({
            id: createdItem.id,
            productId: createdItem.productId,
            productName: createdItem.productName,
            size: createdItem.size,
            sugarLevel: createdItem.sugarLevel,
            iceLevel: item.iceLevel,
            quantity: createdItem.quantity,
            unitPrice: createdItem.unitPrice,
            lineTotal: createdItem.lineTotal,
            note: createdItem.note,
            toppings: createdToppings,
          });
        }

        return this.formatOrderResponse({
          ...createdOrder,
          items: createdItems,
        });
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }

  async findMyOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
      include: {
        items: {
          include: {
            toppings: true,
          },
        },
      },
    });

    return orders.map((order) => this.formatOrderResponse(order));
  }

  async findOneForUser(userId: string, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        items: {
          include: {
            toppings: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    return {
      ...this.formatOrderResponse(order),
      payments: order.payments.map((payment: PaymentRecord) => ({
        id: payment.id,
        method: payment.method,
        accountLast4: payment.accountLast4,
        status: payment.status,
        failureReason: payment.failureReason ?? null,
        createdAt: payment.createdAt,
      })),
    };
  }

  async cancelForUser(userId: string, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        items: {
          include: {
            toppings: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    try {
      validateTransition(
        order.status as unknown as TransitionOrderStatus,
        TransitionOrderStatus.CANCELLED,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(ORDER_CANNOT_CANCEL_MESSAGE);
      }
      throw error;
    }

    await this.cancelOrderInTransaction(order);

    return this.formatOrderResponse({
      ...order,
      status: OrderStatus.CANCELLED,
    });
  }

  async findAllForStaff(status?: string) {
    if (status !== undefined) {
      const validStatuses = Object.values(OrderStatus) as string[];
      if (!validStatuses.includes(status)) {
        throw new BadRequestException(INVALID_ORDER_STATUS_MESSAGE);
      }
    }

    const orders = await this.prisma.order.findMany({
      where: status !== undefined ? { status: status as OrderStatus } : {},
      orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
      include: {
        items: {
          include: {
            toppings: true,
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    return orders.map((order) => this.formatOrderWithCustomerResponse(order));
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    if (
      !dto?.status ||
      !(STAFF_ALLOWED_ORDER_STATUSES as readonly string[]).includes(dto.status)
    ) {
      throw new BadRequestException([
        `status must be one of the following values: ${STAFF_ALLOWED_ORDER_STATUSES.join(', ')}`,
      ]);
    }

    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    const order = await this.prisma.order.findFirst({
      where: { id },
      include: {
        items: {
          include: {
            toppings: true,
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    }

    try {
      validateTransition(
        order.status as unknown as TransitionOrderStatus,
        dto.status as unknown as TransitionOrderStatus,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(
          `Không thể chuyển đơn từ trạng thái '${ORDER_STATUS_LABELS[order.status]}' sang '${ORDER_STATUS_LABELS[dto.status]}'`,
        );
      }
      throw error;
    }

    if (dto.status === OrderStatus.CANCELLED) {
      await this.cancelOrderInTransaction(order);
    } else {
      const updated = await this.prisma.order.updateMany({
        where: {
          id,
          status: order.status,
        },
        data: {
          status: dto.status,
        },
      });

      if (updated.count === 0) {
        throw new ConflictException(ORDER_STATUS_CHANGED_MESSAGE);
      }
    }

    return this.formatOrderWithCustomerResponse({
      ...order,
      status: dto.status,
    });
  }

  private async cancelOrderInTransaction(order: {
    id: string;
    status: OrderStatus;
    items: Array<{ productId: string; quantity: number }>;
  }) {
    const restockByProduct = new Map<string, number>();
    for (const item of order.items) {
      restockByProduct.set(
        item.productId,
        (restockByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.order.updateMany({
          where: {
            id: order.id,
            status: order.status,
          },
          data: {
            status: OrderStatus.CANCELLED,
          },
        });

        if (updated.count === 0) {
          throw new ConflictException(ORDER_STATUS_CHANGED_MESSAGE);
        }

        for (const [productId, quantity] of restockByProduct.entries()) {
          await tx.product.updateMany({
            where: { id: productId },
            data: {
              stock: { increment: quantity },
            },
          });
        }
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }

  private formatOrderWithCustomerResponse(order: OrderWithCustomerRecord) {
    return {
      ...this.formatOrderResponse(order),
      customer: {
        id: order.user.id,
        displayName: order.user.displayName,
        email: order.user.email,
      },
    };
  }

  private formatOrderResponse(order: OrderRecord) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      receiveType: order.receiveType,
      note: order.note,
      subtotalAmount: order.subtotalAmount ?? order.totalAmount,
      discountAmount: order.discountAmount ?? 0,
      promotionCode: order.promotionCode ?? null,
      pointsUsed: order.pointsUsed ?? 0,
      pointsEarned: order.pointsEarned ?? 0,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        size: item.size,
        sugarLevel: item.sugarLevel,
        iceLevel: item.iceLevel,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        note: item.note,
        toppings: item.toppings.map((topping) => ({
          id: topping.toppingId ?? topping.id!,
          name: topping.name,
          price: topping.price,
        })),
      })),
    };
  }
}
