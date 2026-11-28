import { PromotionType } from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdatePromotionDto {
  @ValidateIf((o: UpdatePromotionDto) => o.code !== undefined)
  @Equals(undefined, {
    message: 'code cannot be updated',
  })
  code?: never;

  @IsOptional()
  @IsEnum(PromotionType)
  type?: PromotionType;

  @IsOptional()
  @IsInt()
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(1000000)
  maxDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
