import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ALLOWED_CATEGORIES,
  DEFAULT_PRODUCT_IMAGE_URL,
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

  async findAllForManage() {
    return this.prisma.product.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        imageUrl: true,
        stock: true,
        isVisible: true,
      },
    });
  }

  async create(dto: CreateProductDto) {
    const trimmedImageUrl = dto.imageUrl?.trim();
    const imageUrl = trimmedImageUrl || DEFAULT_PRODUCT_IMAGE_URL;
    const stock = dto.stock ?? 50;

    return this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        category: dto.category,
        basePrice: dto.basePrice,
        imageUrl,
        stock,
        isVisible: true,
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        imageUrl: true,
        stock: true,
        isVisible: true,
      },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    const data: Prisma.ProductUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.category !== undefined) {
      data.category = dto.category;
    }
    if (dto.basePrice !== undefined) {
      data.basePrice = dto.basePrice;
    }
    if (dto.imageUrl !== undefined) {
      data.imageUrl = dto.imageUrl.trim() || DEFAULT_PRODUCT_IMAGE_URL;
    }
    if (dto.isVisible !== undefined) {
      data.isVisible = dto.isVisible;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException([
        'at least one field must be provided for update',
      ]);
    }

    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return this.prisma.product.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        imageUrl: true,
        stock: true,
        isVisible: true,
      },
    });
  }

  async updateAvailability(id: string, isAvailable: boolean, stock?: number) {
    if (typeof isAvailable !== 'boolean') {
      throw new BadRequestException(['isAvailable must be a boolean value']);
    }

    if (isAvailable) {
      if (
        typeof stock !== 'number' ||
        !Number.isInteger(stock) ||
        stock < 1 ||
        stock > 9999
      ) {
        throw new BadRequestException([
          'stock must not be greater than 9999',
          'stock must not be less than 1',
          'stock must be an integer number',
        ]);
      }
    }

    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        stock: isAvailable ? stock! : 0,
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        imageUrl: true,
        stock: true,
        isVisible: true,
      },
    });
  }
}
