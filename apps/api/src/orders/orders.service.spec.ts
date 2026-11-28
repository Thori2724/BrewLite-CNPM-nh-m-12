import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  IceLevel,
  LoyaltyType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PromotionType,
  ReceiveType,
  Role,
  Size,
  SugarLevel,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ORDER_NOT_FOUND_MESSAGE } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_NOT_FOUND_MESSAGE } from '../products/products.constants';
import {
  PROMOTION_CODE_NOT_FOUND_MESSAGE,
  PROMOTION_INACTIVE_MESSAGE,
} from '../promotions/promotions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersController } from './orders.controller';
import {
  INSUFFICIENT_POINTS_MESSAGE,
  INVALID_ORDER_STATUS_MESSAGE,
  ORDER_CANNOT_CANCEL_MESSAGE,
  ORDER_STATUS_CHANGED_MESSAGE,
  ORDER_STATUS_LABELS,
  OrdersService,
  TOPPING_NOT_FOUND_MESSAGE,
} from './orders.service';

describe('Orders (OrdersService & CreateOrderDto)', () => {
  let service: OrdersService;
  let controller: OrdersController;
  let txMock: {
    promotion: {
      findUnique: jest.Mock;
    };
    product: {
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    loyaltyTransaction: {
      create: jest.Mock;
    };
    order: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    orderItem: {
      create: jest.Mock;
    };
    orderItemTopping: {
      create: jest.Mock;
    };
  };
  let prisma: {
    product: {
      findMany: jest.Mock;
    };
    topping: {
      findMany: jest.Mock;
    };
    order: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    payment: {
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const USER_ID = '99999999-0000-0000-0000-000000000001';

  const mockMilkTea = {
    id: '11111111-0000-0000-0000-000000000007',
    name: 'Trà sữa truyền thống',
    category: Category.MILK_TEA,
    basePrice: 35000,
    stock: 50,
  };

  const mockCake = {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: Category.CAKE,
    basePrice: 30000,
    stock: 20,
  };

  const mockPearlTopping = {
    id: '22222222-0000-0000-0000-000000000001',
    name: 'Trân châu đen',
    price: 5000,
  };

  const mockCoconutTopping = {
    id: '22222222-0000-0000-0000-000000000002',
    name: 'Thạch dừa',
    price: 5000,
  };

  const mockPuddingTopping = {
    id: '22222222-0000-0000-0000-000000000003',
    name: 'Pudding',
    price: 7000,
  };

  beforeEach(async () => {
    let itemCounter = 0;
    txMock = {
      promotion: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ loyaltyPoints: 50 }),
        update: jest.fn().mockResolvedValue({ id: USER_ID, loyaltyPoints: 60 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ revoked: 0 }]),
      loyaltyTransaction: {
        create: jest.fn().mockResolvedValue({
          id: '66666666-0000-0000-0000-000000000001',
        }),
      },
      order: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: '33333333-0000-0000-0000-000000000001',
              orderNumber: 1001,
              userId: data.userId,
              status: data.status,
              receiveType: data.receiveType,
              note: data.note,
              subtotalAmount: data.subtotalAmount,
              discountAmount: data.discountAmount,
              promotionCode: data.promotionCode,
              pointsUsed: data.pointsUsed,
              pointsEarned: data.pointsEarned,
              totalAmount: data.totalAmount,
              createdAt: new Date('2026-11-05T03:00:00.000Z'),
              updatedAt: new Date('2026-11-05T03:00:00.000Z'),
            }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            itemCounter += 1;
            return Promise.resolve({
              id: `88888888-0000-0000-0000-00000000000${itemCounter}`,
              ...data,
            });
          }),
      },
      orderItemTopping: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: '77777777-0000-0000-0000-000000000001',
              ...data,
            }),
          ),
      },
    };

    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([mockMilkTea, mockCake]),
      },
      topping: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            mockPearlTopping,
            mockCoconutTopping,
            mockPuddingTopping,
          ]),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) =>
          cb(txMock),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    controller = new OrdersController(service);
  });

  describe('1. DTO Validation (CreateOrderDto)', () => {
    const validItem = {
      productId: mockMilkTea.id,
      quantity: 1,
    };

    it('từ chối khi items rỗng hoặc nhiều hơn 20 dòng', async () => {
      const emptyErrors = await validate(
        plainToInstance(CreateOrderDto, { items: [] }),
      );
      expect(emptyErrors.some((e) => e.property === 'items')).toBe(true);

      const tooManyItems = Array.from({ length: 21 }, () => ({ ...validItem }));
      const maxErrors = await validate(
        plainToInstance(CreateOrderDto, { items: tooManyItems }),
      );
      expect(maxErrors.some((e) => e.property === 'items')).toBe(true);
    });

    it('từ chối khi quantity = 0 hoặc quantity = 11', async () => {
      const qtyZeroErrors = await validate(
        plainToInstance(CreateOrderDto, {
          items: [{ ...validItem, quantity: 0 }],
        }),
      );
      expect(qtyZeroErrors.length).toBeGreaterThan(0);

      const qtyElevenErrors = await validate(
        plainToInstance(CreateOrderDto, {
          items: [{ ...validItem, quantity: 11 }],
        }),
      );
      expect(qtyElevenErrors.length).toBeGreaterThan(0);
    });

    it('từ chối khi toppingIds có hơn 3 phần tử hoặc bị trùng nhau', async () => {
      const fourToppingsErrors = await validate(
        plainToInstance(CreateOrderDto, {
          items: [
            {
              ...validItem,
              toppingIds: [
                '22222222-0000-0000-0000-000000000001',
                '22222222-0000-0000-0000-000000000002',
                '22222222-0000-0000-0000-000000000003',
                '22222222-0000-0000-0000-000000000004',
              ],
            },
          ],
        }),
      );
      expect(fourToppingsErrors.length).toBeGreaterThan(0);

      const duplicateToppingsErrors = await validate(
        plainToInstance(CreateOrderDto, {
          items: [
            {
              ...validItem,
              toppingIds: [
                '22222222-0000-0000-0000-000000000001',
                '22222222-0000-0000-0000-000000000001',
              ],
            },
          ],
        }),
      );
      expect(duplicateToppingsErrors.length).toBeGreaterThan(0);
    });

    it('từ chối khi note đơn hoặc note món vượt quá 200 ký tự', async () => {
      const longNote = 'a'.repeat(201);

      const orderNoteErrors = await validate(
        plainToInstance(CreateOrderDto, {
          note: longNote,
          items: [validItem],
        }),
      );
      expect(orderNoteErrors.some((e) => e.property === 'note')).toBe(true);

      const itemNoteErrors = await validate(
        plainToInstance(CreateOrderDto, {
          items: [{ ...validItem, note: longNote }],
        }),
      );
      expect(itemNoteErrors.length).toBeGreaterThan(0);
    });

    it('từ chối khi productId không phải UUID hoặc size/sugarLevel/iceLevel/receiveType sai giá trị', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      });

      let caughtError: unknown;
      try {
        await pipe.transform(
          {
            receiveType: 'DELIVERY',
            items: [
              {
                productId: 'not-a-uuid',
                quantity: 1,
                size: 'XL',
                sugarLevel: 'P200',
                iceLevel: 'EXTRA',
              },
            ],
          },
          { type: 'body', metatype: CreateOrderDto },
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const response = (caughtError as BadRequestException).getResponse() as {
        statusCode: number;
        message: string[];
      };
      expect(response.statusCode).toBe(400);
      expect(Array.isArray(response.message)).toBe(true);
      expect(response.message.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('2. Tính tiền chuẩn hợp đồng & bỏ qua giá từ client', () => {
    it('tính đúng 53.000 x 2 + 30.000 = 136.000 theo ví dụ hợp đồng và không đọc unitPrice/totalAmount từ client', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      });

      const rawPayload = {
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Cho xin thêm quai xách giấy',
        totalAmount: 1,
        items: [
          {
            productId: mockMilkTea.id,
            quantity: 2,
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            toppingIds: [mockPearlTopping.id, mockPuddingTopping.id],
            note: 'Ít ngọt vừa phải',
            unitPrice: 1000,
            lineTotal: 2000,
          },
          {
            productId: mockCake.id,
            quantity: 1,
            note: 'Hâm nóng bánh giúp mình',
            unitPrice: 1000,
            lineTotal: 1000,
          },
        ],
      };

      const dto = (await pipe.transform(rawPayload, {
        type: 'body',
        metatype: CreateOrderDto,
      })) as CreateOrderDto;

      const result = await service.create(USER_ID, dto);

      expect(result).toEqual({
        id: '33333333-0000-0000-0000-000000000001',
        orderNumber: 1001,
        status: OrderStatus.PENDING,
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Cho xin thêm quai xách giấy',
        subtotalAmount: 136000,
        discountAmount: 0,
        promotionCode: null,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 136000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        items: [
          {
            id: '88888888-0000-0000-0000-000000000001',
            productId: mockMilkTea.id,
            productName: 'Trà sữa truyền thống',
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            quantity: 2,
            unitPrice: 53000,
            lineTotal: 106000,
            note: 'Ít ngọt vừa phải',
            toppings: [
              { id: mockPearlTopping.id, name: 'Trân châu đen', price: 5000 },
              { id: mockPuddingTopping.id, name: 'Pudding', price: 7000 },
            ],
          },
          {
            id: '88888888-0000-0000-0000-000000000002',
            productId: mockCake.id,
            productName: 'Bánh Croissant',
            size: null,
            sugarLevel: null,
            iceLevel: null,
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            note: 'Hâm nóng bánh giúp mình',
            toppings: [],
          },
        ],
      });
      expect(result).not.toHaveProperty('userId');
    });
  });

  describe('3. Giá trị mặc định cho món nước và đơn hàng', () => {
    it('gán mặc định size S, sugarLevel P100, iceLevel NORMAL cho món nước và receiveType AT_COUNTER', async () => {
      prisma.product.findMany.mockResolvedValue([mockMilkTea]);

      const result = await service.create(USER_ID, {
        items: [
          {
            productId: mockMilkTea.id,
            quantity: 1,
          },
        ],
      });

      expect(result.receiveType).toBe(ReceiveType.AT_COUNTER);
      expect(result.note).toBeNull();
      expect(result.items[0]).toMatchObject({
        productId: mockMilkTea.id,
        size: Size.S,
        sugarLevel: SugarLevel.P100,
        iceLevel: IceLevel.NORMAL,
        unitPrice: 35000,
        lineTotal: 35000,
        note: null,
        toppings: [],
      });
    });
  });

  describe('4. Ràng buộc món CAKE', () => {
    it('ném 400 với message là mảng chuỗi tiếng Anh khi món CAKE gửi kèm size/sugarLevel/iceLevel/toppingIds', async () => {
      prisma.product.findMany.mockResolvedValue([mockCake]);

      let caughtError: unknown;
      try {
        await service.create(USER_ID, {
          items: [
            {
              productId: mockCake.id,
              quantity: 1,
              size: Size.M,
              sugarLevel: SugarLevel.P50,
              iceLevel: IceLevel.LOW,
              toppingIds: [mockPearlTopping.id],
            },
          ],
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const response = (caughtError as BadRequestException).getResponse() as {
        statusCode: number;
        message: string[];
      };
      expect(response.statusCode).toBe(400);
      expect(Array.isArray(response.message)).toBe(true);
      expect(response.message).toEqual([
        'size is not allowed for CAKE products',
        'sugarLevel is not allowed for CAKE products',
        'iceLevel is not allowed for CAKE products',
        'toppingIds is not allowed for CAKE products',
      ]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lưu size = null, sugarLevel = null, iceLevel = null và toppings = [] cho món CAKE hợp lệ', async () => {
      prisma.product.findMany.mockResolvedValue([mockCake]);

      const result = await service.create(USER_ID, {
        items: [
          {
            productId: mockCake.id,
            quantity: 2,
          },
        ],
      });

      expect(result.items[0]).toMatchObject({
        productId: mockCake.id,
        size: null,
        sugarLevel: null,
        iceLevel: null,
        toppings: [],
        unitPrice: 30000,
        lineTotal: 60000,
      });
    });
  });

  describe('5. Không tìm thấy hoặc bị ẩn (404 NotFoundException)', () => {
    it('ném 404 "Không tìm thấy sản phẩm" khi productId không tồn tại hoặc isVisible = false', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await expect(
        service.create(USER_ID, {
          items: [
            {
              productId: '11111111-0000-0000-0000-000000000099',
              quantity: 1,
            },
          ],
        }),
      ).rejects.toThrow(new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE));
    });

    it('ném 404 "Không tìm thấy topping" khi toppingId không tồn tại hoặc isVisible = false', async () => {
      prisma.product.findMany.mockResolvedValue([mockMilkTea]);
      prisma.topping.findMany.mockResolvedValue([]);

      await expect(
        service.create(USER_ID, {
          items: [
            {
              productId: mockMilkTea.id,
              quantity: 1,
              toppingIds: ['22222222-0000-0000-0000-000000000099'],
            },
          ],
        }),
      ).rejects.toThrow(new NotFoundException(TOPPING_NOT_FOUND_MESSAGE));
    });
  });

  describe('6 & 7. Trừ kho có điều kiện, gộp theo productId và rollback khi không đủ hàng (409 Conflict)', () => {
    it('(a) đặt đơn thành công trừ đúng số lượng từng món bằng câu cập nhật có điều kiện stock >= số lượng cần', async () => {
      prisma.product.findMany.mockResolvedValue([mockMilkTea, mockCake]);

      const result = await service.create(USER_ID, {
        items: [
          {
            productId: mockMilkTea.id,
            quantity: 3,
            size: Size.M,
          },
          {
            productId: mockCake.id,
            quantity: 2,
          },
        ],
      });

      expect(result.id).toBe('33333333-0000-0000-0000-000000000001');
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(txMock.product.updateMany).toHaveBeenCalledTimes(2);
      expect(txMock.product.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: mockMilkTea.id,
          isVisible: true,
          stock: { gte: 3 },
        },
        data: {
          stock: { decrement: 3 },
        },
      });
      expect(txMock.product.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: mockCake.id,
          isVisible: true,
          stock: { gte: 2 },
        },
        data: {
          stock: { decrement: 2 },
        },
      });
      expect(txMock.order.create).toHaveBeenCalledTimes(1);
      expect(txMock.orderItem.create).toHaveBeenCalledTimes(2);
    });

    it('(b) cùng một món nhưng khác size ở nhiều dòng được gộp số lượng khi trừ kho', async () => {
      prisma.product.findMany.mockResolvedValue([mockMilkTea]);

      const result = await service.create(USER_ID, {
        items: [
          {
            productId: mockMilkTea.id,
            quantity: 2,
            size: Size.S,
          },
          {
            productId: mockMilkTea.id,
            quantity: 3,
            size: Size.L,
          },
        ],
      });

      expect(result.id).toBe('33333333-0000-0000-0000-000000000001');
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(txMock.product.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockMilkTea.id,
          isVisible: true,
          stock: { gte: 5 },
        },
        data: {
          stock: { decrement: 5 },
        },
      });
      expect(txMock.order.create).toHaveBeenCalledTimes(1);
      expect(txMock.orderItem.create).toHaveBeenCalledTimes(2);
    });

    it('(b & c) cùng 1 món khác size có tổng vượt kho: trả 409 "Sản phẩm \'X\' chỉ còn N" kèm details có available và không tạo đơn', async () => {
      prisma.product.findMany.mockResolvedValue([mockMilkTea]);
      txMock.product.updateMany.mockResolvedValueOnce({ count: 0 });
      txMock.product.findMany.mockResolvedValueOnce([
        {
          id: mockMilkTea.id,
          name: mockMilkTea.name,
          stock: 4,
        },
      ]);

      let caughtError: unknown;
      try {
        await service.create(USER_ID, {
          items: [
            { productId: mockMilkTea.id, quantity: 2, size: Size.S },
            { productId: mockMilkTea.id, quantity: 3, size: Size.L },
          ],
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      expect((caughtError as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: "Sản phẩm 'Trà sữa truyền thống' chỉ còn 4",
        error: 'Conflict',
        details: [
          {
            productId: mockMilkTea.id,
            name: 'Trà sữa truyền thống',
            available: 4,
          },
        ],
      });
      expect(txMock.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockMilkTea.id,
          isVisible: true,
          stock: { gte: 5 },
        },
        data: {
          stock: { decrement: 5 },
        },
      });
      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.orderItem.create).not.toHaveBeenCalled();
    });

    it('(c) từ chối cả đơn trong transaction với 409 "Sản phẩm \'X\' hiện đã tạm hết" kèm details có available = 0 khi món hết hàng', async () => {
      const mockOutOfStock = {
        id: '11111111-0000-0000-0000-000000000003',
        name: 'Bạc xỉu',
        category: Category.COFFEE,
        basePrice: 32000,
        stock: 0,
      };
      prisma.product.findMany.mockResolvedValue([mockMilkTea, mockOutOfStock]);
      txMock.product.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      txMock.product.findMany.mockResolvedValueOnce([
        {
          id: mockOutOfStock.id,
          name: mockOutOfStock.name,
          stock: 0,
        },
      ]);

      let caughtError: unknown;
      try {
        await service.create(USER_ID, {
          items: [
            { productId: mockMilkTea.id, quantity: 1 },
            { productId: mockOutOfStock.id, quantity: 1 },
          ],
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      expect((caughtError as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: "Sản phẩm 'Bạc xỉu' hiện đã tạm hết",
        error: 'Conflict',
        details: [
          {
            productId: mockOutOfStock.id,
            name: 'Bạc xỉu',
            available: 0,
          },
        ],
      });
      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.orderItem.create).not.toHaveBeenCalled();
    });

    it('(c) liệt kê TẤT CẢ món thiếu trong details (available > 0 và available = 0), message nói về món thiếu đầu tiên và không tạo đơn nào', async () => {
      const mockBacXiu = {
        id: '11111111-0000-0000-0000-000000000003',
        name: 'Bạc xỉu',
        category: Category.COFFEE,
        basePrice: 32000,
        stock: 2,
      };
      const mockMatcha = {
        id: '11111111-0000-0000-0000-000000000008',
        name: 'Trà sữa matcha',
        category: Category.MILK_TEA,
        basePrice: 39000,
        stock: 0,
      };
      prisma.product.findMany.mockResolvedValue([
        mockMilkTea,
        mockBacXiu,
        mockMatcha,
      ]);
      txMock.product.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      txMock.product.findMany.mockResolvedValueOnce([
        {
          id: mockBacXiu.id,
          name: mockBacXiu.name,
          stock: 2,
        },
        {
          id: mockMatcha.id,
          name: mockMatcha.name,
          stock: 0,
        },
      ]);

      let caughtError: unknown;
      try {
        await service.create(USER_ID, {
          items: [
            { productId: mockBacXiu.id, quantity: 3 },
            { productId: mockMilkTea.id, quantity: 2 },
            { productId: mockMatcha.id, quantity: 1 },
          ],
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      expect((caughtError as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: "Sản phẩm 'Bạc xỉu' chỉ còn 2",
        error: 'Conflict',
        details: [
          {
            productId: mockBacXiu.id,
            name: 'Bạc xỉu',
            available: 2,
          },
          {
            productId: mockMatcha.id,
            name: 'Trà sữa matcha',
            available: 0,
          },
        ],
      });
      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.orderItem.create).not.toHaveBeenCalled();
    });
  });

  describe('8. GET /orders/me (findMyOrders)', () => {
    const mockDbOrders = [
      {
        id: '33333333-0000-0000-0000-000000000002',
        orderNumber: 1002,
        userId: USER_ID,
        status: OrderStatus.PAID,
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Cho xin thêm quai xách giấy',
        totalAmount: 136000,
        createdAt: new Date('2026-11-05T03:05:00.000Z'),
        updatedAt: new Date('2026-11-05T03:05:00.000Z'),
        items: [
          {
            id: '88888888-0000-0000-0000-000000000001',
            orderId: '33333333-0000-0000-0000-000000000002',
            productId: mockMilkTea.id,
            productName: mockMilkTea.name,
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            quantity: 2,
            unitPrice: 53000,
            lineTotal: 106000,
            note: 'Ít ngọt vừa phải',
            toppings: [
              {
                id: '77777777-0000-0000-0000-000000000001',
                orderItemId: '88888888-0000-0000-0000-000000000001',
                toppingId: mockPearlTopping.id,
                name: mockPearlTopping.name,
                price: mockPearlTopping.price,
              },
              {
                id: '77777777-0000-0000-0000-000000000002',
                orderItemId: '88888888-0000-0000-0000-000000000001',
                toppingId: mockPuddingTopping.id,
                name: mockPuddingTopping.name,
                price: mockPuddingTopping.price,
              },
            ],
          },
          {
            id: '88888888-0000-0000-0000-000000000002',
            orderId: '33333333-0000-0000-0000-000000000002',
            productId: mockCake.id,
            productName: mockCake.name,
            size: null,
            sugarLevel: null,
            iceLevel: null,
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            note: 'Hâm nóng bánh giúp mình',
            toppings: [],
          },
        ],
      },
      {
        id: '33333333-0000-0000-0000-000000000001',
        orderNumber: 1001,
        userId: USER_ID,
        status: OrderStatus.PENDING,
        receiveType: ReceiveType.AT_COUNTER,
        note: null,
        totalAmount: 30000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        updatedAt: new Date('2026-11-05T03:00:00.000Z'),
        items: [
          {
            id: '88888888-0000-0000-0000-000000000003',
            orderId: '33333333-0000-0000-0000-000000000001',
            productId: mockCake.id,
            productName: mockCake.name,
            size: null,
            sugarLevel: null,
            iceLevel: null,
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            note: null,
            toppings: [],
          },
        ],
      },
    ];

    it('lọc theo userId, sắp xếp createdAt desc rồi orderNumber desc, lấy trong 1 truy vấn kèm items.toppings, toppings[].id là toppingId, không có payments và userId', async () => {
      prisma.order.findMany.mockResolvedValue(mockDbOrders);

      const result = await controller.findMyOrders({
        user: {
          id: USER_ID,
          email: 'khach@example.com',
          role: 'CUSTOMER',
        },
      } as never);

      expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
        include: {
          items: {
            include: {
              toppings: true,
            },
          },
        },
      });

      expect(result).toHaveLength(2);
      expect(result[0].orderNumber).toBe(1002);
      expect(result[1].orderNumber).toBe(1001);
      expect(result[0]).not.toHaveProperty('payments');
      expect(result[0]).not.toHaveProperty('userId');
      expect(result[0].items[0].toppings).toEqual([
        { id: mockPearlTopping.id, name: 'Trân châu đen', price: 5000 },
        { id: mockPuddingTopping.id, name: 'Pudding', price: 7000 },
      ]);
      expect(result[0].items[0].toppings[0].id).not.toBe(
        '77777777-0000-0000-0000-000000000001',
      );
    });
  });

  describe('9. GET /orders/:id (findOneForUser)', () => {
    const ORDER_ID = '33333333-0000-0000-0000-000000000001';

    it('trả chi tiết đơn kèm payments sắp theo createdAt desc, failureReason null hoặc có giá trị, toppings[].id đúng, không lộ userId/idempotencyKey/amount', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: ORDER_ID,
        orderNumber: 1001,
        userId: USER_ID,
        status: OrderStatus.PAID,
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Cho xin thêm quai xách giấy',
        totalAmount: 136000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        updatedAt: new Date('2026-11-05T03:03:00.000Z'),
        items: [
          {
            id: '88888888-0000-0000-0000-000000000001',
            orderId: ORDER_ID,
            productId: mockMilkTea.id,
            productName: mockMilkTea.name,
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            quantity: 2,
            unitPrice: 53000,
            lineTotal: 106000,
            note: 'Ít ngọt vừa phải',
            toppings: [
              {
                id: '77777777-0000-0000-0000-000000000001',
                orderItemId: '88888888-0000-0000-0000-000000000001',
                toppingId: mockPearlTopping.id,
                name: mockPearlTopping.name,
                price: mockPearlTopping.price,
              },
            ],
          },
        ],
        payments: [
          {
            id: '44444444-0000-0000-0000-000000000002',
            orderId: ORDER_ID,
            userId: USER_ID,
            idempotencyKey: 'idem-order-1001-attempt-2',
            method: PaymentMethod.WALLET,
            accountLast4: '4321',
            amount: 136000,
            status: PaymentStatus.SUCCESS,
            failureReason: null,
            createdAt: new Date('2026-11-05T03:03:00.000Z'),
          },
          {
            id: '44444444-0000-0000-0000-000000000001',
            orderId: ORDER_ID,
            userId: USER_ID,
            idempotencyKey: 'idem-order-1001-attempt-1',
            method: PaymentMethod.WALLET,
            accountLast4: '0000',
            amount: 136000,
            status: PaymentStatus.FAILED,
            failureReason: 'Giao dịch bị từ chối (mô phỏng)',
            createdAt: new Date('2026-11-05T03:02:00.000Z'),
          },
        ],
      });

      const result = await controller.findOne(
        {
          user: {
            id: USER_ID,
            email: 'khach@example.com',
            role: 'CUSTOMER',
          },
        } as never,
        ORDER_ID,
      );

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          userId: USER_ID,
        },
        include: {
          items: {
            include: {
              toppings: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      expect(result).toEqual({
        id: ORDER_ID,
        orderNumber: 1001,
        status: OrderStatus.PAID,
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Cho xin thêm quai xách giấy',
        subtotalAmount: 136000,
        discountAmount: 0,
        promotionCode: null,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 136000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        items: [
          {
            id: '88888888-0000-0000-0000-000000000001',
            productId: mockMilkTea.id,
            productName: mockMilkTea.name,
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            quantity: 2,
            unitPrice: 53000,
            lineTotal: 106000,
            note: 'Ít ngọt vừa phải',
            toppings: [
              {
                id: mockPearlTopping.id,
                name: mockPearlTopping.name,
                price: mockPearlTopping.price,
              },
            ],
          },
        ],
        payments: [
          {
            id: '44444444-0000-0000-0000-000000000002',
            method: PaymentMethod.WALLET,
            accountLast4: '4321',
            status: PaymentStatus.SUCCESS,
            failureReason: null,
            createdAt: new Date('2026-11-05T03:03:00.000Z'),
          },
          {
            id: '44444444-0000-0000-0000-000000000001',
            method: PaymentMethod.WALLET,
            accountLast4: '0000',
            status: PaymentStatus.FAILED,
            failureReason: 'Giao dịch bị từ chối (mô phỏng)',
            createdAt: new Date('2026-11-05T03:02:00.000Z'),
          },
        ],
      });
      expect(result).not.toHaveProperty('userId');
      expect(result.payments[0]).not.toHaveProperty('idempotencyKey');
      expect(result.payments[0]).not.toHaveProperty('amount');
      expect(result.payments[0]).not.toHaveProperty('userId');
    });

    it('ném 404 "Không tìm thấy đơn hàng" khi đơn không tồn tại hoặc thuộc về người dùng khác', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneForUser(
          '99999999-0000-0000-0000-000000000099',
          ORDER_ID,
        ),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: ORDER_ID,
            userId: '99999999-0000-0000-0000-000000000099',
          },
        }),
      );
    });

    it('ném 404 "Không tìm thấy đơn hàng" và không gọi DB khi id không phải UUID hợp lệ', async () => {
      await expect(service.findOneForUser(USER_ID, 'abc')).rejects.toThrow(
        new NotFoundException(ORDER_NOT_FOUND_MESSAGE),
      );
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('10. GET /orders (findAllForStaff - STAFF & ADMIN)', () => {
    const CUSTOMER_1 = {
      id: '44444444-0000-0000-0000-000000000001',
      displayName: 'Khách demo',
      email: 'khach@example.com',
      passwordHash: '$2b$10$secretHashShouldNotLeak1',
      role: Role.CUSTOMER,
      isActive: true,
    };

    const CUSTOMER_2 = {
      id: '44444444-0000-0000-0000-000000000002',
      displayName: 'Nguyễn Văn An',
      email: 'nguyenan@gmail.com',
      passwordHash: '$2b$10$secretHashShouldNotLeak2',
      role: Role.CUSTOMER,
      isActive: true,
    };

    const mockStaffOrders = [
      {
        id: '33333333-0000-0000-0000-000000000002',
        orderNumber: 1002,
        userId: CUSTOMER_2.id,
        status: OrderStatus.PAID,
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Cho xin thêm quai xách giấy',
        totalAmount: 53000,
        createdAt: new Date('2026-11-05T03:05:00.000Z'),
        updatedAt: new Date('2026-11-05T03:05:00.000Z'),
        user: CUSTOMER_2,
        items: [
          {
            id: '88888888-0000-0000-0000-000000000001',
            orderId: '33333333-0000-0000-0000-000000000002',
            productId: mockMilkTea.id,
            productName: mockMilkTea.name,
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            quantity: 1,
            unitPrice: 53000,
            lineTotal: 53000,
            note: null,
            toppings: [
              {
                id: '77777777-0000-0000-0000-000000000001',
                orderItemId: '88888888-0000-0000-0000-000000000001',
                toppingId: mockPearlTopping.id,
                name: mockPearlTopping.name,
                price: mockPearlTopping.price,
              },
            ],
          },
        ],
      },
      {
        id: '33333333-0000-0000-0000-000000000001',
        orderNumber: 1001,
        userId: CUSTOMER_1.id,
        status: OrderStatus.PENDING,
        receiveType: ReceiveType.AT_COUNTER,
        note: null,
        totalAmount: 30000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        updatedAt: new Date('2026-11-05T03:00:00.000Z'),
        user: CUSTOMER_1,
        items: [
          {
            id: '88888888-0000-0000-0000-000000000002',
            orderId: '33333333-0000-0000-0000-000000000001',
            productId: mockCake.id,
            productName: mockCake.name,
            size: null,
            sugarLevel: null,
            iceLevel: null,
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            note: null,
            toppings: [],
          },
        ],
      },
    ];

    it('trả toàn bộ đơn của nhiều khách kèm customer { id, displayName, email }, mới nhất trước, và TUYỆT ĐỐI không lộ passwordHash', async () => {
      prisma.order.findMany.mockResolvedValue(mockStaffOrders);

      const result = await controller.findAll();

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
        include: {
          items: {
            include: {
              toppings: true,
            },
          },
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      });

      expect(result).toHaveLength(2);
      expect(result[0].orderNumber).toBe(1002);
      expect(result[0].customer).toEqual({
        id: CUSTOMER_2.id,
        displayName: CUSTOMER_2.displayName,
        email: CUSTOMER_2.email,
      });
      expect(result[1].orderNumber).toBe(1001);
      expect(result[1].customer).toEqual({
        id: CUSTOMER_1.id,
        displayName: CUSTOMER_1.displayName,
        email: CUSTOMER_1.email,
      });
      expect(result[0].customer).not.toHaveProperty('passwordHash');
      expect(result[1].customer).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toContain('secretHashShouldNotLeak');
    });

    it('lọc đúng theo query status hợp lệ', async () => {
      prisma.order.findMany.mockResolvedValue([mockStaffOrders[0]]);

      const result = await controller.findAll(OrderStatus.PAID);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: OrderStatus.PAID },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(OrderStatus.PAID);
    });

    it('ném 400 "Trạng thái không hợp lệ" khi query status sai giá trị', async () => {
      await expect(controller.findAll('INVALID_STATUS')).rejects.toThrow(
        new BadRequestException(INVALID_ORDER_STATUS_MESSAGE),
      );
      await expect(controller.findAll('')).rejects.toThrow(
        new BadRequestException(INVALID_ORDER_STATUS_MESSAGE),
      );
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('11. PATCH /orders/:id/status (updateStatus & UpdateOrderStatusDto)', () => {
    const ORDER_ID = '33333333-0000-0000-0000-000000000001';
    const CUSTOMER = {
      id: '44444444-0000-0000-0000-000000000001',
      displayName: 'Khách demo',
      email: 'khach@example.com',
      passwordHash: '$2b$10$secretHashShouldNotLeak',
    };

    const buildMockOrder = (status: OrderStatus) => ({
      id: ORDER_ID,
      orderNumber: 1001,
      userId: CUSTOMER.id,
      status,
      receiveType: ReceiveType.TAKE_AWAY,
      note: 'Ít đá',
      totalAmount: 40000,
      createdAt: new Date('2026-11-05T03:00:00.000Z'),
      updatedAt: new Date('2026-11-05T03:00:00.000Z'),
      user: CUSTOMER,
      items: [
        {
          id: '88888888-0000-0000-0000-000000000001',
          orderId: ORDER_ID,
          productId: mockMilkTea.id,
          productName: mockMilkTea.name,
          size: Size.S,
          sugarLevel: SugarLevel.P100,
          iceLevel: IceLevel.NORMAL,
          quantity: 1,
          unitPrice: 40000,
          lineTotal: 40000,
          note: null,
          toppings: [
            {
              id: '77777777-0000-0000-0000-000000000001',
              orderItemId: '88888888-0000-0000-0000-000000000001',
              toppingId: mockPearlTopping.id,
              name: mockPearlTopping.name,
              price: mockPearlTopping.price,
            },
          ],
        },
      ],
    });

    it('cho phép các chuyển trạng thái hợp lệ: PAID→PREPARING→READY→COMPLETED và hủy từ PENDING/PAYMENT_FAILED/PAID', async () => {
      const validTransitions: Array<
        [OrderStatus, UpdateOrderStatusDto['status']]
      > = [
        [OrderStatus.PAID, OrderStatus.PREPARING],
        [OrderStatus.PREPARING, OrderStatus.READY],
        [OrderStatus.READY, OrderStatus.COMPLETED],
        [OrderStatus.PENDING, OrderStatus.CANCELLED],
        [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
        [OrderStatus.PAID, OrderStatus.CANCELLED],
      ];

      for (const [fromStatus, toStatus] of validTransitions) {
        prisma.order.findFirst.mockResolvedValueOnce(
          buildMockOrder(fromStatus),
        );
        if (toStatus === OrderStatus.CANCELLED) {
          txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
        } else {
          prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });
        }

        const result = await controller.updateStatus(ORDER_ID, {
          status: toStatus,
        });

        const targetOrderUpdateMock =
          toStatus === OrderStatus.CANCELLED
            ? txMock.order.updateMany
            : prisma.order.updateMany;

        expect(targetOrderUpdateMock).toHaveBeenLastCalledWith({
          where: {
            id: ORDER_ID,
            status: fromStatus,
          },
          data: {
            status: toStatus,
          },
        });
        expect(result.status).toBe(toStatus);
        expect(result.customer).toEqual({
          id: CUSTOMER.id,
          displayName: CUSTOMER.displayName,
          email: CUSTOMER.email,
        });
        expect(result.customer).not.toHaveProperty('passwordHash');
      }
    });

    it('(b) nhân viên hủy đơn PAID qua PATCH /orders/:id/status hoàn đúng số lượng vào kho trong cùng transaction', async () => {
      const paidOrder = {
        ...buildMockOrder(OrderStatus.PAID),
        items: [
          {
            ...buildMockOrder(OrderStatus.PAID).items[0],
            quantity: 3,
          },
        ],
      };
      prisma.order.findFirst.mockResolvedValueOnce(paidOrder);
      txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await controller.updateStatus(ORDER_ID, {
        status: OrderStatus.CANCELLED,
      });

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          status: OrderStatus.PAID,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
      expect(txMock.product.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: mockMilkTea.id },
        data: { stock: { increment: 3 } },
      });
    });

    it('từ chối các chuyển sai (lùi, bỏ bước, từ COMPLETED/CANCELLED, hủy từ PREPARING/READY) bằng 409 kèm nhãn tiếng Việt mục 9.3', async () => {
      const invalidTransitions: Array<
        [OrderStatus, UpdateOrderStatusDto['status']]
      > = [
        // Lùi trạng thái
        [OrderStatus.READY, OrderStatus.PREPARING],
        [OrderStatus.COMPLETED, OrderStatus.READY],
        // Bỏ bước
        [OrderStatus.PAID, OrderStatus.READY],
        [OrderStatus.PAID, OrderStatus.COMPLETED],
        [OrderStatus.PREPARING, OrderStatus.COMPLETED],
        [OrderStatus.PENDING, OrderStatus.PREPARING],
        // Từ trạng thái kết thúc COMPLETED / CANCELLED
        [OrderStatus.COMPLETED, OrderStatus.PREPARING],
        [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        [OrderStatus.CANCELLED, OrderStatus.PREPARING],
        [OrderStatus.CANCELLED, OrderStatus.CANCELLED],
        // Hủy từ PREPARING / READY
        [OrderStatus.PREPARING, OrderStatus.CANCELLED],
        [OrderStatus.READY, OrderStatus.CANCELLED],
      ];

      for (const [fromStatus, toStatus] of invalidTransitions) {
        prisma.order.findFirst.mockResolvedValueOnce(
          buildMockOrder(fromStatus),
        );

        await expect(
          controller.updateStatus(ORDER_ID, { status: toStatus }),
        ).rejects.toThrow(
          new ConflictException(
            `Không thể chuyển đơn từ trạng thái '${ORDER_STATUS_LABELS[fromStatus]}' sang '${ORDER_STATUS_LABELS[toStatus]}'`,
          ),
        );
      }

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('ném 400 khi body status là PENDING, PAID, PAYMENT_FAILED hoặc giá trị không hợp lệ', async () => {
      const invalidBodyStatuses = [
        OrderStatus.PENDING,
        OrderStatus.PAID,
        OrderStatus.PAYMENT_FAILED,
        'UNKNOWN',
        '',
      ];

      for (const badStatus of invalidBodyStatuses) {
        const errors = await validate(
          plainToInstance(UpdateOrderStatusDto, { status: badStatus }),
        );
        expect(errors.some((e) => e.property === 'status')).toBe(true);

        await expect(
          controller.updateStatus(ORDER_ID, {
            status: badStatus as UpdateOrderStatusDto['status'],
          }),
        ).rejects.toThrow(BadRequestException);
      }

      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('ném 404 "Không tìm thấy đơn hàng" khi id không tồn tại hoặc không phải UUID', async () => {
      await expect(
        controller.updateStatus('not-a-uuid', {
          status: OrderStatus.PREPARING,
        }),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));
      expect(prisma.order.findFirst).not.toHaveBeenCalled();

      prisma.order.findFirst.mockResolvedValueOnce(null);
      await expect(
        controller.updateStatus(ORDER_ID, {
          status: OrderStatus.PREPARING,
        }),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('ném 409 "Trạng thái đơn đã thay đổi, vui lòng tải lại" khi cập nhật có điều kiện thất bại (count = 0)', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(
        buildMockOrder(OrderStatus.PAID),
      );
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        controller.updateStatus(ORDER_ID, {
          status: OrderStatus.PREPARING,
        }),
      ).rejects.toThrow(new ConflictException(ORDER_STATUS_CHANGED_MESSAGE));

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          status: OrderStatus.PAID,
        },
        data: {
          status: OrderStatus.PREPARING,
        },
      });
    });
  });

  describe('12. Phân quyền RolesGuard cho GET /orders và PATCH /orders/:id/status', () => {
    const TEST_SECRET = 'test-orders-roles-guard-secret';
    let jwtService: JwtService;
    let rolesGuard: RolesGuard;

    const createGuardContext = (
      methodName: 'findAll' | 'updateStatus',
      authHeader?: string,
    ) => {
      const request: Partial<AuthenticatedRequest> = {
        headers: authHeader !== undefined ? { authorization: authHeader } : {},
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        OrdersController.prototype,
        methodName,
      );
      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
        getHandler: () => descriptor?.value as (...args: never[]) => unknown,
        getClass: () => OrdersController,
      } as unknown as ExecutionContext;
    };

    beforeEach(() => {
      jwtService = new JwtService({
        secret: TEST_SECRET,
        signOptions: { expiresIn: '24h' },
      });
      rolesGuard = new RolesGuard(
        jwtService,
        new Reflector(),
        prisma as unknown as PrismaService,
      );
    });

    it('chặn 401 khi chưa đăng nhập, 403 khi là CUSTOMER, 403 khi tài khoản bị khóa, và cho phép STAFF & ADMIN đang hoạt động', async () => {
      const methodNames: Array<'findAll' | 'updateStatus'> = [
        'findAll',
        'updateStatus',
      ];

      for (const methodName of methodNames) {
        // 1. Chưa đăng nhập -> 401
        await expect(
          rolesGuard.canActivate(createGuardContext(methodName)),
        ).rejects.toThrow(
          new UnauthorizedException(
            'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
          ),
        );

        // 2. Khách (CUSTOMER) -> 403 "Bạn không có quyền thực hiện thao tác này"
        const customerToken = await jwtService.signAsync({
          sub: '44444444-0000-0000-0000-000000000001',
          email: 'khach@example.com',
          role: Role.CUSTOMER,
        });
        await expect(
          rolesGuard.canActivate(
            createGuardContext(methodName, `Bearer ${customerToken}`),
          ),
        ).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 3. Tài khoản STAFF bị khóa (isActive = false) -> 403 "Tài khoản đã bị khóa"
        const staffToken = await jwtService.signAsync({
          sub: '55555555-0000-0000-0000-000000000001',
          email: 'nhanvien1@example.com',
          role: Role.STAFF,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: false });
        await expect(
          rolesGuard.canActivate(
            createGuardContext(methodName, `Bearer ${staffToken}`),
          ),
        ).rejects.toThrow(new ForbiddenException('Tài khoản đã bị khóa'));

        // 4. STAFF đang hoạt động -> qua được
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: true });
        await expect(
          rolesGuard.canActivate(
            createGuardContext(methodName, `Bearer ${staffToken}`),
          ),
        ).resolves.toBe(true);

        // 5. ADMIN đang hoạt động -> qua được
        const adminToken = await jwtService.signAsync({
          sub: '66666666-0000-0000-0000-000000000001',
          email: 'quanly@example.com',
          role: Role.ADMIN,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: true });
        await expect(
          rolesGuard.canActivate(
            createGuardContext(methodName, `Bearer ${adminToken}`),
          ),
        ).resolves.toBe(true);
      }
    });
  });

  describe('13. POST /orders/:id/cancel (cancelForUser)', () => {
    const ORDER_ID = '33333333-0000-0000-0000-000000000001';

    const buildUserOrder = (status: OrderStatus) => ({
      id: ORDER_ID,
      orderNumber: 1001,
      userId: USER_ID,
      status,
      receiveType: ReceiveType.TAKE_AWAY,
      note: 'Cho xin thêm quai xách giấy',
      totalAmount: 53000,
      createdAt: new Date('2026-11-05T03:00:00.000Z'),
      updatedAt: new Date('2026-11-05T03:00:00.000Z'),
      items: [
        {
          id: '88888888-0000-0000-0000-000000000001',
          orderId: ORDER_ID,
          productId: mockMilkTea.id,
          productName: mockMilkTea.name,
          size: Size.M,
          sugarLevel: SugarLevel.P70,
          iceLevel: IceLevel.NORMAL,
          quantity: 1,
          unitPrice: 53000,
          lineTotal: 53000,
          note: 'Ít ngọt vừa phải',
          toppings: [
            {
              id: '77777777-0000-0000-0000-000000000001',
              orderItemId: '88888888-0000-0000-0000-000000000001',
              toppingId: mockPearlTopping.id,
              name: mockPearlTopping.name,
              price: mockPearlTopping.price,
            },
            {
              id: '77777777-0000-0000-0000-000000000002',
              orderItemId: '88888888-0000-0000-0000-000000000001',
              toppingId: mockPuddingTopping.id,
              name: mockPuddingTopping.name,
              price: mockPuddingTopping.price,
            },
          ],
        },
      ],
    });

    it('hủy đơn thành công từ PENDING, PAYMENT_FAILED, PAID và trả về Order object với status = CANCELLED kèm items và toppings', async () => {
      const cancellableStatuses: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.PAYMENT_FAILED,
        OrderStatus.PAID,
      ];

      for (const fromStatus of cancellableStatuses) {
        prisma.order.findFirst.mockResolvedValueOnce(
          buildUserOrder(fromStatus),
        );
        txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

        const result = await controller.cancel(
          {
            user: {
              id: USER_ID,
              email: 'khach@example.com',
              role: Role.CUSTOMER,
            },
          } as never,
          ORDER_ID,
        );

        expect(prisma.order.findFirst).toHaveBeenLastCalledWith({
          where: {
            id: ORDER_ID,
            userId: USER_ID,
          },
          include: {
            items: {
              include: {
                toppings: true,
              },
            },
          },
        });
        expect(txMock.order.updateMany).toHaveBeenLastCalledWith({
          where: {
            id: ORDER_ID,
            status: fromStatus,
          },
          data: {
            status: OrderStatus.CANCELLED,
          },
        });
        expect(txMock.product.updateMany).toHaveBeenLastCalledWith({
          where: { id: mockMilkTea.id },
          data: { stock: { increment: 1 } },
        });
        expect(result).toEqual({
          id: ORDER_ID,
          orderNumber: 1001,
          status: OrderStatus.CANCELLED,
          receiveType: ReceiveType.TAKE_AWAY,
          note: 'Cho xin thêm quai xách giấy',
          subtotalAmount: 53000,
          discountAmount: 0,
          promotionCode: null,
          pointsUsed: 0,
          pointsEarned: 0,
          totalAmount: 53000,
          createdAt: new Date('2026-11-05T03:00:00.000Z'),
          items: [
            {
              id: '88888888-0000-0000-0000-000000000001',
              productId: mockMilkTea.id,
              productName: mockMilkTea.name,
              size: Size.M,
              sugarLevel: SugarLevel.P70,
              iceLevel: IceLevel.NORMAL,
              quantity: 1,
              unitPrice: 53000,
              lineTotal: 53000,
              note: 'Ít ngọt vừa phải',
              toppings: [
                {
                  id: mockPearlTopping.id,
                  name: mockPearlTopping.name,
                  price: mockPearlTopping.price,
                },
                {
                  id: mockPuddingTopping.id,
                  name: mockPuddingTopping.name,
                  price: mockPuddingTopping.price,
                },
              ],
            },
          ],
        });
        expect(result).not.toHaveProperty('userId');
        expect(result).not.toHaveProperty('payments');
      }
    });

    it('(a) khách hủy đơn PENDING hoàn đúng số lượng vào kho trong cùng transaction', async () => {
      const pendingOrder = {
        ...buildUserOrder(OrderStatus.PENDING),
        items: [
          {
            ...buildUserOrder(OrderStatus.PENDING).items[0],
            quantity: 4,
          },
        ],
      };
      prisma.order.findFirst.mockResolvedValueOnce(pendingOrder);
      txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.cancelForUser(USER_ID, ORDER_ID);

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
      expect(txMock.product.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: mockMilkTea.id },
        data: { stock: { increment: 4 } },
      });
    });

    it('(c) đơn có cùng món khác size ở nhiều dòng được gộp tổng số lượng theo productId khi hoàn kho', async () => {
      const multiSizeOrder = {
        ...buildUserOrder(OrderStatus.PENDING),
        items: [
          {
            ...buildUserOrder(OrderStatus.PENDING).items[0],
            id: '88888888-0000-0000-0000-000000000001',
            productId: mockMilkTea.id,
            size: Size.S,
            quantity: 2,
          },
          {
            ...buildUserOrder(OrderStatus.PENDING).items[0],
            id: '88888888-0000-0000-0000-000000000002',
            productId: mockMilkTea.id,
            size: Size.L,
            quantity: 3,
          },
          {
            id: '88888888-0000-0000-0000-000000000003',
            orderId: ORDER_ID,
            productId: mockCake.id,
            productName: mockCake.name,
            size: null,
            sugarLevel: null,
            iceLevel: null,
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            note: null,
            toppings: [],
          },
        ],
      };
      prisma.order.findFirst.mockResolvedValueOnce(multiSizeOrder);
      txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.cancelForUser(USER_ID, ORDER_ID);

      expect(txMock.product.updateMany).toHaveBeenCalledTimes(2);
      expect(txMock.product.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: mockMilkTea.id },
        data: { stock: { increment: 5 } },
      });
      expect(txMock.product.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: mockCake.id },
        data: { stock: { increment: 1 } },
      });
    });

    it('không thay đổi bảng Payment khi hủy đơn đang PAID (Payment vẫn giữ nguyên SUCCESS)', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(
        buildUserOrder(OrderStatus.PAID),
      );
      txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

      const cancelResult = await service.cancelForUser(USER_ID, ORDER_ID);
      expect(cancelResult.status).toBe(OrderStatus.CANCELLED);
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();

      prisma.order.findFirst.mockResolvedValueOnce({
        ...buildUserOrder(OrderStatus.CANCELLED),
        payments: [
          {
            id: '44444444-0000-0000-0000-000000000002',
            orderId: ORDER_ID,
            userId: USER_ID,
            idempotencyKey: 'idem-paid-1001',
            method: PaymentMethod.WALLET,
            accountLast4: '0001',
            amount: 53000,
            status: PaymentStatus.SUCCESS,
            failureReason: null,
            createdAt: new Date('2026-11-05T03:03:00.000Z'),
          },
        ],
      });

      const detailAfterCancel = await service.findOneForUser(USER_ID, ORDER_ID);
      expect(detailAfterCancel.status).toBe(OrderStatus.CANCELLED);
      expect(detailAfterCancel.payments).toEqual([
        {
          id: '44444444-0000-0000-0000-000000000002',
          method: PaymentMethod.WALLET,
          accountLast4: '0001',
          status: PaymentStatus.SUCCESS,
          failureReason: null,
          createdAt: new Date('2026-11-05T03:03:00.000Z'),
        },
      ]);
    });

    it('ném 404 "Không tìm thấy đơn hàng" khi đơn không tồn tại, không phải UUID hoặc thuộc người dùng khác', async () => {
      await expect(
        service.cancelForUser(USER_ID, 'not-a-uuid'),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));
      expect(prisma.order.findFirst).not.toHaveBeenCalled();

      prisma.order.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.cancelForUser('99999999-0000-0000-0000-000000000099', ORDER_ID),
      ).rejects.toThrow(new NotFoundException(ORDER_NOT_FOUND_MESSAGE));
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: ORDER_ID,
            userId: '99999999-0000-0000-0000-000000000099',
          },
        }),
      );
      expect(txMock.order.updateMany).not.toHaveBeenCalled();
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
    });

    it('(d & e) ném 409 "Không thể hủy đơn ở trạng thái hiện tại" và KHÔNG hoàn kho khi đơn đang PREPARING, READY, COMPLETED hoặc đã CANCELLED (hủy lần 2)', async () => {
      const nonCancellableStatuses: OrderStatus[] = [
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ];

      for (const status of nonCancellableStatuses) {
        prisma.order.findFirst.mockResolvedValueOnce(buildUserOrder(status));

        await expect(service.cancelForUser(USER_ID, ORDER_ID)).rejects.toThrow(
          new ConflictException(ORDER_CANNOT_CANCEL_MESSAGE),
        );
      }

      expect(txMock.order.updateMany).not.toHaveBeenCalled();
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
    });

    it('(d) ném 409 "Trạng thái đơn đã thay đổi, vui lòng tải lại" và dừng ngay không hoàn kho khi cập nhật có điều kiện thất bại (count = 0)', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(
        buildUserOrder(OrderStatus.PAID),
      );
      txMock.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.cancelForUser(USER_ID, ORDER_ID)).rejects.toThrow(
        new ConflictException(ORDER_STATUS_CHANGED_MESSAGE),
      );

      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          status: OrderStatus.PAID,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
    });

    it('ném 401 khi chưa đăng nhập (req.user thiếu id)', () => {
      expect(() =>
        controller.cancel({} as AuthenticatedRequest, ORDER_ID),
      ).toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('14. VIỆC 8 - POST /orders áp mã giảm giá & 5 trường mới trên mọi endpoint trả đơn', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });

    it('(a) & (j) không gửi mã & bỏ qua subtotalAmount/discountAmount/totalAmount/pointsUsed/pointsEarned từ client: subtotalAmount = totalAmount, discountAmount = 0, promotionCode = null, pointsUsed = 0, pointsEarned = 0', async () => {
      const dto = (await pipe.transform(
        {
          subtotalAmount: 1,
          discountAmount: 999999,
          totalAmount: 1,
          pointsUsed: 50,
          pointsEarned: 999,
          items: [{ productId: mockCake.id, quantity: 2 }],
        },
        { type: 'body', metatype: CreateOrderDto },
      )) as CreateOrderDto;

      const res = await service.create(USER_ID, dto);

      expect(txMock.promotion.findUnique).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 0,
        promotionCode: null,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 60000,
      });
    });

    it('validate promotionCode: gửi chuỗi rỗng/khoảng trắng, dài > 30 ký tự, số hoặc null -> 400 mảng chuỗi tiếng Anh, không gọi transaction', async () => {
      const invalidCodes = ['', '   ', 'A'.repeat(31), 12345, null];

      for (const badCode of invalidCodes) {
        let caught: unknown;
        try {
          const transformed = (await pipe.transform(
            {
              promotionCode: badCode,
              items: [{ productId: mockCake.id, quantity: 1 }],
            },
            { type: 'body', metatype: CreateOrderDto },
          )) as CreateOrderDto;
          await service.create(USER_ID, transformed);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(BadRequestException);
        const body = (caught as BadRequestException).getResponse() as {
          message: unknown;
        };
        expect(Array.isArray(body.message)).toBe(true);
      }

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('(b), (c), (d), (g) áp dụng mã PERCENT không trần, PERCENT có trần, FIXED, chuẩn hóa mã viết thường có khoảng trắng, và chặn không giảm dưới 1.000đ', async () => {
      // (b) & (d) PERCENT không trần (10%) + mã viết thường có khoảng trắng trên đơn 2 bánh (60.000) -> giảm 6.000, total 54.000
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'BREW10',
        type: PromotionType.PERCENT,
        value: 10,
        maxDiscount: null,
        isActive: true,
      });

      const dtoNoCap = (await pipe.transform(
        {
          promotionCode: '  brew10  ',
          items: [{ productId: mockCake.id, quantity: 2 }],
        },
        { type: 'body', metatype: CreateOrderDto },
      )) as CreateOrderDto;

      expect(dtoNoCap.promotionCode).toBe('BREW10');
      const resNoCap = await service.create(USER_ID, dtoNoCap);
      expect(txMock.promotion.findUnique).toHaveBeenCalledWith({
        where: { code: 'BREW10' },
        select: {
          code: true,
          type: true,
          value: true,
          maxDiscount: true,
          isActive: true,
        },
      });
      expect(resNoCap).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });

      // (b) PERCENT có trần (20% trần 15.000 trên đơn 3 bánh 90.000 = 18.000 -> trần 15.000 -> total 75.000)
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'CAP15K',
        type: PromotionType.PERCENT,
        value: 20,
        maxDiscount: 15000,
        isActive: true,
      });
      const resCap = await service.create(USER_ID, {
        promotionCode: 'CAP15K',
        items: [{ productId: mockCake.id, quantity: 3 }],
      });
      expect(resCap).toMatchObject({
        subtotalAmount: 90000,
        discountAmount: 15000,
        promotionCode: 'CAP15K',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 75000,
      });

      // (c) FIXED 20.000 trên đơn 2 bánh (60.000) -> giảm 20.000, total 40.000
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'GIAM20K',
        type: PromotionType.FIXED,
        value: 20000,
        maxDiscount: null,
        isActive: true,
      });
      const resFixed = await service.create(USER_ID, {
        promotionCode: 'GIAM20K',
        items: [{ productId: mockCake.id, quantity: 2 }],
      });
      expect(resFixed).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 20000,
        promotionCode: 'GIAM20K',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 40000,
      });

      // (g) Mức giảm không làm totalAmount dưới 1.000đ: FIXED 50.000 trên đơn 1 bánh 30.000 -> discountAmount = 29.000, totalAmount = 1.000
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'GIAM50K',
        type: PromotionType.FIXED,
        value: 50000,
        maxDiscount: null,
        isActive: true,
      });
      const resFloor = await service.create(USER_ID, {
        promotionCode: 'GIAM50K',
        items: [{ productId: mockCake.id, quantity: 1 }],
      });
      expect(resFloor).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 29000,
        promotionCode: 'GIAM50K',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 1000,
      });
    });

    it('(e) & (f) kiểm tra mã TRƯỚC khi trừ kho: mã không tồn tại -> 404 "Mã giảm giá không tồn tại"; mã tắt -> 409 "Mã giảm giá đã ngừng áp dụng"; cả hai trường hợp KHÔNG gọi trừ kho và KHÔNG tạo đơn', async () => {
      // (e) Mã không tồn tại -> 404
      txMock.promotion.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create(USER_ID, {
          promotionCode: 'MA_KHONG_TON_TAI',
          items: [{ productId: mockCake.id, quantity: 1 }],
        }),
      ).rejects.toThrow(
        new NotFoundException(PROMOTION_CODE_NOT_FOUND_MESSAGE),
      );
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
      expect(txMock.order.create).not.toHaveBeenCalled();

      // (f) Mã isActive = false -> 409
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'TAMNGUNG',
        type: PromotionType.PERCENT,
        value: 15,
        maxDiscount: null,
        isActive: false,
      });
      await expect(
        service.create(USER_ID, {
          promotionCode: 'TAMNGUNG',
          items: [{ productId: mockCake.id, quantity: 1 }],
        }),
      ).rejects.toThrow(new ConflictException(PROMOTION_INACTIVE_MESSAGE));
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
      expect(txMock.order.create).not.toHaveBeenCalled();
    });

    it('(h) & (i) 5 trường mới có mặt ở cả 6 endpoint trả đơn và hủy đơn có dùng mã không làm đổi discountAmount hay promotionCode', async () => {
      const orderWithPromo = {
        id: '33333333-0000-0000-0000-000000000009',
        orderNumber: 1009,
        userId: USER_ID,
        status: OrderStatus.PENDING,
        receiveType: ReceiveType.TAKE_AWAY,
        note: null,
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        updatedAt: new Date('2026-11-05T03:00:00.000Z'),
        items: [],
        payments: [],
        user: {
          id: USER_ID,
          displayName: 'Khách demo',
          email: 'khach@example.com',
        },
      };

      // GET /orders/me
      prisma.order.findMany.mockResolvedValueOnce([orderWithPromo]);
      const myOrders = await service.findMyOrders(USER_ID);
      expect(myOrders[0]).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });

      // GET /orders/:id
      prisma.order.findFirst.mockResolvedValueOnce(orderWithPromo);
      const oneOrder = await service.findOneForUser(USER_ID, orderWithPromo.id);
      expect(oneOrder).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });

      // GET /orders (STAFF/ADMIN)
      prisma.order.findMany.mockResolvedValueOnce([orderWithPromo]);
      const staffOrders = await service.findAllForStaff();
      expect(staffOrders[0]).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });

      // PATCH /orders/:id/status
      prisma.order.findFirst.mockResolvedValueOnce({
        ...orderWithPromo,
        status: OrderStatus.PAID,
      });
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });
      const patchedOrder = await service.updateStatus(orderWithPromo.id, {
        status: OrderStatus.PREPARING,
      });
      expect(patchedOrder).toMatchObject({
        status: OrderStatus.PREPARING,
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });

      // (i) POST /orders/:id/cancel: hủy đơn có dùng mã không làm đổi discountAmount và promotionCode
      prisma.order.findFirst.mockResolvedValueOnce(orderWithPromo);
      txMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
      const cancelledOrder = await service.cancelForUser(
        USER_ID,
        orderWithPromo.id,
      );
      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: orderWithPromo.id,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
      expect(cancelledOrder).toMatchObject({
        status: OrderStatus.CANCELLED,
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: 'BREW10',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });
    });
  });

  describe('15. VIỆC 9 - POST /orders dùng điểm (hợp đồng mục 0.10, 5.2)', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });

    it('(a) không gửi usePoints hoặc usePoints = false: pointsUsed = 0, điểm không đổi, không có dòng REDEEM', async () => {
      // Không gửi usePoints
      const resOmitted = await service.create(USER_ID, {
        items: [{ productId: mockCake.id, quantity: 2 }],
      });
      expect(resOmitted.pointsUsed).toBe(0);
      expect(resOmitted.pointsEarned).toBe(0);
      expect(resOmitted.totalAmount).toBe(60000);
      expect(txMock.user.findUnique).not.toHaveBeenCalled();
      expect(txMock.user.updateMany).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();

      // usePoints = false
      const resFalse = await service.create(USER_ID, {
        usePoints: false,
        items: [{ productId: mockCake.id, quantity: 2 }],
      });
      expect(resFalse.pointsUsed).toBe(0);
      expect(resFalse.pointsEarned).toBe(0);
      expect(resFalse.totalAmount).toBe(60000);
      expect(txMock.user.findUnique).not.toHaveBeenCalled();
      expect(txMock.user.updateMany).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(b) ví dụ hợp đồng: subtotal 80.000, mã FIXED 10.000, khách có 10 điểm, usePoints = true -> pointsUsed = 10, totalAmount = 60.000, trừ điểm có điều kiện, có đúng 1 dòng REDEEM points = -10 gắn đúng orderId', async () => {
      // 1 ly Trà sữa size M có 1 topping 5.000 (35.000 + 6.000 + 5.000 = 46.000) -> ta dùng mock sản phẩm 80.000 cho gọn
      const mockProduct80k = {
        id: '11111111-0000-0000-0000-000000000080',
        name: 'Combo Đặc Biệt 80k',
        category: Category.COFFEE,
        basePrice: 80000,
        stock: 20,
      };
      prisma.product.findMany.mockResolvedValueOnce([mockProduct80k]);
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'GIAM10K',
        type: PromotionType.FIXED,
        value: 10000,
        maxDiscount: null,
        isActive: true,
      });
      txMock.user.findUnique.mockResolvedValueOnce({ loyaltyPoints: 10 });

      const result = await service.create(USER_ID, {
        promotionCode: 'GIAM10K',
        usePoints: true,
        items: [{ productId: mockProduct80k.id, quantity: 1 }],
      });

      expect(result).toMatchObject({
        id: '33333333-0000-0000-0000-000000000001',
        subtotalAmount: 80000,
        discountAmount: 10000,
        promotionCode: 'GIAM10K',
        pointsUsed: 10,
        pointsEarned: 0,
        totalAmount: 60000,
      });

      expect(txMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { loyaltyPoints: true },
      });
      expect(txMock.user.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: USER_ID,
          loyaltyPoints: { gte: 10 },
        },
        data: {
          loyaltyPoints: { decrement: 10 },
        },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledTimes(1);
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          orderId: '33333333-0000-0000-0000-000000000001',
          type: LoyaltyType.REDEEM,
          points: -10,
        },
      });
    });

    it('(c) điểm nhiều hơn mức cho phép: khách có 100 điểm, subtotal 30.000, không mã -> pointsUsed = 29, totalAmount = 1.000, trừ đúng 29 điểm (còn 71)', async () => {
      prisma.product.findMany.mockResolvedValueOnce([mockCake]);
      txMock.user.findUnique.mockResolvedValueOnce({ loyaltyPoints: 100 });

      const result = await service.create(USER_ID, {
        usePoints: true,
        items: [{ productId: mockCake.id, quantity: 1 }],
      });

      expect(result).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 0,
        promotionCode: null,
        pointsUsed: 29,
        pointsEarned: 0,
        totalAmount: 1000,
      });
      expect(txMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: USER_ID,
          loyaltyPoints: { gte: 29 },
        },
        data: {
          loyaltyPoints: { decrement: 29 },
        },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          orderId: result.id,
          type: LoyaltyType.REDEEM,
          points: -29,
        },
      });
    });

    it('(d) có cả mã và điểm: totalAmount không bao giờ dưới 1.000 (kể cả khi mã đã giảm sát 1.000đ hoặc kết hợp mã + điểm dư)', async () => {
      // Trường hợp 1: subtotal 30.000, mã FIXED 20.000 -> còn 10.000, khách có 50 điểm -> chỉ dùng 9 điểm, totalAmount = 1.000
      prisma.product.findMany.mockResolvedValueOnce([mockCake]);
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'GIAM20K',
        type: PromotionType.FIXED,
        value: 20000,
        maxDiscount: null,
        isActive: true,
      });
      txMock.user.findUnique.mockResolvedValueOnce({ loyaltyPoints: 50 });

      const res1 = await service.create(USER_ID, {
        promotionCode: 'GIAM20K',
        usePoints: true,
        items: [{ productId: mockCake.id, quantity: 1 }],
      });

      expect(res1).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 20000,
        promotionCode: 'GIAM20K',
        pointsUsed: 9,
        pointsEarned: 0,
        totalAmount: 1000,
      });
      expect(txMock.user.updateMany).toHaveBeenLastCalledWith({
        where: { id: USER_ID, loyaltyPoints: { gte: 9 } },
        data: { loyaltyPoints: { decrement: 9 } },
      });

      // Trường hợp 2: subtotal 30.000, mã FIXED 50.000 -> discountAmount = 29.000, khách có 50 điểm -> pointsUsed = 0, totalAmount = 1.000, không ghi REDEEM
      prisma.product.findMany.mockResolvedValueOnce([mockCake]);
      txMock.promotion.findUnique.mockResolvedValueOnce({
        code: 'GIAM50K',
        type: PromotionType.FIXED,
        value: 50000,
        maxDiscount: null,
        isActive: true,
      });
      txMock.user.findUnique.mockResolvedValueOnce({ loyaltyPoints: 50 });
      txMock.user.updateMany.mockClear();
      txMock.loyaltyTransaction.create.mockClear();

      const res2 = await service.create(USER_ID, {
        promotionCode: 'GIAM50K',
        usePoints: true,
        items: [{ productId: mockCake.id, quantity: 1 }],
      });

      expect(res2).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 29000,
        promotionCode: 'GIAM50K',
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 1000,
      });
      expect(txMock.user.updateMany).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(e) usePoints = true nhưng khách có 0 điểm: pointsUsed = 0, không có dòng REDEEM, đặt đơn thành công', async () => {
      prisma.product.findMany.mockResolvedValueOnce([mockCake]);
      txMock.user.findUnique.mockResolvedValueOnce({ loyaltyPoints: 0 });

      const result = await service.create(USER_ID, {
        usePoints: true,
        items: [{ productId: mockCake.id, quantity: 1 }],
      });

      expect(result).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 0,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 30000,
      });
      expect(txMock.user.findUnique).toHaveBeenCalledTimes(1);
      expect(txMock.user.updateMany).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
      expect(txMock.order.create).toHaveBeenCalledTimes(1);
    });

    it('(f) tranh chấp điểm: câu cập nhật có điều kiện trả 0 dòng -> 409 "Số điểm không đủ, vui lòng thử lại", không có đơn, không có dòng REDEEM', async () => {
      prisma.product.findMany.mockResolvedValueOnce([mockCake]);
      txMock.user.findUnique.mockResolvedValueOnce({ loyaltyPoints: 15 });
      txMock.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.create(USER_ID, {
          usePoints: true,
          items: [{ productId: mockCake.id, quantity: 1 }],
        }),
      ).rejects.toThrow(new ConflictException(INSUFFICIENT_POINTS_MESSAGE));

      expect(txMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: USER_ID,
          loyaltyPoints: { gte: 15 },
        },
        data: {
          loyaltyPoints: { decrement: 15 },
        },
      });
      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(g) thiếu hàng (409 kho) thì điểm KHÔNG bị trừ và không ghi dòng REDEEM', async () => {
      prisma.product.findMany.mockResolvedValueOnce([mockCake]);
      txMock.product.updateMany.mockResolvedValueOnce({ count: 0 });
      txMock.product.findMany.mockResolvedValueOnce([
        { id: mockCake.id, name: mockCake.name, stock: 0 },
      ]);

      await expect(
        service.create(USER_ID, {
          usePoints: true,
          items: [{ productId: mockCake.id, quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);

      expect(txMock.user.findUnique).not.toHaveBeenCalled();
      expect(txMock.user.updateMany).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(h) usePoints không phải đúng/sai bị 400 với message là mảng chuỗi tiếng Anh', async () => {
      const invalidValues = ['true', 'false', 1, 0, null, {}, []];

      for (const badVal of invalidValues) {
        let caught: unknown;
        try {
          const transformed = (await pipe.transform(
            {
              usePoints: badVal,
              items: [{ productId: mockCake.id, quantity: 1 }],
            },
            { type: 'body', metatype: CreateOrderDto },
          )) as CreateOrderDto;
          await service.create(USER_ID, transformed);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(BadRequestException);
        const body = (caught as BadRequestException).getResponse() as {
          statusCode: number;
          message: unknown;
        };
        expect(body.statusCode).toBe(400);
        expect(Array.isArray(body.message)).toBe(true);
      }

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('(i) GET /orders/me và GET /orders/:id trả pointsUsed đúng', async () => {
      const orderWithPoints = {
        id: '33333333-0000-0000-0000-000000000019',
        orderNumber: 1019,
        userId: USER_ID,
        status: OrderStatus.PENDING,
        receiveType: ReceiveType.AT_COUNTER,
        note: null,
        subtotalAmount: 80000,
        discountAmount: 10000,
        promotionCode: 'GIAM10K',
        pointsUsed: 10,
        pointsEarned: 0,
        totalAmount: 60000,
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
        updatedAt: new Date('2026-11-05T03:00:00.000Z'),
        items: [],
        payments: [],
      };

      prisma.order.findMany.mockResolvedValueOnce([orderWithPoints]);
      const myOrders = await service.findMyOrders(USER_ID);
      expect(myOrders[0]).toMatchObject({
        id: orderWithPoints.id,
        pointsUsed: 10,
        pointsEarned: 0,
        totalAmount: 60000,
      });

      prisma.order.findFirst.mockResolvedValueOnce(orderWithPoints);
      const detail = await service.findOneForUser(USER_ID, orderWithPoints.id);
      expect(detail).toMatchObject({
        id: orderWithPoints.id,
        pointsUsed: 10,
        pointsEarned: 0,
        totalAmount: 60000,
      });
    });
  });

  describe('16. VIỆC 11 - Bổ sung phần điểm cho hàm hủy dùng chung (hợp đồng mục 5.9 bước 3 và 4, 0.4, 0.10, 11.8)', () => {
    const ORDER_ID = '33333333-0000-0000-0000-000000000011';
    const CUSTOMER_ID = '44444444-0000-0000-0000-000000000001';

    const buildCancelableOrder = (
      overrides: {
        status?: OrderStatus;
        userId?: string;
        pointsUsed?: number;
        pointsEarned?: number;
        subtotalAmount?: number;
        totalAmount?: number;
      } = {},
    ) => ({
      id: ORDER_ID,
      orderNumber: 1011,
      userId: overrides.userId ?? CUSTOMER_ID,
      status: overrides.status ?? OrderStatus.PENDING,
      receiveType: ReceiveType.TAKE_AWAY,
      note: null,
      subtotalAmount: overrides.subtotalAmount ?? 70000,
      discountAmount: 0,
      promotionCode: null,
      pointsUsed: overrides.pointsUsed ?? 0,
      pointsEarned: overrides.pointsEarned ?? 0,
      totalAmount: overrides.totalAmount ?? 70000,
      createdAt: new Date('2026-11-05T03:00:00.000Z'),
      updatedAt: new Date('2026-11-05T03:00:00.000Z'),
      user: {
        id: overrides.userId ?? CUSTOMER_ID,
        displayName: 'Khách demo',
        email: 'khach@example.com',
      },
      items: [
        {
          id: '88888888-0000-0000-0000-000000000011',
          orderId: ORDER_ID,
          productId: mockMilkTea.id,
          productName: mockMilkTea.name,
          size: Size.S,
          sugarLevel: SugarLevel.P100,
          iceLevel: IceLevel.NORMAL,
          quantity: 2,
          unitPrice: 35000,
          lineTotal: 70000,
          note: null,
          toppings: [],
        },
      ],
    });

    it('(a) hủy đơn PENDING có dùng điểm (pointsUsed = 10): điểm khách tăng 10, có đúng 1 dòng REFUND (+10), không có dòng REVOKE', async () => {
      const pendingWithPoints = buildCancelableOrder({
        status: OrderStatus.PENDING,
        pointsUsed: 10,
        pointsEarned: 0,
        subtotalAmount: 70000,
        totalAmount: 60000,
      });
      prisma.order.findFirst.mockResolvedValueOnce(pendingWithPoints);

      const res = await service.cancelForUser(CUSTOMER_ID, ORDER_ID);

      expect(res.status).toBe(OrderStatus.CANCELLED);
      expect(res.pointsUsed).toBe(10);
      expect(res.pointsEarned).toBe(0);

      expect(txMock.user.update).toHaveBeenCalledTimes(1);
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { loyaltyPoints: { increment: 10 } },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledTimes(1);
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: CUSTOMER_ID,
          orderId: ORDER_ID,
          type: LoyaltyType.REFUND,
          points: 10,
        },
      });
      expect(txMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('(b) hủy đơn PAID có pointsUsed = 10 và pointsEarned = 6: điểm tăng 10 (REFUND) TRƯỚC rồi giảm 6 (REVOKE), có 1 dòng REFUND (+10) và 1 dòng REVOKE (-6), giữ nguyên pointsUsed/pointsEarned', async () => {
      const callOrder: string[] = [];
      txMock.user.update.mockImplementationOnce(() => {
        callOrder.push('user.increment.refund');
        return Promise.resolve({ id: CUSTOMER_ID, loyaltyPoints: 50 });
      });
      txMock.loyaltyTransaction.create.mockImplementation(
        ({ data }: { data: { type: LoyaltyType } }) => {
          callOrder.push(`tx.${data.type}`);
          return Promise.resolve({ id: 'tx-id' });
        },
      );
      txMock.$queryRaw.mockImplementationOnce(() => {
        callOrder.push('user.decrement.revoke');
        return Promise.resolve([{ revoked: 6 }]);
      });

      const paidOrder = buildCancelableOrder({
        status: OrderStatus.PAID,
        pointsUsed: 10,
        pointsEarned: 6,
        subtotalAmount: 70000,
        totalAmount: 60000,
      });
      prisma.order.findFirst.mockResolvedValueOnce(paidOrder);

      const res = await service.cancelForUser(CUSTOMER_ID, ORDER_ID);

      expect(res.status).toBe(OrderStatus.CANCELLED);
      expect(res.pointsUsed).toBe(10);
      expect(res.pointsEarned).toBe(6);

      // Chứng minh thứ tự: hoàn điểm (REFUND) TRƯỚC rồi mới thu hồi (REVOKE)
      expect(callOrder).toEqual([
        'user.increment.refund',
        'tx.REFUND',
        'user.decrement.revoke',
        'tx.REVOKE',
      ]);

      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { loyaltyPoints: { increment: 10 } },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledTimes(2);
      expect(txMock.loyaltyTransaction.create).toHaveBeenNthCalledWith(1, {
        data: {
          userId: CUSTOMER_ID,
          orderId: ORDER_ID,
          type: LoyaltyType.REFUND,
          points: 10,
        },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenNthCalledWith(2, {
        data: {
          userId: CUSTOMER_ID,
          orderId: ORDER_ID,
          type: LoyaltyType.REVOKE,
          points: -6,
        },
      });
    });

    it('(c) thu hồi chỉ tới 0 khi điểm đã bị tiêu: đơn PAID có pointsEarned = 6 nhưng khách chỉ còn 2 điểm và pointsUsed = 0 -> REVOKE -2; nếu khách còn 0 điểm -> không có dòng REVOKE', async () => {
      // Trường hợp 1: khách còn 2 điểm -> thu hồi 2 điểm, ghi REVOKE -2
      txMock.$queryRaw.mockResolvedValueOnce([{ revoked: 2 }]);
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.PAID,
          pointsUsed: 0,
          pointsEarned: 6,
        }),
      );

      await service.cancelForUser(CUSTOMER_ID, ORDER_ID);

      expect(txMock.user.update).not.toHaveBeenCalled();
      expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledTimes(1);
      expect(txMock.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: CUSTOMER_ID,
          orderId: ORDER_ID,
          type: LoyaltyType.REVOKE,
          points: -2,
        },
      });

      // Trường hợp 2: khách còn 0 điểm -> số thu hồi = 0 -> KHÔNG ghi dòng REVOKE nào
      txMock.$queryRaw.mockClear();
      txMock.loyaltyTransaction.create.mockClear();
      txMock.$queryRaw.mockResolvedValueOnce([{ revoked: 0 }]);
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.PAID,
          pointsUsed: 0,
          pointsEarned: 6,
        }),
      );

      await service.cancelForUser(CUSTOMER_ID, ORDER_ID);

      expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(d) hủy đơn PAYMENT_FAILED hoặc PENDING không dùng điểm: không có dòng điểm nào', async () => {
      for (const st of [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED]) {
        prisma.order.findFirst.mockResolvedValueOnce(
          buildCancelableOrder({
            status: st,
            pointsUsed: 0,
            pointsEarned: 0,
          }),
        );

        await service.cancelForUser(CUSTOMER_ID, ORDER_ID);
      }

      expect(txMock.user.update).not.toHaveBeenCalled();
      expect(txMock.$queryRaw).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(e) nhân viên hủy qua PATCH /orders/:id/status: điểm của KHÁCH (chủ đơn order.userId) thay đổi đúng, không phải của nhân viên', async () => {
      const ownerId = '44444444-0000-0000-0000-000000000099';
      txMock.$queryRaw.mockResolvedValueOnce([{ revoked: 6 }]);
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          userId: ownerId,
          status: OrderStatus.PAID,
          pointsUsed: 10,
          pointsEarned: 6,
        }),
      );

      const res = await service.updateStatus(ORDER_ID, {
        status: OrderStatus.CANCELLED,
      });

      expect(res.status).toBe(OrderStatus.CANCELLED);
      expect(res.customer.id).toBe(ownerId);
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: ownerId },
        data: { loyaltyPoints: { increment: 10 } },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenNthCalledWith(1, {
        data: {
          userId: ownerId,
          orderId: ORDER_ID,
          type: LoyaltyType.REFUND,
          points: 10,
        },
      });
      expect(txMock.loyaltyTransaction.create).toHaveBeenNthCalledWith(2, {
        data: {
          userId: ownerId,
          orderId: ORDER_ID,
          type: LoyaltyType.REVOKE,
          points: -6,
        },
      });
    });

    it('(f) & (g) hủy lần hai hoặc hủy đơn PREPARING trả 409, không có dòng điểm mới, điểm không đổi', async () => {
      // (f) Hủy lần hai (đơn đang CANCELLED)
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.CANCELLED,
          pointsUsed: 10,
          pointsEarned: 6,
        }),
      );
      await expect(
        service.cancelForUser(CUSTOMER_ID, ORDER_ID),
      ).rejects.toThrow(new ConflictException(ORDER_CANNOT_CANCEL_MESSAGE));

      // (f) Tranh chấp đồng thời: count = 0 trong transaction
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.PAID,
          pointsUsed: 10,
          pointsEarned: 6,
        }),
      );
      txMock.order.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.cancelForUser(CUSTOMER_ID, ORDER_ID),
      ).rejects.toThrow(new ConflictException(ORDER_STATUS_CHANGED_MESSAGE));

      // (g) Hủy đơn PREPARING
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.PREPARING,
          pointsUsed: 10,
          pointsEarned: 6,
        }),
      );
      await expect(
        service.cancelForUser(CUSTOMER_ID, ORDER_ID),
      ).rejects.toThrow(new ConflictException(ORDER_CANNOT_CANCEL_MESSAGE));

      expect(txMock.user.update).not.toHaveBeenCalled();
      expect(txMock.$queryRaw).not.toHaveBeenCalled();
      expect(txMock.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('(h) đường hủy của khách (POST /orders/:id/cancel) và của nhân viên (PATCH /orders/:id/status) cho cùng kết quả điểm', async () => {
      // 1. Khách hủy
      txMock.$queryRaw.mockResolvedValueOnce([{ revoked: 6 }]);
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.PAID,
          pointsUsed: 10,
          pointsEarned: 6,
        }),
      );
      await service.cancelForUser(CUSTOMER_ID, ORDER_ID);

      const customerCalls = txMock.loyaltyTransaction.create.mock.calls.map(
        (c: unknown[]) => c[0],
      );

      // Reset mocks
      txMock.user.update.mockClear();
      txMock.$queryRaw.mockClear();
      txMock.loyaltyTransaction.create.mockClear();

      // 2. Nhân viên hủy
      txMock.$queryRaw.mockResolvedValueOnce([{ revoked: 6 }]);
      prisma.order.findFirst.mockResolvedValueOnce(
        buildCancelableOrder({
          status: OrderStatus.PAID,
          pointsUsed: 10,
          pointsEarned: 6,
        }),
      );
      await service.updateStatus(ORDER_ID, { status: OrderStatus.CANCELLED });

      const staffCalls = txMock.loyaltyTransaction.create.mock.calls.map(
        (c: unknown[]) => c[0],
      );

      expect(customerCalls).toEqual(staffCalls);
      expect(customerCalls).toHaveLength(2);
    });
  });
});
