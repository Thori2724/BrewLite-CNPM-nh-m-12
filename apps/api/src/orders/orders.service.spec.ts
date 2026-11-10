import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  IceLevel,
  OrderStatus,
  ReceiveType,
  Size,
  SugarLevel,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_NOT_FOUND_MESSAGE } from '../products/products.constants';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService, TOPPING_NOT_FOUND_MESSAGE } from './orders.service';

describe('Orders (OrdersService & CreateOrderDto)', () => {
  let service: OrdersService;
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
    $transaction: jest.Mock;
  };

  const USER_ID = '99999999-0000-0000-0000-000000000001';

  const mockMilkTea = {
    id: '11111111-0000-0000-0000-000000000007',
    name: 'Trà sữa truyền thống',
    category: Category.MILK_TEA,
    basePrice: 35000,
  };

  const mockCake = {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: Category.CAKE,
    basePrice: 30000,
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

  describe('6 & 7. Kho cộng gộp và rollback giao dịch khi thiếu kho (409 Conflict)', () => {
    it('cộng gộp số lượng cùng một món ở 2 dòng và trừ đúng tổng quantity khi đủ kho', async () => {
      prisma.product.findMany.mockResolvedValue([mockMilkTea]);

      await service.create(USER_ID, {
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
    });

    it('ném 409 kèm details đúng khi cùng 1 món ở 2 dòng có tổng vượt stock', async () => {
      prisma.product.findMany.mockResolvedValue([mockCake]);
      txMock.product.updateMany.mockResolvedValue({ count: 0 });
      txMock.product.findMany.mockResolvedValue([
        {
          id: mockCake.id,
          name: mockCake.name,
          stock: 4,
        },
      ]);

      let caughtError: unknown;
      try {
        await service.create(USER_ID, {
          items: [
            { productId: mockCake.id, quantity: 3 },
            { productId: mockCake.id, quantity: 2 },
          ],
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      expect((caughtError as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: "Sản phẩm 'Bánh Croissant' không đủ số lượng trong kho",
        error: 'Conflict',
        details: [
          {
            productId: mockCake.id,
            name: 'Bánh Croissant',
            available: 4,
          },
        ],
      });
      expect(txMock.order.create).not.toHaveBeenCalled();
    });

    it('từ chối cả đơn (ném 409 bên trong transaction) khi có 1 món đủ kho nhưng 1 món thiếu kho', async () => {
      const mockOutOfStock = {
        id: '11111111-0000-0000-0000-000000000003',
        name: 'Bạc xỉu',
        category: Category.COFFEE,
        basePrice: 32000,
      };
      prisma.product.findMany.mockResolvedValue([mockMilkTea, mockOutOfStock]);

      txMock.product.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      txMock.product.findMany.mockResolvedValue([
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

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(caughtError).toBeInstanceOf(ConflictException);
      expect((caughtError as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: "Sản phẩm 'Bạc xỉu' không đủ số lượng trong kho",
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
  });
});
