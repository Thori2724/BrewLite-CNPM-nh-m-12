import { Transform } from 'class-transformer';
import {
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

export class CreateProductDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsEnum(Category)
  category!: Category;

  @IsInt()
  @Min(1000)
  @Max(1000000)
  basePrice!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf(
    (o: CreateProductDto) => o.imageUrl !== undefined && o.imageUrl !== '',
  )
  @Matches(/^https?:\/\/.+/i, {
    message: 'imageUrl must start with http:// or https://',
  })
  imageUrl?: string;
}
