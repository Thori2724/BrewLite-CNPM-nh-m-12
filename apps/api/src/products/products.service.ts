import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALLOWED_CATEGORIES,
  DRINK_ICE_LEVELS,
  DRINK_SIZES,
  DRINK_SUGAR_LEVELS,
  INVALID_CATEGORY_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
  UUID_REGEX,
} from './products.constants';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeSearchText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
  }

  async findAll(params?: { category?: string; q?: string }) {
    const where: Prisma.ProductWhereInput = {
      isVisible: true,
    };

    if (params?.category !== undefined) {
      if (!ALLOWED_CATEGORIES.includes(params.category as Category)) {
        throw new BadRequestException(INVALID_CATEGORY_MESSAGE);
      }
      where.category = params.category as Category;
    }

    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        imageUrl: true,
        stock: true,
      },
    });

    const trimmedQuery = params?.q?.trim();
    if (!trimmedQuery) {
      return products;
    }

    const normalizedQuery = this.normalizeSearchText(trimmedQuery);
    return products.filter((product) =>
      this.normalizeSearchText(product.name).includes(normalizedQuery),
    );
  }

  async findOne(id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id,
        isVisible: true,
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        imageUrl: true,
        stock: true,
      },
    });

    if (!product) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    const isCake = product.category === Category.CAKE;

    const toppings = isCake
      ? []
      : await this.prisma.topping.findMany({
          where: { isVisible: true },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            name: true,
            price: true,
          },
        });

    return {
      ...product,
      sizes: isCake ? [] : DRINK_SIZES,
      sugarLevels: isCake ? [] : DRINK_SUGAR_LEVELS,
      iceLevels: isCake ? [] : DRINK_ICE_LEVELS,
      toppings,
    };
  }
}
