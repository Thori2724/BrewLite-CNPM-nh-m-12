import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  IceLevel,
  OrderStatus,
  PromotionType,
  ReceiveType,
  Role,
  Size,
  SugarLevel,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/app-config';
import { PrismaService } from '../src/prisma/prisma.service';

export function assertSafeTestDatabaseUrl(
  rawUrl: string | undefined = process.env.TEST_DATABASE_URL,
): string {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    throw new Error(
      'Từ chối chạy integration test: Thiếu biến môi trường TEST_DATABASE_URL. Vui lòng đặt TEST_DATABASE_URL trỏ tới database test có tên kết thúc bằng "_test".',
    );
  }

  let parsed: URL;
  let dbName = '';
  try {
    parsed = new URL(trimmed);
    dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error(
      'Từ chối chạy integration test: Giá trị TEST_DATABASE_URL không phải là URL kết nối PostgreSQL hợp lệ.',
    );
  }

  if (!dbName || !dbName.endsWith('_test')) {
    throw new Error(
      `Từ chối chạy integration test để bảo vệ dữ liệu: Tên database trong TEST_DATABASE_URL ("${dbName || 'rỗng'}") bắt buộc phải kết thúc bằng "_test".`,
    );
  }

  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '20');
  }

  return parsed.toString();
}

describe('Orders Integration (POST /orders)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let staffToken: string;

  const PRODUCT_TEA_ID = 'aaaaaaaa-0000-4000-8000-000000009a01';
  const PRODUCT_CAKE_ID = 'aaaaaaaa-0000-4000-8000-000000009a02';
  const PRODUCT_OOS_ID = 'aaaaaaaa-0000-4000-8000-000000009a03';
  const PRODUCT_SMALL_ID = 'aaaaaaaa-0000-4000-8000-000000009a04';
  const TOPPING_PEARL_ID = 'bbbbbbbb-0000-4000-8000-000000009a01';

  const SUITE_PRODUCT_IDS = [
    PRODUCT_TEA_ID,
    PRODUCT_CAKE_ID,
    PRODUCT_OOS_ID,
    PRODUCT_SMALL_ID,
  ];
  const SUITE_TOPPING_IDS = [TOPPING_PEARL_ID];
  const createdUserEmails: string[] = [];
  const createdPromotionCodes: string[] = [];

  async function cleanupSuiteData() {
    if (!prisma) {
      return;
    }

    const users =
      createdUserEmails.length > 0
        ? await prisma.user.findMany({
            where: { email: { in: createdUserEmails } },
            select: { id: true },
          })
        : [];
    const userIds = users.map((u) => u.id);

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
          { items: { some: { productId: { in: SUITE_PRODUCT_IDS } } } },
        ],
      },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length > 0) {
      await prisma.orderItemTopping.deleteMany({
        where: {
          orderItem: {
            orderId: { in: orderIds },
          },
        },
      });
      await prisma.payment.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });
      await prisma.orderItem.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });
      await prisma.order.deleteMany({
        where: {
          id: { in: orderIds },
        },
      });
    }

    await prisma.orderItemTopping.deleteMany({
      where: { toppingId: { in: SUITE_TOPPING_IDS } },
    });
    await prisma.orderItem.deleteMany({
      where: { productId: { in: SUITE_PRODUCT_IDS } },
    });
    await prisma.topping.deleteMany({
      where: { id: { in: SUITE_TOPPING_IDS } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: SUITE_PRODUCT_IDS } },
    });

    if (createdPromotionCodes.length > 0) {
      await prisma.promotion.deleteMany({
        where: { code: { in: createdPromotionCodes } },
      });
    }

    if (userIds.length > 0) {
      await prisma.payment.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  }

  beforeAll(async () => {
    const safeTestDbUrl = assertSafeTestDatabaseUrl();
    process.env.DATABASE_URL = safeTestDbUrl;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-brewlite-9a';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupSuiteData();

    const uniqueEmail = `orders.10a.${Date.now()}@example.com`;
    createdUserEmails.push(uniqueEmail);

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: uniqueEmail,
        password: 'Password123@',
        displayName: 'Khách Integration 10a',
      })
      .expect(201);

    const registerBody = registerRes.body as { id: string };
    userId = registerBody.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: uniqueEmail,
        password: 'Password123@',
      })
      .expect(200);

    const loginBody = loginRes.body as { accessToken: string };
    accessToken = loginBody.accessToken;

    const staffEmail = `staff.orders.10a.${Date.now()}@example.com`;
    createdUserEmails.push(staffEmail);
    const passwordHash = await bcrypt.hash('Password123@', 10);
    await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash,
        displayName: 'Nhân viên Orders E2E',
        role: Role.STAFF,
        isActive: true,
      },
    });
    const staffLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: staffEmail,
        password: 'Password123@',
      })
      .expect(200);
    staffToken = (staffLoginRes.body as { accessToken: string }).accessToken;
  });

  beforeEach(async () => {
    const existingOrders = await prisma.order.findMany({
      where: { userId },
      select: { id: true },
    });
    const orderIds = existingOrders.map((o) => o.id);

    if (orderIds.length > 0) {
      await prisma.orderItemTopping.deleteMany({
        where: { orderItem: { orderId: { in: orderIds } } },
      });
      await prisma.payment.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: orderIds } },
      });
    }

    await prisma.product.upsert({
      where: { id: PRODUCT_TEA_ID },
      update: {
        name: 'Trà sữa truyền thống 10a',
        category: Category.MILK_TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/tea-10a.jpg',
        stock: 10,
        isVisible: true,
      },
      create: {
        id: PRODUCT_TEA_ID,
        name: 'Trà sữa truyền thống 10a',
        category: Category.MILK_TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/tea-10a.jpg',
        stock: 10,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_CAKE_ID },
      update: {
        name: 'Bánh sừng bò 10a',
        category: Category.CAKE,
        basePrice: 30000,
        imageUrl: 'https://example.com/cake-10a.jpg',
        stock: 6,
        isVisible: true,
      },
      create: {
        id: PRODUCT_CAKE_ID,
        name: 'Bánh sừng bò 10a',
        category: Category.CAKE,
        basePrice: 30000,
        imageUrl: 'https://example.com/cake-10a.jpg',
        stock: 6,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_OOS_ID },
      update: {
        name: 'Bạc xỉu tạm hết 10a',
        category: Category.COFFEE,
        basePrice: 32000,
        imageUrl: 'https://example.com/oos-10a.jpg',
        stock: 0,
        isVisible: true,
      },
      create: {
        id: PRODUCT_OOS_ID,
        name: 'Bạc xỉu tạm hết 10a',
        category: Category.COFFEE,
        basePrice: 32000,
        imageUrl: 'https://example.com/oos-10a.jpg',
        stock: 0,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_SMALL_ID },
      update: {
        name: 'Bánh quy nhỏ 15k',
        category: Category.CAKE,
        basePrice: 15000,
        imageUrl: 'https://example.com/cookie-15k.jpg',
        stock: 10,
        isVisible: true,
      },
      create: {
        id: PRODUCT_SMALL_ID,
        name: 'Bánh quy nhỏ 15k',
        category: Category.CAKE,
        basePrice: 15000,
        imageUrl: 'https://example.com/cookie-15k.jpg',
        stock: 10,
        isVisible: true,
      },
    });

    await prisma.topping.upsert({
      where: { id: TOPPING_PEARL_ID },
      update: {
        name: 'Trân châu đen 10a',
        price: 5000,
        isVisible: true,
      },
      create: {
        id: TOPPING_PEARL_ID,
        name: 'Trân châu đen 10a',
        price: 5000,
        isVisible: true,
      },
    });
  });

  afterAll(async () => {
    await cleanupSuiteData();
    if (app) {
      await app.close();
    }
  });

  it('0. Khóa an toàn từ chối ngay khi thiếu TEST_DATABASE_URL hoặc tên DB không kết thúc bằng "_test"', () => {
    expect(() => assertSafeTestDatabaseUrl('')).toThrow(
      /Thiếu biến môi trường TEST_DATABASE_URL/,
    );
    expect(() =>
      assertSafeTestDatabaseUrl(
        'postgresql://brewlite:brewlite@localhost:5432/brewlite?schema=public',
      ),
    ).toThrow(/bắt buộc phải kết thúc bằng "_test"/);
  });

  it('a) Tạo đơn hợp lệ: 201, status PENDING, tiền do server tự tính (bỏ qua giá từ client), orderNumber tăng dần và stock bị trừ đúng số lượng', async () => {
    // Đơn 1: 2 ly Trà sữa size M (35000 + 6000 + topping 5000 = 46000 x 2 = 92000) + 1 Bánh (30000) = 122000
    const res1 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Đơn tích hợp 1',
        totalAmount: 1,
        items: [
          {
            productId: PRODUCT_TEA_ID,
            quantity: 2,
            size: Size.M,
            sugarLevel: SugarLevel.P70,
            iceLevel: IceLevel.NORMAL,
            toppingIds: [TOPPING_PEARL_ID],
            unitPrice: 1000,
            lineTotal: 2000,
          },
          {
            productId: PRODUCT_CAKE_ID,
            quantity: 1,
            unitPrice: 1000,
            lineTotal: 1000,
          },
        ],
      })
      .expect(201);

    const body1 = res1.body as {
      id: string;
      orderNumber: number;
      totalAmount: number;
      status: OrderStatus;
      items: Array<{
        productId: string;
        unitPrice: number;
        lineTotal: number;
      }>;
    };
    expect(body1.status).toBe(OrderStatus.PENDING);
    expect(body1.totalAmount).toBe(122000);
    expect(body1.items).toHaveLength(2);
    expect(body1.items[0]).toMatchObject({
      productId: PRODUCT_TEA_ID,
      unitPrice: 46000,
      lineTotal: 92000,
    });
    expect(body1.items[1]).toMatchObject({
      productId: PRODUCT_CAKE_ID,
      unitPrice: 30000,
      lineTotal: 30000,
    });

    // Đơn 2: 1 Bánh (30000)
    const res2 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          {
            productId: PRODUCT_CAKE_ID,
            quantity: 1,
          },
        ],
      })
      .expect(201);

    const body2 = res2.body as {
      id: string;
      orderNumber: number;
      totalAmount: number;
      status: OrderStatus;
    };
    expect(body2.status).toBe(OrderStatus.PENDING);
    expect(body2.totalAmount).toBe(30000);
    expect(body2.orderNumber).toBeGreaterThan(body1.orderNumber);

    // Kiểm tra trực tiếp trong PostgreSQL: stock đã bị trừ đúng (10 - 2 = 8, 6 - 1 - 1 = 4)
    const teaInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    const cakeInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });
    expect(teaInDb.stock).toBe(8);
    expect(cakeInDb.stock).toBe(4);

    const ordersInDb = await prisma.order.findMany({
      where: { userId },
      orderBy: { orderNumber: 'asc' },
      include: { items: { include: { toppings: true } } },
    });
    expect(ordersInDb).toHaveLength(2);
    expect(ordersInDb[0].totalAmount).toBe(122000);
    expect(ordersInDb[1].totalAmount).toBe(30000);
    expect(ordersInDb[1].orderNumber).toBeGreaterThan(
      ordersInDb[0].orderNumber,
    );
  });

  it('b) Cùng một món khác size ở 2 dòng được gộp số lượng khi trừ kho; nếu tổng vượt kho thì trả 409 kèm available và kho không đổi', async () => {
    // 1. Gộp thành công: Trà sữa stock = 10, đặt 3 ly size S + 4 ly size L = 7 -> stock còn 3
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { productId: PRODUCT_TEA_ID, quantity: 3, size: Size.S },
          { productId: PRODUCT_TEA_ID, quantity: 4, size: Size.L },
        ],
      })
      .expect(201);

    const teaAfterFirst = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    expect(teaAfterFirst.stock).toBe(3);

    // 2. Gộp vượt kho: Trà sữa còn 3, đặt 2 ly size S + 2 ly size M = 4 (> 3) -> 409, stock giữ nguyên 3
    const conflictRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { productId: PRODUCT_TEA_ID, quantity: 2, size: Size.S },
          { productId: PRODUCT_TEA_ID, quantity: 2, size: Size.M },
        ],
      })
      .expect(409);

    expect(conflictRes.body).toEqual({
      statusCode: 409,
      message: "Sản phẩm 'Trà sữa truyền thống 10a' chỉ còn 3",
      error: 'Conflict',
      details: [
        {
          productId: PRODUCT_TEA_ID,
          name: 'Trà sữa truyền thống 10a',
          available: 3,
        },
      ],
    });

    const teaAfterConflict = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    expect(teaAfterConflict.stock).toBe(3);
  });

  it('c) Chưa đăng nhập: trả 401 Unauthorized và không tạo đơn nào', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({
        items: [{ productId: PRODUCT_TEA_ID, quantity: 1 }],
      })
      .expect(401);

    const orderCount = await prisma.order.count({
      where: { userId },
    });
    expect(orderCount).toBe(0);
  });

  it('d) Giỏ rỗng hoặc dữ liệu sai (quantity sai, món bánh gửi kèm size/toppingIds): trả 400 Bad Request và không tạo đơn nào', async () => {
    // 1. Giỏ rỗng
    const emptyCartRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [] })
      .expect(400);
    expect(
      Array.isArray((emptyCartRes.body as { message: unknown }).message),
    ).toBe(true);

    // 2. Dữ liệu sai (quantity = 0, productId không phải UUID)
    const invalidDataRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [{ productId: 'not-a-uuid', quantity: 0 }],
      })
      .expect(400);
    expect(
      Array.isArray((invalidDataRes.body as { message: unknown }).message),
    ).toBe(true);

    // 3. Món bánh (CAKE) gửi kèm size / toppingIds
    const cakeOptionRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          {
            productId: PRODUCT_CAKE_ID,
            quantity: 1,
            size: Size.M,
            toppingIds: [TOPPING_PEARL_ID],
          },
        ],
      })
      .expect(400);
    expect(
      Array.isArray((cakeOptionRes.body as { message: unknown }).message),
    ).toBe(true);

    const orderCount = await prisma.order.count({
      where: { userId },
    });
    expect(orderCount).toBe(0);
  });

  it('e) Không đủ hàng / tạm hết: trả 409 từ chối CẢ ĐƠN kèm details [{ productId, name, available }], rollback kho các món khác và không tạo đơn nào', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { productId: PRODUCT_TEA_ID, quantity: 3 },
          { productId: PRODUCT_OOS_ID, quantity: 1 },
          { productId: PRODUCT_CAKE_ID, quantity: 8 },
        ],
      })
      .expect(409);

    expect(res.body).toEqual({
      statusCode: 409,
      message: "Sản phẩm 'Bạc xỉu tạm hết 10a' hiện đã tạm hết",
      error: 'Conflict',
      details: [
        {
          productId: PRODUCT_OOS_ID,
          name: 'Bạc xỉu tạm hết 10a',
          available: 0,
        },
        {
          productId: PRODUCT_CAKE_ID,
          name: 'Bánh sừng bò 10a',
          available: 6,
        },
      ],
    });

    const teaInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    const cakeInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });
    const oosInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_OOS_ID },
    });
    expect(teaInDb.stock).toBe(10);
    expect(cakeInDb.stock).toBe(6);
    expect(oosInDb.stock).toBe(0);

    const orderCount = await prisma.order.count({
      where: { userId },
    });
    expect(orderCount).toBe(0);
  });

  describe('VIỆC 8 - POST /orders áp mã giảm giá & 5 trường mới trên mọi endpoint trả đơn', () => {
    let codePercentNoCap: string;
    let codePercentCap15k: string;
    let codeFixed20k: string;
    let codeInactive: string;

    beforeAll(async () => {
      const suffix = String(Date.now()).slice(-6);
      codePercentNoCap = `V8_PER10_${suffix}`;
      codePercentCap15k = `V8_CAP15_${suffix}`;
      codeFixed20k = `V8_FIX20_${suffix}`;
      codeInactive = `V8_OFF_${suffix}`;

      createdPromotionCodes.push(
        codePercentNoCap,
        codePercentCap15k,
        codeFixed20k,
        codeInactive,
      );

      await prisma.promotion.createMany({
        data: [
          {
            code: codePercentNoCap,
            type: PromotionType.PERCENT,
            value: 10,
            maxDiscount: null,
            isActive: true,
          },
          {
            code: codePercentCap15k,
            type: PromotionType.PERCENT,
            value: 20,
            maxDiscount: 15000,
            isActive: true,
          },
          {
            code: codeFixed20k,
            type: PromotionType.FIXED,
            value: 20000,
            maxDiscount: null,
            isActive: true,
          },
          {
            code: codeInactive,
            type: PromotionType.PERCENT,
            value: 15,
            maxDiscount: null,
            isActive: false,
          },
        ],
      });
    });

    it('(a) & (j) Không gửi mã & client gửi kèm totalAmount/discountAmount/subtotalAmount: bị bỏ qua, subtotalAmount = totalAmount, discountAmount = 0, promotionCode = null, pointsUsed = 0, pointsEarned = 0', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          subtotalAmount: 1000,
          discountAmount: 50000,
          totalAmount: 1000,
          pointsUsed: 10,
          pointsEarned: 100,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 2 }],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 0,
        promotionCode: null,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 60000,
      });
    });

    it('(b), (c), (d), (g) Áp mã PERCENT không trần, PERCENT có trần, FIXED, chuẩn hóa mã viết thường có khoảng trắng thành chữ HOA, và mức giảm không làm totalAmount dưới 1.000đ', async () => {
      // (b) & (d) PERCENT 10% không trần + mã viết thường có khoảng trắng trên đơn 2 bánh (60.000) -> discount 6.000, total 54.000
      const resNoCap = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: `  ${codePercentNoCap.toLowerCase()}  `,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 2 }],
        })
        .expect(201);

      expect(resNoCap.body).toMatchObject({
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: codePercentNoCap,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      });

      // (b) PERCENT 20% có trần 15.000 trên đơn 3 bánh (90.000) -> raw 18.000, trần 15.000 -> total 75.000
      const resCap = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codePercentCap15k,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 3 }],
        })
        .expect(201);

      expect(resCap.body).toMatchObject({
        subtotalAmount: 90000,
        discountAmount: 15000,
        promotionCode: codePercentCap15k,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 75000,
      });

      // (c) FIXED 20.000 trên đơn 2 trà sữa size S (70.000) -> discount 20.000, total 50.000
      const resFixed = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codeFixed20k,
          items: [{ productId: PRODUCT_TEA_ID, quantity: 2, size: Size.S }],
        })
        .expect(201);

      expect(resFixed.body).toMatchObject({
        subtotalAmount: 70000,
        discountAmount: 20000,
        promotionCode: codeFixed20k,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 50000,
      });

      // (g) FIXED 20.000 trên đơn 15.000 (1 bánh quy nhỏ 15k) -> discountAmount = 14.000, totalAmount = 1.000
      const resFloor = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codeFixed20k,
          items: [{ productId: PRODUCT_SMALL_ID, quantity: 1 }],
        })
        .expect(201);

      expect(resFloor.body).toMatchObject({
        subtotalAmount: 15000,
        discountAmount: 14000,
        promotionCode: codeFixed20k,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 1000,
      });
    });

    it('(e) & (f) Mã không tồn tại -> 404 "Mã giảm giá không tồn tại", mã tắt -> 409 "Mã giảm giá đã ngừng áp dụng", không tạo đơn và kho không đổi; promotionCode rỗng/quá 30 ký tự -> 400 mảng chuỗi tiếng Anh', async () => {
      // promotionCode rỗng sau khi trim hoặc quá 30 ký tự -> 400
      for (const badCode of ['', '   ', 'A'.repeat(31), 12345, null]) {
        const res400 = await request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            promotionCode: badCode,
            items: [{ productId: PRODUCT_TEA_ID, quantity: 1 }],
          })
          .expect(400);
        expect(
          Array.isArray((res400.body as { message: unknown }).message),
        ).toBe(true);
      }

      // (e) Mã không tồn tại -> 404 và kho vẫn nguyên 10
      const res404 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: 'MA_KHONG_TON_TAI_V8',
          items: [{ productId: PRODUCT_TEA_ID, quantity: 2 }],
        })
        .expect(404);
      expect(res404.body).toMatchObject({
        statusCode: 404,
        message: 'Mã giảm giá không tồn tại',
      });

      const teaAfter404 = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_TEA_ID },
      });
      expect(teaAfter404.stock).toBe(10);

      // (f) Mã đang tắt -> 409 và kho vẫn nguyên 10
      const res409 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: ` ${codeInactive.toLowerCase()} `,
          items: [{ productId: PRODUCT_TEA_ID, quantity: 2 }],
        })
        .expect(409);
      expect(res409.body).toMatchObject({
        statusCode: 409,
        message: 'Mã giảm giá đã ngừng áp dụng',
      });

      const teaAfter409 = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_TEA_ID },
      });
      expect(teaAfter409.stock).toBe(10);

      const orderCount = await prisma.order.count({ where: { userId } });
      expect(orderCount).toBe(0);
    });

    it('(h) & (i) 5 trường mới xuất hiện trên cả 6 endpoint trả đơn (POST /orders, GET /orders/me, GET /orders/:id, GET /orders, PATCH /orders/:id/status, POST /orders/:id/cancel) và hủy đơn không làm đổi discountAmount/promotionCode', async () => {
      const expectedPromoFields = {
        subtotalAmount: 60000,
        discountAmount: 6000,
        promotionCode: codePercentNoCap,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 54000,
      };

      // 1. POST /orders
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codePercentNoCap,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 2 }],
        })
        .expect(201);
      const orderId = (createRes.body as { id: string }).id;
      expect(createRes.body).toMatchObject(expectedPromoFields);

      // 2. GET /orders/me
      const meRes = await request(app.getHttpServer())
        .get('/orders/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const myList = meRes.body as Array<{ id: string }>;
      expect(myList.find((o) => o.id === orderId)).toMatchObject(
        expectedPromoFields,
      );

      // 3. GET /orders/:id
      const detailRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detailRes.body).toMatchObject(expectedPromoFields);

      // 4. GET /orders (STAFF)
      const staffListRes = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      const staffList = staffListRes.body as Array<{ id: string }>;
      expect(staffList.find((o) => o.id === orderId)).toMatchObject(
        expectedPromoFields,
      );

      // 5. POST /orders/:id/cancel & (i) giữ nguyên discountAmount và promotionCode
      const cancelRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(cancelRes.body).toMatchObject({
        id: orderId,
        status: OrderStatus.CANCELLED,
        ...expectedPromoFields,
      });

      // 6. PATCH /orders/:id/status (tạo thêm 1 đơn có mã rồi chuyển trạng thái qua STAFF)
      const createRes2 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codePercentNoCap,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 2 }],
        })
        .expect(201);
      const order2Id = (createRes2.body as { id: string }).id;

      const patchStatusRes = await request(app.getHttpServer())
        .patch(`/orders/${order2Id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);
      expect(patchStatusRes.body).toMatchObject({
        id: order2Id,
        status: OrderStatus.CANCELLED,
        ...expectedPromoFields,
      });
    });
  });
});
