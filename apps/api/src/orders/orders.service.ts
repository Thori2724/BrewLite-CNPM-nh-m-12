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
  ReceiveType,
  Size,
  SugarLevel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_NOT_FOUND_MESSAGE } from '../products/products.constants';
import { CreateOrderDto } from './dto/create-order.dto';
import { calculateOrderTotal } from './order-pricing';

export const TOPPING_NOT_FOUND_MESSAGE = 'Không tìm thấy topping';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
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

    return this.prisma.$transaction(async (tx) => {
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

        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          message: `Sản phẩm '${details[0].name}' không đủ số lượng trong kho`,
          error: 'Conflict',
          details,
        });
      }

      const createdOrder = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          receiveType,
          note: orderNote,
          totalAmount: pricing.totalAmount,
        },
      });

      const responseItems: Array<{
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
        toppings: Array<{ id: string; name: string; price: number }>;
      }> = [];

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

        for (const topping of item.toppings) {
          await tx.orderItemTopping.create({
            data: {
              orderItemId: createdItem.id,
              toppingId: topping.id,
              name: topping.name,
              price: topping.price,
            },
          });
        }

        responseItems.push({
          id: createdItem.id,
          productId: createdItem.productId,
          productName: createdItem.productName,
          size: createdItem.size,
          sugarLevel: createdItem.sugarLevel,
          iceLevel: createdItem.iceLevel,
          quantity: createdItem.quantity,
          unitPrice: createdItem.unitPrice,
          lineTotal: createdItem.lineTotal,
          note: createdItem.note,
          toppings: item.toppings.map((t) => ({
            id: t.id,
            name: t.name,
            price: t.price,
          })),
        });
      }

      return {
        id: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        status: createdOrder.status,
        receiveType: createdOrder.receiveType,
        note: createdOrder.note,
        totalAmount: createdOrder.totalAmount,
        createdAt: createdOrder.createdAt,
        items: responseItems,
      };
    });
  }
}
