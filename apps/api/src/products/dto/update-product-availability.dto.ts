import { IsBoolean } from 'class-validator';

export class UpdateProductAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;
}
