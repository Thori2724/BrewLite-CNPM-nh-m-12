import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Category } from '@prisma/client';

export class UpdateProductDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(1000000)
  basePrice?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf(
    (o: UpdateProductDto) => o.imageUrl !== undefined && o.imageUrl !== '',
  )
  @Matches(/^https?:\/\/.+/i, {
    message: 'imageUrl must start with http:// or https://',
  })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
