import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator';

export class UpdateProductAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;

  @ValidateIf((o: UpdateProductAvailabilityDto) => o.isAvailable === true)
  @IsInt()
  @Min(1)
  @Max(9999)
  stock?: number;
}
