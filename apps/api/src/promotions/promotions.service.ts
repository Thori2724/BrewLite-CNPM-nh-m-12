import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromotionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ValidatePromotionDto } from './dto/validate-promotion.dto';
import { calculatePromotionDiscount } from './promotion-discount.util';

export const PROMOTION_CODE_EXISTS_MESSAGE = 'Mã giảm giá đã tồn tại';
export const PROMOTION_NOT_FOUND_MESSAGE = 'Không tìm thấy mã giảm giá';
export const PROMOTION_CODE_NOT_FOUND_MESSAGE = 'Mã giảm giá không tồn tại';
export const PROMOTION_INACTIVE_MESSAGE = 'Mã giảm giá đã ngừng áp dụng';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROMOTION_CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;

const PROMOTION_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  maxDiscount: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateValueAndMaxDiscount(
    type: PromotionType,
    value: number,
    maxDiscount: number | undefined,
  ): void {
    const errors: string[] = [];

    if (!Number.isInteger(value)) {
      errors.push('value must be an integer number');
    } else if (type === PromotionType.PERCENT) {
      if (value < 1) {
        errors.push('value must not be less than 1');
      }
      if (value > 100) {
        errors.push('value must not be greater than 100');
      }
    } else if (type === PromotionType.FIXED) {
      if (value < 1000) {
        errors.push('value must not be less than 1000');
      }
      if (value > 1000000) {
        errors.push('value must not be greater than 1000000');
      }
    }

    if (maxDiscount !== undefined) {
      if (type === PromotionType.FIXED) {
        errors.push('maxDiscount is only allowed for PERCENT promotion type');
      } else if (!Number.isInteger(maxDiscount)) {
        errors.push('maxDiscount must be an integer number');
      } else {
        if (maxDiscount < 1000) {
          errors.push('maxDiscount must not be less than 1000');
        }
        if (maxDiscount > 1000000) {
          errors.push('maxDiscount must not be greater than 1000000');
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
  }

  async findAll() {
    return this.prisma.promotion.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: PROMOTION_SELECT,
    });
  }

  async create(dto: CreatePromotionDto) {
    const normalizedCode =
      typeof dto.code === 'string' ? dto.code.trim().toUpperCase() : '';

    if (!PROMOTION_CODE_REGEX.test(normalizedCode)) {
      throw new BadRequestException([
        'code must be between 3 and 20 characters and contain only A-Z, 0-9, _, and -',
      ]);
    }

    this.validateValueAndMaxDiscount(dto.type, dto.value, dto.maxDiscount);

    const existing = await this.prisma.promotion.findUnique({
      where: { code: normalizedCode },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(PROMOTION_CODE_EXISTS_MESSAGE);
    }

    try {
      return await this.prisma.promotion.create({
        data: {
          code: normalizedCode,
          type: dto.type,
          value: dto.value,
          maxDiscount:
            dto.type === PromotionType.PERCENT
              ? (dto.maxDiscount ?? null)
              : null,
          isActive: dto.isActive ?? true,
        },
        select: PROMOTION_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(PROMOTION_CODE_EXISTS_MESSAGE);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePromotionDto) {
    if ((dto as { code?: unknown }).code !== undefined) {
      throw new BadRequestException(['code cannot be updated']);
    }

    const hasUpdatableField =
      dto.type !== undefined ||
      dto.value !== undefined ||
      dto.maxDiscount !== undefined ||
      dto.isActive !== undefined;

    if (!hasUpdatableField) {
      throw new BadRequestException([
        'at least one field must be provided for update',
      ]);
    }

    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(PROMOTION_NOT_FOUND_MESSAGE);
    }

    const existing = await this.prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        value: true,
        maxDiscount: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(PROMOTION_NOT_FOUND_MESSAGE);
    }

    const targetType = dto.type ?? existing.type;
    const targetValue = dto.value ?? existing.value;

    this.validateValueAndMaxDiscount(targetType, targetValue, dto.maxDiscount);

    const data: Prisma.PromotionUpdateInput = {};

    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.value !== undefined) {
      data.value = dto.value;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (targetType === PromotionType.FIXED) {
      data.maxDiscount = null;
    } else if (dto.maxDiscount !== undefined) {
      data.maxDiscount = dto.maxDiscount;
    }

    return this.prisma.promotion.update({
      where: { id },
      data,
      select: PROMOTION_SELECT,
    });
  }

  async validate(dto: ValidatePromotionDto) {
    const errors: string[] = [];
    const normalizedCode =
      typeof dto.code === 'string' ? dto.code.trim().toUpperCase() : '';

    if (
      typeof dto.code !== 'string' ||
      normalizedCode.length < 1 ||
      normalizedCode.length > 30
    ) {
      errors.push('code must be a string between 1 and 30 characters');
    }

    if (!Number.isInteger(dto.subtotal) || dto.subtotal < 1000) {
      errors.push('subtotal must be an integer not less than 1000');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const promotion = await this.prisma.promotion.findUnique({
      where: { code: normalizedCode },
      select: {
        code: true,
        type: true,
        value: true,
        maxDiscount: true,
        isActive: true,
      },
    });

    if (!promotion) {
      throw new NotFoundException(PROMOTION_CODE_NOT_FOUND_MESSAGE);
    }

    if (!promotion.isActive) {
      throw new ConflictException(PROMOTION_INACTIVE_MESSAGE);
    }

    const discountAmount = calculatePromotionDiscount(
      promotion.type,
      promotion.value,
      promotion.maxDiscount,
      dto.subtotal,
    );

    return {
      code: promotion.code,
      type: promotion.type,
      value: promotion.value,
      maxDiscount: promotion.maxDiscount,
      discountAmount,
    };
  }
}
