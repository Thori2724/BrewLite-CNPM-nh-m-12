import { PromotionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreatePromotionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(3, 20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message:
      'code must only contain uppercase letters (A-Z), numbers (0-9), underscores (_), and hyphens (-)',
  })
  code!: string;

  @IsEnum(PromotionType)
  type!: PromotionType;

  @IsInt()
  @ValidateIf((o: CreatePromotionDto) => o.type === PromotionType.PERCENT)
  @Min(1)
  @Max(100)
  @ValidateIf((o: CreatePromotionDto) => o.type === PromotionType.FIXED)
  @Min(1000)
  @Max(1000000)
  value!: number;

  @ValidateIf(
    (o: CreatePromotionDto) =>
      o.type === PromotionType.FIXED && o.maxDiscount !== undefined,
  )
  @Equals(undefined, {
    message: 'maxDiscount is only allowed for PERCENT promotion type',
  })
  @ValidateIf(
    (o: CreatePromotionDto) =>
      o.type !== PromotionType.FIXED && o.maxDiscount !== undefined,
  )
  @IsInt()
  @Min(1000)
  @Max(1000000)
  maxDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
