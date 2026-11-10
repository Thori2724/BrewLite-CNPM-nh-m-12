import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DRINK_ICE_LEVELS,
  DRINK_SIZES,
  DRINK_SUGAR_LEVELS,
  INVALID_CATEGORY_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
} from './products.constants';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    topping: {
      findMany: jest.Mock;
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
      },
      topping: {
        findMany: jest.fn().mockResolvedValue(mockToppings),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
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

    it('tìm kiếm q có dấu và không phân biệt hoa/thường, bỏ qua q toàn khoảng trắng', async () => {
      prisma.product.findMany.mockResolvedValue([mockCoffee]);

      await service.findAll({ q: '  CÀ PHÊ  ' });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isVisible: true,
            name: { contains: 'CÀ PHÊ', mode: 'insensitive' },
          },
        }),
      );

      await service.findAll({ q: '   ' });
      expect(prisma.product.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { isVisible: true },
        }),
      );
    });

    it('kết hợp lọc category và tìm kiếm q', async () => {
      prisma.product.findMany.mockResolvedValue([mockCoffee]);

      await service.findAll({ category: 'COFFEE', q: 'sữa đá' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isVisible: true,
            category: Category.COFFEE,
            name: { contains: 'sữa đá', mode: 'insensitive' },
          },
        }),
      );
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
});
