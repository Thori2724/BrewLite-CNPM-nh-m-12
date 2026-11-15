import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateProductAvailabilityDto } from './dto/update-product-availability.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query('category') category?: string, @Query('q') q?: string) {
    return this.productsService.findAll({ category, q });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Get('manage')
  findAllForManage() {
    return this.productsService.findAllForManage();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id/availability')
  updateAvailability(
    @Param('id') id: string,
    @Body() dto: UpdateProductAvailabilityDto,
  ) {
    return this.productsService.updateAvailability(id, dto.isAvailable);
  }
}
