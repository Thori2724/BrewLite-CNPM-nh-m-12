import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Min } from 'class-validator';

export class ValidatePromotionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 30)
  code!: string;

  @IsInt()
  @Min(1000)
  subtotal!: number;
}
