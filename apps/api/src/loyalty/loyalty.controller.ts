import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LoyaltyService } from './loyalty.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('me')
  findMyLoyalty(@Req() req: AuthenticatedRequest) {
    if (!req.user?.id) {
      throw new UnauthorizedException(
        'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
      );
    }
    return this.loyaltyService.findMyLoyalty(req.user.id);
  }
}
