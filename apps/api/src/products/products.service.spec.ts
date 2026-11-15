import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Category, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProductAvailabilityDto } from './dto/update-product-availability.dto';
import {
  DRINK_ICE_LEVELS,
  DRINK_SIZES,
  DRINK_SUGAR_LEVELS,
  INVALID_CATEGORY_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
} from './products.constants';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let controller: ProductsController;
  let prisma: {
    product: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    topping: {
      findMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  const mockToppings = [
    {
      id: '22222222-0000-0000-0000-000000000001',
      name: 'Trân châu đen',
      price: 5000,
    },
    {
      id: '22222222-0000-0000-0000-000000000002',
      name: 'Thạch dừa',
      price: 5000,
    },
    {
      id: '22222222-0000-0000-0000-000000000003',
      name: 'Pudding',
      price: 7000,
    },
    {
      id: '22222222-0000-0000-0000-000000000004',
      name: 'Kem cheese',
      price: 10000,
    },
  ];

  const mockCoffee = {
    id: '11111111-0000-0000-0000-000000000001',
    name: 'Cà phê sữa đá',
    category: Category.COFFEE,
    basePrice: 29000,
    imageUrl: 'https://example.com/cf.jpg',
    stock: 50,
  };

  const mockOutOfStock = {
    id: '11111111-0000-0000-0000-000000000003',
    name: 'Bạc xỉu',
    category: Category.COFFEE,
    basePrice: 32000,
    imageUrl: 'https://example.com/bx.jpg',
    stock: 0,
  };

  const mockCake = {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: Category.CAKE,
    basePrice: 30000,
    imageUrl: 'https://example.com/cake.jpg',
    stock: 20,
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      topping: {
        findMany: jest.fn().mockResolvedValue(mockToppings),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    controller = new ProductsController(service);
  });

  describe('findAll (GET /products)', () => {
    it('trả danh sách món hiển thị (gồm cả món hết hàng stock=0) và không có món ẩn', async () => {
      prisma.product.findMany.mockResolvedValue([mockOutOfStock, mockCoffee]);

      const result = await service.findAll();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { isVisible: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          category: true,
          basePrice: true,
          imageUrl: true,
          stock: true,
        },
      });
      expect(result).toHaveLength(2);
      expect(result.some((p) => p.stock === 0)).toBe(true);
    });

    it('lọc theo category hợp lệ', async () => {
      prisma.product.findMany.mockResolvedValue([mockCoffee]);

      await service.findAll({ category: 'COFFEE' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isVisible: true, category: Category.COFFEE },
        }),
      );
    });

    it('tìm kiếm q có dấu, không dấu (kể cả chữ đ/Đ -> d), không phân biệt hoa/thường và bỏ qua q toàn khoảng trắng', async () => {
      prisma.product.findMany.mockResolvedValue([
        mockCoffee,
        mockOutOfStock,
        mockCake,
      ]);

      // Có dấu + viết hoa
      const withAccentsUpper = await service.findAll({ q: '  CÀ PHÊ  ' });
      expect(withAccentsUpper).toEqual([mockCoffee]);

      // Không dấu + viết thường ("ca phe" -> "Cà phê sữa đá")
      const withoutAccents = await service.findAll({ q: 'ca phe' });
      expect(withoutAccents).toEqual([mockCoffee]);

      // Chữ đ/Đ xem như d ("sua da" hoặc "SỮA ĐÁ" -> "Cà phê sữa đá")
      const withD = await service.findAll({ q: 'sua da' });
      expect(withD).toEqual([mockCoffee]);

      const withUpperD = await service.findAll({ q: 'SỮA ĐÁ' });
      expect(withUpperD).toEqual([mockCoffee]);

      // Khoảng trắng toàn bộ -> trả toàn bộ danh sách
      const whitespaceOnly = await service.findAll({ q: '   ' });
      expect(whitespaceOnly).toHaveLength(3);
    });

    it('kết hợp lọc category và tìm kiếm q không dấu', async () => {
      prisma.product.findMany.mockResolvedValue([mockCoffee, mockOutOfStock]);

      const result = await service.findAll({
        category: 'COFFEE',
        q: 'bac xiu',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isVisible: true,
            category: Category.COFFEE,
          },
        }),
      );
      expect(result).toEqual([mockOutOfStock]);
    });

    it('ném 400 BadRequestException khi category sai giá trị', async () => {
      await expect(service.findAll({ category: 'ABC' })).rejects.toThrow(
        new BadRequestException(INVALID_CATEGORY_MESSAGE),
      );
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne (GET /products/:id)', () => {
    it('trả chi tiết món nước đủ sizes, sugarLevels, iceLevels và 4 toppings theo thứ tự id tăng dần', async () => {
      prisma.product.findFirst.mockResolvedValue(mockCoffee);
      prisma.topping.findMany.mockResolvedValue(mockToppings);

      const result = await service.findOne(mockCoffee.id);

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: mockCoffee.id, isVisible: true },
        select: {
          id: true,
          name: true,
          category: true,
          basePrice: true,
          imageUrl: true,
          stock: true,
        },
      });
      expect(prisma.topping.findMany).toHaveBeenCalledWith({
        where: { isVisible: true },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          price: true,
        },
      });
      expect(result).toEqual({
        ...mockCoffee,
        sizes: DRINK_SIZES,
        sugarLevels: DRINK_SUGAR_LEVELS,
        iceLevels: DRINK_ICE_LEVELS,
        toppings: mockToppings,
      });
    });

    it('chỉ lấy topping có isVisible = true và không trả trường isVisible', async () => {
      prisma.product.findFirst.mockResolvedValue(mockOutOfStock);
      prisma.topping.findMany.mockResolvedValue([mockToppings[0]]);

      const result = await service.findOne(mockOutOfStock.id);

      expect(prisma.topping.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.topping.findMany).toHaveBeenCalledWith({
        where: { isVisible: true },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          price: true,
        },
      });
      expect(result.toppings).toEqual([
        {
          id: '22222222-0000-0000-0000-000000000001',
          name: 'Trân châu đen',
          price: 5000,
        },
      ]);
      expect(result.toppings[0]).not.toHaveProperty('isVisible');
    });

    it('trả chi tiết món CAKE với 4 mảng tùy chọn đều rỗng và không truy vấn bảng Topping', async () => {
      prisma.product.findFirst.mockResolvedValue(mockCake);

      const result = await service.findOne(mockCake.id);

      expect(prisma.topping.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        ...mockCake,
        sizes: [],
        sugarLevels: [],
        iceLevels: [],
        toppings: [],
      });
    });

    it('ném 404 NotFoundException khi id không tồn tại, bị ẩn hoặc sai UUID', async () => {
      await expect(service.findOne('abc')).rejects.toThrow(
        new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE),
      );
      expect(prisma.product.findFirst).not.toHaveBeenCalled();

      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        service.findOne('99999999-0000-0000-0000-000000000099'),
      ).rejects.toThrow(new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE));
    });
  });

  describe('findAllForManage (GET /products/manage)', () => {
    const mockManageItems = [
      { ...mockCake, isVisible: true },
      { ...mockOutOfStock, isVisible: true },
      { ...mockCoffee, isVisible: true },
      {
        id: '11111111-0000-0000-0000-000000000099',
        name: 'Món đang ẩn',
        category: Category.TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/hidden.jpg',
        stock: 999,
        isVisible: false,
      },
    ];

    it('trả mọi món kể cả món đang ẩn (isVisible = false), sắp xếp theo category asc rồi name asc, đủ trường hợp đồng', async () => {
      prisma.product.findMany.mockResolvedValue(mockManageItems);

      const result = await controller.findAllForManage();

      expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          category: true,
          basePrice: true,
          imageUrl: true,
          stock: true,
          isVisible: true,
        },
      });
      expect(result).toEqual(mockManageItems);
      expect(result.some((item) => item.isVisible === false)).toBe(true);
    });
  });

  describe('updateAvailability (PATCH /products/:id/availability)', () => {
    it('isAvailable = true đặt stock = 999, isAvailable = false đặt stock = 0, món đang ẩn vẫn gạt được', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockOutOfStock.id });
      prisma.product.update.mockResolvedValueOnce({
        ...mockOutOfStock,
        stock: 999,
        isVisible: false,
      });

      const availableResult = await controller.updateAvailability(
        mockOutOfStock.id,
        { isAvailable: true },
      );

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: mockOutOfStock.id },
        select: { id: true },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: mockOutOfStock.id },
        data: { stock: 999 },
        select: {
          id: true,
          name: true,
          category: true,
          basePrice: true,
          imageUrl: true,
          stock: true,
          isVisible: true,
        },
      });
      expect(availableResult.stock).toBe(999);
      expect(availableResult.isVisible).toBe(false);

      prisma.product.update.mockResolvedValueOnce({
        ...mockOutOfStock,
        stock: 0,
        isVisible: true,
      });

      const unavailableResult = await controller.updateAvailability(
        mockOutOfStock.id,
        { isAvailable: false },
      );

      expect(prisma.product.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: mockOutOfStock.id },
          data: { stock: 0 },
        }),
      );
      expect(unavailableResult.stock).toBe(0);
    });

    it('ném 400 BadRequestException khi body thiếu isAvailable hoặc không phải boolean', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      });

      const invalidPayloads = [
        {},
        { isAvailable: 'true' },
        { isAvailable: 1 },
        { isAvailable: null },
      ];

      for (const payload of invalidPayloads) {
        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: UpdateProductAvailabilityDto,
          }),
        ).rejects.toThrow(BadRequestException);
      }

      const validTrue = (await pipe.transform(
        { isAvailable: true },
        { type: 'body', metatype: UpdateProductAvailabilityDto },
      )) as UpdateProductAvailabilityDto;
      expect(validTrue).toEqual({ isAvailable: true });
    });

    it('ném 404 "Không tìm thấy sản phẩm" khi id không tồn tại hoặc không phải UUID', async () => {
      await expect(
        service.updateAvailability('not-a-uuid', true),
      ).rejects.toThrow(new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE));
      expect(prisma.product.findUnique).not.toHaveBeenCalled();

      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.updateAvailability(
          '99999999-0000-0000-0000-000000000099',
          false,
        ),
      ).rejects.toThrow(new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE));
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('Guards trên GET /products/manage và PATCH /products/:id/availability', () => {
    let jwtService: { verifyAsync: jest.Mock };
    let jwtGuard: JwtAuthGuard;
    let rolesGuard: RolesGuard;

    const createContext = (
      methodName: 'findAllForManage' | 'updateAvailability',
      authHeader?: string,
    ): ExecutionContext => {
      const req: Record<string, unknown> = {
        headers: authHeader ? { authorization: authHeader } : {},
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        ProductsController.prototype,
        methodName,
      );
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => descriptor?.value as (...args: never[]) => unknown,
        getClass: () => ProductsController,
      } as unknown as ExecutionContext;
    };

    beforeEach(() => {
      jwtService = { verifyAsync: jest.fn() };
      jwtGuard = new JwtAuthGuard(jwtService as unknown as JwtService);
      rolesGuard = new RolesGuard(
        jwtService as unknown as JwtService,
        new Reflector(),
        prisma as unknown as PrismaService,
      );
    });

    it('chưa đăng nhập trả 401 Unauthorized', async () => {
      const ctx = createContext('findAllForManage', undefined);
      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );
    });

    it('khách (CUSTOMER) trả 403 "Bạn không có quyền thực hiện thao tác này"', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: '44444444-0000-0000-0000-000000000001',
        email: 'khach@example.com',
        role: Role.CUSTOMER,
      });

      const ctx = createContext(
        'findAllForManage',
        'Bearer valid-customer-token',
      );
      await jwtGuard.canActivate(ctx);
      await expect(rolesGuard.canActivate(ctx)).rejects.toThrow(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('tài khoản bị khóa (isActive = false) trả 403 "Tài khoản đã bị khóa"', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: '55555555-0000-0000-0000-000000000001',
        email: 'nhanvien1@example.com',
        role: Role.STAFF,
      });
      prisma.user.findUnique.mockResolvedValue({ isActive: false });

      const ctx = createContext(
        'updateAvailability',
        'Bearer locked-staff-token',
      );
      await jwtGuard.canActivate(ctx);
      await expect(rolesGuard.canActivate(ctx)).rejects.toThrow(
        new ForbiddenException('Tài khoản đã bị khóa'),
      );
    });

    it('STAFF và ADMIN đang hoạt động (isActive = true) đều qua được cả 2 endpoint', async () => {
      prisma.user.findUnique.mockResolvedValue({ isActive: true });

      for (const role of [Role.STAFF, Role.ADMIN]) {
        jwtService.verifyAsync.mockResolvedValue({
          sub: '55555555-0000-0000-0000-000000000001',
          email: 'staff-or-admin@example.com',
          role,
        });

        const manageCtx = createContext(
          'findAllForManage',
          'Bearer valid-token',
        );
        expect(await jwtGuard.canActivate(manageCtx)).toBe(true);
        expect(await rolesGuard.canActivate(manageCtx)).toBe(true);

        const patchCtx = createContext(
          'updateAvailability',
          'Bearer valid-token',
        );
        expect(await jwtGuard.canActivate(patchCtx)).toBe(true);
        expect(await rolesGuard.canActivate(patchCtx)).toBe(true);
      }
    });
  });
});
