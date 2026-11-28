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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductAvailabilityDto } from './dto/update-product-availability.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  DEFAULT_PRODUCT_IMAGE_URL,
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
      create: jest.Mock;
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
        create: jest.fn(),
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
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });

    it('(a) & (c) isAvailable = true kèm stock hợp lệ đặt stock bằng đúng số đó (không cộng dồn), isAvailable = false đặt stock = 0 kể cả khi gửi kèm stock, món đang ẩn vẫn gạt được', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockOutOfStock.id });
      prisma.product.update.mockResolvedValueOnce({
        ...mockOutOfStock,
        stock: 45,
        isVisible: false,
      });

      const validDtoTrue = (await pipe.transform(
        { isAvailable: true, stock: 45 },
        { type: 'body', metatype: UpdateProductAvailabilityDto },
      )) as UpdateProductAvailabilityDto;

      const availableResult = await controller.updateAvailability(
        mockOutOfStock.id,
        validDtoTrue,
      );

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: mockOutOfStock.id },
        select: { id: true },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: mockOutOfStock.id },
        data: { stock: 45 },
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
      expect(availableResult.stock).toBe(45);
      expect(availableResult.isVisible).toBe(false);

      // Đặt lại stock = 120 -> ghi đè đúng 120, không cộng dồn
      prisma.product.update.mockResolvedValueOnce({
        ...mockOutOfStock,
        stock: 120,
        isVisible: false,
      });

      const secondAvailableResult = await controller.updateAvailability(
        mockOutOfStock.id,
        { isAvailable: true, stock: 120 },
      );
      expect(prisma.product.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: mockOutOfStock.id },
          data: { stock: 120 },
        }),
      );
      expect(secondAvailableResult.stock).toBe(120);

      // (c) isAvailable = false không kèm stock -> stock = 0
      prisma.product.update.mockResolvedValueOnce({
        ...mockOutOfStock,
        stock: 0,
        isVisible: true,
      });

      const unavailableDtoNoStock = (await pipe.transform(
        { isAvailable: false },
        { type: 'body', metatype: UpdateProductAvailabilityDto },
      )) as UpdateProductAvailabilityDto;

      const unavailableResult = await controller.updateAvailability(
        mockOutOfStock.id,
        unavailableDtoNoStock,
      );

      expect(prisma.product.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: mockOutOfStock.id },
          data: { stock: 0 },
        }),
      );
      expect(unavailableResult.stock).toBe(0);

      // (c) isAvailable = false có gửi kèm stock (kể cả số âm, 0, số lớn hoặc chuỗi) -> bỏ qua không báo lỗi và vẫn đặt stock = 0
      for (const ignoredStock of [50, 0, -5, 10000, 'abc']) {
        prisma.product.update.mockResolvedValueOnce({
          ...mockOutOfStock,
          stock: 0,
          isVisible: true,
        });

        const dtoWithIgnoredStock = (await pipe.transform(
          { isAvailable: false, stock: ignoredStock },
          { type: 'body', metatype: UpdateProductAvailabilityDto },
        )) as UpdateProductAvailabilityDto;

        const resWithIgnoredStock = await controller.updateAvailability(
          mockOutOfStock.id,
          dtoWithIgnoredStock,
        );

        expect(prisma.product.update).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: { id: mockOutOfStock.id },
            data: { stock: 0 },
          }),
        );
        expect(resWithIgnoredStock.stock).toBe(0);
      }
    });

    it('(b) ném 400 BadRequestException (message là mảng chuỗi tiếng Anh) khi thiếu isAvailable, isAvailable không phải boolean, hoặc isAvailable = true nhưng thiếu stock / stock = 0 / stock = 10000 / stock không phải số nguyên', async () => {
      const invalidPayloads = [
        {},
        { isAvailable: 'true', stock: 10 },
        { isAvailable: 1, stock: 10 },
        { isAvailable: null, stock: 10 },
        { isAvailable: true },
        { isAvailable: true, stock: 0 },
        { isAvailable: true, stock: -1 },
        { isAvailable: true, stock: 10000 },
        { isAvailable: true, stock: 12.5 },
        { isAvailable: true, stock: '50' },
        { isAvailable: true, stock: null },
      ];

      for (const payload of invalidPayloads) {
        try {
          await pipe.transform(payload, {
            type: 'body',
            metatype: UpdateProductAvailabilityDto,
          });
          fail(
            `Expected ValidationPipe to reject payload: ${JSON.stringify(payload)}`,
          );
        } catch (err) {
          expect(err).toBeInstanceOf(BadRequestException);
          const response = (err as BadRequestException).getResponse() as {
            message: unknown;
          };
          expect(Array.isArray(response.message)).toBe(true);
        }
      }

      const validTrueMin = (await pipe.transform(
        { isAvailable: true, stock: 1 },
        { type: 'body', metatype: UpdateProductAvailabilityDto },
      )) as UpdateProductAvailabilityDto;
      expect(validTrueMin).toEqual({ isAvailable: true, stock: 1 });

      const validTrueMax = (await pipe.transform(
        { isAvailable: true, stock: 9999 },
        { type: 'body', metatype: UpdateProductAvailabilityDto },
      )) as UpdateProductAvailabilityDto;
      expect(validTrueMax).toEqual({ isAvailable: true, stock: 9999 });
    });

    it('ném 404 "Không tìm thấy sản phẩm" khi id không tồn tại hoặc không phải UUID', async () => {
      await expect(
        service.updateAvailability('not-a-uuid', true, 10),
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

  describe('create (POST /products)', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });

    it('(d) tạo món hợp lệ: không gửi stock thì mặc định stock = 50; có gửi stock (0..9999) thì lưu đúng; isVisible = true, id tự sinh và bỏ qua id/isVisible từ client', async () => {
      const generatedId = '77777777-0000-0000-0000-000000000001';
      prisma.product.create.mockResolvedValueOnce({
        id: generatedId,
        name: 'Trà vải hoa hồng',
        category: Category.TEA,
        basePrice: 45000,
        imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
        stock: 50,
        isVisible: true,
      });

      const dtoWithoutStock = (await pipe.transform(
        {
          id: 'client-id-should-be-stripped',
          isVisible: false,
          name: '  Trà vải hoa hồng  ',
          category: 'TEA',
          basePrice: 45000,
          imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
        },
        { type: 'body', metatype: CreateProductDto },
      )) as CreateProductDto;

      expect(dtoWithoutStock).not.toHaveProperty('id');
      expect(dtoWithoutStock.stock).toBeUndefined();
      expect(dtoWithoutStock).not.toHaveProperty('isVisible');

      const resultDefaultStock = await controller.create(dtoWithoutStock);

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          name: 'Trà vải hoa hồng',
          category: Category.TEA,
          basePrice: 45000,
          imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
          stock: 50,
          isVisible: true,
        },
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
      expect(resultDefaultStock).toEqual({
        id: generatedId,
        name: 'Trà vải hoa hồng',
        category: Category.TEA,
        basePrice: 45000,
        imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
        stock: 50,
        isVisible: true,
      });

      // Có gửi stock (ví dụ 0 và 120) -> lưu đúng stock
      for (const customStock of [0, 120, 9999]) {
        prisma.product.create.mockResolvedValueOnce({
          id: generatedId,
          name: 'Trà vải hoa hồng',
          category: Category.TEA,
          basePrice: 45000,
          imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
          stock: customStock,
          isVisible: true,
        });

        const dtoWithStock = (await pipe.transform(
          {
            name: 'Trà vải hoa hồng',
            category: 'TEA',
            basePrice: 45000,
            imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
            stock: customStock,
          },
          { type: 'body', metatype: CreateProductDto },
        )) as CreateProductDto;

        expect(dtoWithStock.stock).toBe(customStock);

        const resCustomStock = await controller.create(dtoWithStock);
        expect(prisma.product.create).toHaveBeenLastCalledWith({
          data: {
            name: 'Trà vải hoa hồng',
            category: Category.TEA,
            basePrice: 45000,
            imageUrl: 'https://images.unsplash.com/photo-tra-vai?w=500',
            stock: customStock,
            isVisible: true,
          },
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
        expect(resCustomStock.stock).toBe(customStock);
      }
    });

    it('gán ảnh mặc định DEFAULT_PRODUCT_IMAGE_URL khi imageUrl bỏ trống hoặc chuỗi rỗng', async () => {
      prisma.product.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: '77777777-0000-0000-0000-000000000002',
            ...data,
          }),
      );

      for (const emptyImage of [undefined, '', '   ']) {
        const dto = (await pipe.transform(
          {
            name: 'Món thử không ảnh',
            category: Category.COFFEE,
            basePrice: 30000,
            ...(emptyImage !== undefined ? { imageUrl: emptyImage } : {}),
          },
          { type: 'body', metatype: CreateProductDto },
        )) as CreateProductDto;

        const result = await controller.create(dto);
        expect(result.imageUrl).toBe(DEFAULT_PRODUCT_IMAGE_URL);
      }
    });

    it('(d) ném 400 với mảng message tiếng Anh khi dữ liệu không hợp lệ (tên rỗng/quá dài, category sai, giá ngoài 1.000..1.000.000 hoặc không nguyên, link ảnh không phải http/https hoặc quá 500 ký tự, stock ngoài 0..9999 hoặc không nguyên)', async () => {
      const validBase = {
        name: 'Cà phê muối',
        category: Category.COFFEE,
        basePrice: 35000,
      };

      const invalidPayloads = [
        { ...validBase, name: '' },
        { ...validBase, name: '   ' },
        { ...validBase, name: 'a'.repeat(101) },
        { ...validBase, category: 'SMOOTHIE' },
        { ...validBase, basePrice: 999 },
        { ...validBase, basePrice: 1000001 },
        { ...validBase, basePrice: 29500.5 },
        { ...validBase, basePrice: '35000' },
        { ...validBase, imageUrl: 'ftp://example.com/img.jpg' },
        { ...validBase, imageUrl: 'not-a-url' },
        {
          ...validBase,
          imageUrl: 'https://example.com/' + 'a'.repeat(490),
        },
        { ...validBase, stock: -1 },
        { ...validBase, stock: 10000 },
        { ...validBase, stock: 10.5 },
        { ...validBase, stock: '50' },
      ];

      for (const payload of invalidPayloads) {
        try {
          await pipe.transform(payload, {
            type: 'body',
            metatype: CreateProductDto,
          });
          fail(
            `Expected ValidationPipe to reject payload: ${JSON.stringify(payload)}`,
          );
        } catch (err) {
          expect(err).toBeInstanceOf(BadRequestException);
          const response = (err as BadRequestException).getResponse() as {
            message: unknown;
          };
          expect(Array.isArray(response.message)).toBe(true);
        }
      }
    });
  });

  describe('update (PATCH /products/:id)', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });
    const productId = '11111111-0000-0000-0000-000000000001';

    it('cập nhật ẩn/hiện bằng isVisible và sửa được cả món đang ẩn, không cho sửa stock qua endpoint này', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId });
      prisma.product.update.mockResolvedValueOnce({
        ...mockCoffee,
        isVisible: false,
      });

      const hideDto = (await pipe.transform(
        { isVisible: false, stock: 0 },
        { type: 'body', metatype: UpdateProductDto },
      )) as UpdateProductDto;

      expect(hideDto).toEqual({ isVisible: false });
      expect(hideDto).not.toHaveProperty('stock');

      const hiddenResult = await controller.update(productId, hideDto);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { isVisible: false },
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
      expect(hiddenResult.isVisible).toBe(false);

      // Món đang ẩn vẫn sửa tên, giá và bật lại isVisible = true được
      prisma.product.update.mockResolvedValueOnce({
        ...mockCoffee,
        name: 'Cà phê sữa đá đặc biệt',
        basePrice: 32000,
        isVisible: true,
      });

      const showAndEditDto = (await pipe.transform(
        {
          name: 'Cà phê sữa đá đặc biệt',
          basePrice: 32000,
          isVisible: true,
        },
        { type: 'body', metatype: UpdateProductDto },
      )) as UpdateProductDto;

      const updatedResult = await controller.update(productId, showAndEditDto);
      expect(prisma.product.update).toHaveBeenLastCalledWith({
        where: { id: productId },
        data: {
          name: 'Cà phê sữa đá đặc biệt',
          basePrice: 32000,
          isVisible: true,
        },
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
      expect(updatedResult.isVisible).toBe(true);
      expect(updatedResult.basePrice).toBe(32000);
    });

    it('gán lại ảnh mặc định khi truyền imageUrl rỗng trong PATCH', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId });
      prisma.product.update.mockResolvedValue({
        ...mockCoffee,
        imageUrl: DEFAULT_PRODUCT_IMAGE_URL,
        isVisible: true,
      });

      const dto = (await pipe.transform(
        { imageUrl: '' },
        { type: 'body', metatype: UpdateProductDto },
      )) as UpdateProductDto;

      const result = await controller.update(productId, dto);

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId },
          data: { imageUrl: DEFAULT_PRODUCT_IMAGE_URL },
        }),
      );
      expect(result.imageUrl).toBe(DEFAULT_PRODUCT_IMAGE_URL);
    });

    it('ném 400 BadRequestException khi PATCH gửi body rỗng hoặc chỉ gửi trường không hợp lệ (như stock)', async () => {
      const emptyDto = (await pipe.transform(
        { stock: 123 },
        { type: 'body', metatype: UpdateProductDto },
      )) as UpdateProductDto;

      await expect(controller.update(productId, emptyDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('ném 400 khi trường cập nhật sai ràng buộc và ném 404 "Không tìm thấy sản phẩm" khi id không tồn tại', async () => {
      await expect(
        pipe.transform(
          { basePrice: 500 },
          { type: 'body', metatype: UpdateProductDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.update('invalid-uuid', { name: 'Món mới' }),
      ).rejects.toThrow(new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE));

      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        controller.update('99999999-0000-0000-0000-000000000099', {
          name: 'Món mới',
        }),
      ).rejects.toThrow(new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE));
    });
  });

  describe('Guards trên GET /products/manage, PATCH /products/:id/availability, POST /products và PATCH /products/:id', () => {
    let jwtService: { verifyAsync: jest.Mock };
    let jwtGuard: JwtAuthGuard;
    let rolesGuard: RolesGuard;

    const createContext = (
      methodName:
        'findAllForManage' | 'updateAvailability' | 'create' | 'update',
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

    it('POST /products và PATCH /products/:id: chưa đăng nhập 401, STAFF 403, CUSTOMER 403, ADMIN bị khóa 403, chỉ ADMIN đang hoạt động qua được', async () => {
      for (const method of ['create', 'update'] as const) {
        // 1. Chưa đăng nhập -> 401
        const unauthCtx = createContext(method, undefined);
        await expect(jwtGuard.canActivate(unauthCtx)).rejects.toThrow(
          new UnauthorizedException(
            'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
          ),
        );

        // 2. CUSTOMER -> 403 sai vai trò
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '44444444-0000-0000-0000-000000000001',
          email: 'khach@example.com',
          role: Role.CUSTOMER,
        });
        const customerCtx = createContext(method, 'Bearer customer-token');
        await jwtGuard.canActivate(customerCtx);
        await expect(rolesGuard.canActivate(customerCtx)).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 3. STAFF -> 403 sai vai trò
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '55555555-0000-0000-0000-000000000001',
          email: 'nhanvien1@example.com',
          role: Role.STAFF,
        });
        const staffCtx = createContext(method, 'Bearer staff-token');
        await jwtGuard.canActivate(staffCtx);
        await expect(rolesGuard.canActivate(staffCtx)).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 4. ADMIN bị khóa -> 403 tài khoản bị khóa
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '66666666-0000-0000-0000-000000000001',
          email: 'quanly@example.com',
          role: Role.ADMIN,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: false });
        const lockedAdminCtx = createContext(
          method,
          'Bearer locked-admin-token',
        );
        await jwtGuard.canActivate(lockedAdminCtx);
        await expect(rolesGuard.canActivate(lockedAdminCtx)).rejects.toThrow(
          new ForbiddenException('Tài khoản đã bị khóa'),
        );

        // 5. ADMIN đang hoạt động -> qua được
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '66666666-0000-0000-0000-000000000001',
          email: 'quanly@example.com',
          role: Role.ADMIN,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: true });
        const activeAdminCtx = createContext(
          method,
          'Bearer active-admin-token',
        );
        expect(await jwtGuard.canActivate(activeAdminCtx)).toBe(true);
        expect(await rolesGuard.canActivate(activeAdminCtx)).toBe(true);
      }
    });
  });
});
