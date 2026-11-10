import { IceLevel, ReceiveType, Size, SugarLevel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { UUID_REGEX } from '../../products/products.constants';

export class CreateOrderItemDto {
  @Matches(UUID_REGEX, { message: 'productId must be a UUID' })
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;

  @IsOptional()
  @IsEnum(Size)
  size?: Size;

  @IsOptional()
  @IsEnum(SugarLevel)
  sugarLevel?: SugarLevel;

  @IsOptional()
  @IsEnum(IceLevel)
  iceLevel?: IceLevel;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @Matches(UUID_REGEX, {
    each: true,
    message: 'each value in toppingIds must be a UUID',
  })
  toppingIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsEnum(ReceiveType)
  receiveType?: ReceiveType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
