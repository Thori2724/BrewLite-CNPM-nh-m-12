import { IsBoolean } from 'class-validator';

export class UpdateStaffStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
