import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';
import { UUID_REGEX } from '../../products/products.constants';

export const ACCOUNT_NUMBER_REGEX = /^\d{8,19}$/;

export class CreatePaymentDto {
  @Matches(UUID_REGEX, { message: 'orderId must be a UUID' })
  orderId!: string;

  @IsEnum(PaymentMethod, {
    message: 'method must be one of the following values: WALLET, CARD',
  })
  method!: PaymentMethod;

  @IsString({ message: 'accountNumber must be a string' })
  @Matches(ACCOUNT_NUMBER_REGEX, {
    message:
      'accountNumber must contain only digits and be between 8 and 19 characters',
  })
  accountNumber!: string;
}
