import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOrderDto) {
    if (!req.user?.id) {
      throw new UnauthorizedException(
        'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
      );
    }
    return this.ordersService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Get()
  findAll(@Query('status') status?: string) {
    return this.ordersService.findAllForStaff(status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMyOrders(@Req() req: AuthenticatedRequest) {
    if (!req.user?.id) {
      throw new UnauthorizedException(
        'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
      );
    }
    return this.ordersService.findMyOrders(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (!req.user?.id) {
      throw new UnauthorizedException(
        'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
      );
    }
    return this.ordersService.findOneForUser(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (!req.user?.id) {
      throw new UnauthorizedException(
        'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
      );
    }
    return this.ordersService.cancelForUser(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}
