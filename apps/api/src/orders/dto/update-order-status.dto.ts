import { OrderStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export const STAFF_ALLOWED_ORDER_STATUSES = [
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
] as const;

export type StaffUpdatableOrderStatus =
  (typeof STAFF_ALLOWED_ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn(STAFF_ALLOWED_ORDER_STATUSES)
  status!: StaffUpdatableOrderStatus;
}
