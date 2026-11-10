import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { IS_IDEMPOTENT_REPLAY, PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Body() dto: CreatePaymentDto,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException(
        'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
      );
    }

    const result = await this.paymentsService.create(
      req.user.id,
      idempotencyKey,
      dto,
    );

    if (res) {
      res.status(
        result[IS_IDEMPOTENT_REPLAY] ? HttpStatus.OK : HttpStatus.CREATED,
      );
    }

    return result;
  }
}
