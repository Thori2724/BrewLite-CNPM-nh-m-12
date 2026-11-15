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
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
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
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersController } from './orders.controller';
import {
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
    product: {
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    order: {
      create: jest.Mock;
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
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
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
              totalAmount: data.totalAmount,
              createdAt: new Date('2026-11-05T03:00:00.000Z'),
              updatedAt: new Date('2026-11-05T03:00:00.000Z'),
            }),
          ),
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

  describe('6 & 7. Kiểm tra món đang bán / tạm hết (stock > 0 vs stock = 0, 409 Conflict)', () => {
    it('món đang bán (stock > 0) thì tạo đơn thành công và stock KHÔNG đổi', async () => {
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
      expect(txMock.order.create).toHaveBeenCalledTimes(1);
      expect(txMock.orderItem.create).toHaveBeenCalledTimes(2);
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
    });

    it('từ chối cả đơn với 409 kèm details (không có available) và không tạo đơn khi có 1 món tạm hết (stock = 0)', async () => {
      const mockOutOfStock = {
        id: '11111111-0000-0000-0000-000000000003',
        name: 'Bạc xỉu',
        category: Category.COFFEE,
        basePrice: 32000,
        stock: 0,
      };
      prisma.product.findMany.mockResolvedValue([mockMilkTea, mockOutOfStock]);

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
          },
        ],
      });
      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.orderItem.create).not.toHaveBeenCalled();
      expect(txMock.product.updateMany).not.toHaveBeenCalled();
    });

    it('liệt kê đủ các món tạm hết trong details khi đơn có nhiều món tạm hết (stock = 0) và không tạo đơn nào', async () => {
      const mockBacXiu = {
        id: '11111111-0000-0000-0000-000000000003',
        name: 'Bạc xỉu',
        category: Category.COFFEE,
        basePrice: 32000,
        stock: 0,
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

      let caughtError: unknown;
      try {
        await service.create(USER_ID, {
          items: [
            { productId: mockBacXiu.id, quantity: 1 },
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
        message: "Sản phẩm 'Bạc xỉu' hiện đã tạm hết",
        error: 'Conflict',
        details: [
          {
            productId: mockBacXiu.id,
            name: 'Bạc xỉu',
          },
          {
            productId: mockMatcha.id,
            name: 'Trà sữa matcha',
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
        prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

        const result = await controller.updateStatus(ORDER_ID, {
          status: toStatus,
        });

        expect(prisma.order.updateMany).toHaveBeenLastCalledWith({
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
        prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

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
        expect(prisma.order.updateMany).toHaveBeenLastCalledWith({
          where: {
            id: ORDER_ID,
            status: fromStatus,
          },
          data: {
            status: OrderStatus.CANCELLED,
          },
        });
        expect(result).toEqual({
          id: ORDER_ID,
          orderNumber: 1001,
          status: OrderStatus.CANCELLED,
          receiveType: ReceiveType.TAKE_AWAY,
          note: 'Cho xin thêm quai xách giấy',
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

    it('không thay đổi bảng Payment khi hủy đơn đang PAID (Payment vẫn giữ nguyên SUCCESS)', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(
        buildUserOrder(OrderStatus.PAID),
      );
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

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
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('ném 409 "Không thể hủy đơn ở trạng thái hiện tại" khi đơn đang PREPARING, READY, COMPLETED hoặc CANCELLED', async () => {
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

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('ném 409 "Trạng thái đơn đã thay đổi, vui lòng tải lại" khi cập nhật có điều kiện thất bại (count = 0)', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(
        buildUserOrder(OrderStatus.PAID),
      );
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.cancelForUser(USER_ID, ORDER_ID)).rejects.toThrow(
        new ConflictException(ORDER_STATUS_CHANGED_MESSAGE),
      );

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: ORDER_ID,
          status: OrderStatus.PAID,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
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
});
