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

    const trimmedQuery = params?.q?.trim();
    if (trimmedQuery) {
      where.name = {
        contains: trimmedQuery,
        mode: 'insensitive',
      };
    }

    return this.prisma.product.findMany({
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

    return {
      ...product,
      sizes: isCake ? [] : DRINK_SIZES,
      sugarLevels: isCake ? [] : DRINK_SUGAR_LEVELS,
      iceLevels: isCake ? [] : DRINK_ICE_LEVELS,
      toppings: [],
    };
  }
}
