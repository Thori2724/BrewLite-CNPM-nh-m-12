import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  IceLevel,
  LoyaltyType,
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
      await prisma.loyaltyTransaction.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });
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

    if (userIds.length > 0) {
      await prisma.loyaltyTransaction.deleteMany({
        where: { userId: { in: userIds } },
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
      await prisma.loyaltyTransaction.deleteMany({
        where: { orderId: { in: orderIds } },
      });
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

    await prisma.loyaltyTransaction.deleteMany({
      where: { userId },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { loyaltyPoints: 0 },
    });

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

  describe('VIỆC 9 - POST /orders dùng điểm (hợp đồng mục 0.10, 5.2)', () => {
    let codeFixed10k: string;
    let codeFixed20k: string;

    beforeAll(async () => {
      const suffix = String(Date.now()).slice(-6);
      codeFixed10k = `V9_FIX10_${suffix}`;
      codeFixed20k = `V9_FIX20_${suffix}`;

      createdPromotionCodes.push(codeFixed10k, codeFixed20k);

      await prisma.promotion.createMany({
        data: [
          {
            code: codeFixed10k,
            type: PromotionType.FIXED,
            value: 10000,
            maxDiscount: null,
            isActive: true,
          },
          {
            code: codeFixed20k,
            type: PromotionType.FIXED,
            value: 20000,
            maxDiscount: null,
            isActive: true,
          },
        ],
      });
    });

    it('(a) không gửi usePoints hoặc usePoints = false: pointsUsed = 0, điểm không đổi, không có dòng REDEEM', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 50 },
      });

      // 1. Không gửi usePoints
      const resOmitted = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
        })
        .expect(201);

      expect(resOmitted.body).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 0,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 30000,
      });

      // 2. usePoints = false
      const resFalse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          usePoints: false,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
        })
        .expect(201);

      expect(resFalse.body).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 0,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 30000,
      });

      const userInDb = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userInDb.loyaltyPoints).toBe(50);

      const redeemTxs = await prisma.loyaltyTransaction.findMany({
        where: { userId, type: LoyaltyType.REDEEM },
      });
      expect(redeemTxs).toHaveLength(0);
    });

    it('(b) ví dụ hợp đồng: subtotal 80.000, mã FIXED 10.000, khách có 10 điểm, usePoints = true -> pointsUsed = 10, totalAmount = 60.000, loyaltyPoints còn 0, có đúng 1 dòng REDEEM points = -10 gắn đúng orderId', async () => {
      // 1 Trà sữa size S có topping 5.000 (35.000 + 5.000 = 40.000) x 2 = 80.000
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 10 },
      });

      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codeFixed10k,
          usePoints: true,
          items: [
            {
              productId: PRODUCT_TEA_ID,
              quantity: 2,
              size: Size.S,
              toppingIds: [TOPPING_PEARL_ID],
            },
          ],
        })
        .expect(201);

      const createdOrder = res.body as {
        id: string;
        subtotalAmount: number;
        discountAmount: number;
        promotionCode: string | null;
        pointsUsed: number;
        pointsEarned: number;
        totalAmount: number;
      };

      expect(createdOrder).toMatchObject({
        subtotalAmount: 80000,
        discountAmount: 10000,
        promotionCode: codeFixed10k,
        pointsUsed: 10,
        pointsEarned: 0,
        totalAmount: 60000,
      });

      const userInDb = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userInDb.loyaltyPoints).toBe(0);

      const redeemTxs = await prisma.loyaltyTransaction.findMany({
        where: { userId },
      });
      expect(redeemTxs).toHaveLength(1);
      expect(redeemTxs[0]).toMatchObject({
        userId,
        orderId: createdOrder.id,
        type: LoyaltyType.REDEEM,
        points: -10,
      });
    });

    it('(c) điểm nhiều hơn mức cho phép: khách có 100 điểm, subtotal 30.000, không mã -> pointsUsed = 29, totalAmount = 1.000, điểm còn 71', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 100 },
      });

      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          usePoints: true,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
        })
        .expect(201);

      const createdOrder = res.body as { id: string };
      expect(res.body).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 0,
        promotionCode: null,
        pointsUsed: 29,
        pointsEarned: 0,
        totalAmount: 1000,
      });

      const userInDb = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userInDb.loyaltyPoints).toBe(71);

      const redeemTxs = await prisma.loyaltyTransaction.findMany({
        where: { userId },
      });
      expect(redeemTxs).toHaveLength(1);
      expect(redeemTxs[0]).toMatchObject({
        userId,
        orderId: createdOrder.id,
        type: LoyaltyType.REDEEM,
        points: -29,
      });
    });

    it('(d) có cả mã và điểm: totalAmount không bao giờ dưới 1.000', async () => {
      // 1. Subtotal 30.000 (1 bánh), mã FIXED 20.000 -> còn 10.000, khách có 50 điểm -> chỉ dùng 9 điểm, totalAmount = 1.000, điểm còn 41
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 50 },
      });

      const res1 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codeFixed20k,
          usePoints: true,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
        })
        .expect(201);

      expect(res1.body).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 20000,
        promotionCode: codeFixed20k,
        pointsUsed: 9,
        pointsEarned: 0,
        totalAmount: 1000,
      });

      const userAfter1 = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfter1.loyaltyPoints).toBe(41);

      // 2. Subtotal 15.000 (1 bánh quy nhỏ 15k), mã FIXED 20.000 -> discountAmount = 14.000, khách còn 41 điểm -> pointsUsed = 0, totalAmount = 1.000, điểm giữ nguyên 41, không tạo thêm dòng REDEEM
      const res2 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          promotionCode: codeFixed20k,
          usePoints: true,
          items: [{ productId: PRODUCT_SMALL_ID, quantity: 1 }],
        })
        .expect(201);

      expect(res2.body).toMatchObject({
        subtotalAmount: 15000,
        discountAmount: 14000,
        promotionCode: codeFixed20k,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 1000,
      });

      const userAfter2 = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfter2.loyaltyPoints).toBe(41);

      const txsForOrder2 = await prisma.loyaltyTransaction.findMany({
        where: { orderId: (res2.body as { id: string }).id },
      });
      expect(txsForOrder2).toHaveLength(0);
    });

    it('(e) usePoints = true nhưng khách có 0 điểm: pointsUsed = 0, không có dòng REDEEM, đặt đơn thành công', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 0 },
      });

      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          usePoints: true,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        subtotalAmount: 30000,
        discountAmount: 0,
        pointsUsed: 0,
        pointsEarned: 0,
        totalAmount: 30000,
      });

      const userInDb = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userInDb.loyaltyPoints).toBe(0);

      const redeemTxs = await prisma.loyaltyTransaction.findMany({
        where: { userId },
      });
      expect(redeemTxs).toHaveLength(0);
    });

    it('(f) tranh chấp điểm: mô phỏng câu cập nhật có điều kiện trả 0 dòng -> 409 "Số điểm không đủ, vui lòng thử lại", không có đơn, kho KHÔNG bị trừ, không có dòng REDEEM', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 20 },
      });

      const originalTransaction = prisma.$transaction.bind(
        prisma,
      ) as typeof prisma.$transaction;
      const txSpy = jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce(
          (
            fn: (tx: PrismaService) => Promise<unknown>,
            options?: { maxWait?: number; timeout?: number },
          ) =>
            originalTransaction(async (tx) => {
              const txUser = (
                tx as unknown as {
                  user: {
                    updateMany: () => Promise<{ count: number }>;
                  };
                }
              ).user;
              jest
                .spyOn(txUser, 'updateMany')
                .mockResolvedValueOnce({ count: 0 });
              return fn(tx as unknown as PrismaService);
            }, options),
        );

      try {
        const res = await request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            usePoints: true,
            items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
          })
          .expect(409);

        expect(res.body).toMatchObject({
          statusCode: 409,
          message: 'Số điểm không đủ, vui lòng thử lại',
        });
      } finally {
        txSpy.mockRestore();
      }

      // Chứng minh kho KHÔNG bị trừ (vẫn giữ nguyên 6)
      const cakeInDb = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_CAKE_ID },
      });
      expect(cakeInDb.stock).toBe(6);

      // Chứng minh không có đơn nào được tạo
      const orderCount = await prisma.order.count({ where: { userId } });
      expect(orderCount).toBe(0);

      // Chứng minh không có dòng REDEEM nào
      const redeemTxs = await prisma.loyaltyTransaction.findMany({
        where: { userId },
      });
      expect(redeemTxs).toHaveLength(0);
    });

    it('(g) thiếu hàng (409 kho) thì điểm KHÔNG bị trừ và không có dòng REDEEM', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 25 },
      });

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          usePoints: true,
          items: [
            { productId: PRODUCT_CAKE_ID, quantity: 1 },
            { productId: PRODUCT_OOS_ID, quantity: 1 },
          ],
        })
        .expect(409);

      const userInDb = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userInDb.loyaltyPoints).toBe(25);

      const cakeInDb = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_CAKE_ID },
      });
      expect(cakeInDb.stock).toBe(6);

      const redeemTxs = await prisma.loyaltyTransaction.findMany({
        where: { userId },
      });
      expect(redeemTxs).toHaveLength(0);
    });

    it('(h) usePoints không phải đúng/sai bị 400 với message là mảng chuỗi tiếng Anh', async () => {
      for (const badUsePoints of ['true', 'false', 1, 0, null, {}, []]) {
        const res = await request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            usePoints: badUsePoints,
            items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
          })
          .expect(400);

        expect(Array.isArray((res.body as { message: unknown }).message)).toBe(
          true,
        );
      }
    });

    it('(i) GET /orders/me và GET /orders/:id trả pointsUsed đúng', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 15 },
      });

      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          usePoints: true,
          items: [{ productId: PRODUCT_CAKE_ID, quantity: 2 }],
        })
        .expect(201);

      const orderId = (createRes.body as { id: string }).id;
      expect(createRes.body).toMatchObject({
        id: orderId,
        subtotalAmount: 60000,
        discountAmount: 0,
        pointsUsed: 15,
        pointsEarned: 0,
        totalAmount: 45000,
      });

      const meRes = await request(app.getHttpServer())
        .get('/orders/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const myOrders = meRes.body as Array<{ id: string }>;
      expect(myOrders.find((o) => o.id === orderId)).toMatchObject({
        id: orderId,
        subtotalAmount: 60000,
        discountAmount: 0,
        pointsUsed: 15,
        pointsEarned: 0,
        totalAmount: 45000,
      });

      const detailRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detailRes.body).toMatchObject({
        id: orderId,
        subtotalAmount: 60000,
        discountAmount: 0,
        pointsUsed: 15,
        pointsEarned: 0,
        totalAmount: 45000,
      });
    });
  });

  describe('VIỆC 13 - Rà soát cuối BE: Luồng đầy đủ, đặt đồng thời & dùng điểm đồng thời', () => {
    let codePercent10Cap15k: string;
    const concurrentCustomerTokens: string[] = [];

    beforeAll(async () => {
      const suffix = String(Date.now()).slice(-6);
      codePercent10Cap15k = `V13_BREW10_${suffix}`;
      createdPromotionCodes.push(codePercent10Cap15k);

      await prisma.promotion.create({
        data: {
          code: codePercent10Cap15k,
          type: PromotionType.PERCENT,
          value: 10,
          maxDiscount: 15000,
          isActive: true,
        },
      });

      const passwordHash = await bcrypt.hash('Password123@', 10);
      for (let i = 1; i <= 5; i++) {
        const email = `cust.v13.concurrent.${i}.${Date.now()}@example.com`;
        createdUserEmails.push(email);
        await prisma.user.create({
          data: {
            email,
            passwordHash,
            displayName: `Khách Đồng Thời ${i}`,
            role: Role.CUSTOMER,
            isActive: true,
            loyaltyPoints: 0,
          },
        });
        const loginRes = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'Password123@' })
          .expect(200);
        concurrentCustomerTokens.push(
          (loginRes.body as { accessToken: string }).accessToken,
        );
      }
    });

    it('1. Luồng đầy đủ (a -> b -> c -> d -> e nối tiếp): đặt đơn có mã + usePoints -> thanh toán + replay Idempotency-Key -> GET /loyalty/me -> hủy đơn PAID (hoàn kho, REFUND, REVOKE) -> hủy lần 2 trả 409', async () => {
      // Khởi tạo trạng thái ban đầu: khách có sẵn 20 điểm, món Trà sữa có stock = 10
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: 20 },
      });

      // (a) Đặt đơn 2 ly Trà sữa size M (35.000 + 6.000 + topping 5.000 = 46.000 x 2 = 92.000)
      // Mã PERCENT 10% (trần 15.000) -> discountAmount = floor(92.000 * 10 / 100) = 9.200
      // Khách có 20 điểm, usePoints = true -> pointsUsed = min(20, floor((92.000 - 9.200 - 1.000) / 1.000)) = min(20, 81) = 20
      // totalAmount = 92.000 - 9.200 - 20.000 = 62.800 (>= 1.000)
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          receiveType: ReceiveType.TAKE_AWAY,
          promotionCode: codePercent10Cap15k,
          usePoints: true,
          items: [
            {
              productId: PRODUCT_TEA_ID,
              quantity: 2,
              size: Size.M,
              toppingIds: [TOPPING_PEARL_ID],
            },
          ],
        })
        .expect(201);

      const createdOrder = orderRes.body as {
        id: string;
        orderNumber: number;
        status: OrderStatus;
        subtotalAmount: number;
        discountAmount: number;
        promotionCode: string | null;
        pointsUsed: number;
        pointsEarned: number;
        totalAmount: number;
      };

      expect(createdOrder).toMatchObject({
        status: OrderStatus.PENDING,
        subtotalAmount: 92000,
        discountAmount: 9200,
        promotionCode: codePercent10Cap15k,
        pointsUsed: 20,
        pointsEarned: 0,
        totalAmount: 62800,
      });
      expect(createdOrder.totalAmount).toBeGreaterThanOrEqual(1000);

      // Kiểm tra sau bước (a): kho giảm đúng (10 - 2 = 8), điểm giảm đúng (20 - 20 = 0), có dòng REDEEM (-20)
      const teaAfterStepA = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_TEA_ID },
      });
      expect(teaAfterStepA.stock).toBe(8);

      const userAfterStepA = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfterStepA.loyaltyPoints).toBe(0);

      const txsAfterStepA = await prisma.loyaltyTransaction.findMany({
        where: { userId, orderId: createdOrder.id },
      });
      expect(txsAfterStepA).toHaveLength(1);
      expect(txsAfterStepA[0]).toMatchObject({
        userId,
        orderId: createdOrder.id,
        type: LoyaltyType.REDEEM,
        points: -20,
      });

      // (b) Thanh toán thành công với totalAmount = 62.800 -> pointsEarned = floor(62800 / 10000) = 6
      const idemKey = `idem-v13-full-flow-${Date.now()}`;
      const payRes1 = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          orderId: createdOrder.id,
          method: 'WALLET',
          accountNumber: '0900000001',
        })
        .expect(201);

      expect(payRes1.body).toMatchObject({
        orderId: createdOrder.id,
        amount: 62800,
        accountLast4: '0001',
        status: 'SUCCESS',
        order: {
          id: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          status: OrderStatus.PAID,
          pointsEarned: 6,
        },
      });

      const userAfterPay1 = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfterPay1.loyaltyPoints).toBe(6);

      const earnTxsAfterPay1 = await prisma.loyaltyTransaction.findMany({
        where: { userId, orderId: createdOrder.id, type: LoyaltyType.EARN },
      });
      expect(earnTxsAfterPay1).toHaveLength(1);
      expect(earnTxsAfterPay1[0]).toMatchObject({
        userId,
        orderId: createdOrder.id,
        type: LoyaltyType.EARN,
        points: 6,
      });

      // Gửi lại cùng Idempotency-Key -> trả 200 OK, điểm không tăng thêm, không tạo thêm dòng EARN
      const payResReplay = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          orderId: createdOrder.id,
          method: 'WALLET',
          accountNumber: '0900000001',
        })
        .expect(200);

      expect(payResReplay.body).toEqual(payRes1.body);

      const userAfterReplay = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfterReplay.loyaltyPoints).toBe(6);

      const earnTxsAfterReplay = await prisma.loyaltyTransaction.findMany({
        where: { userId, orderId: createdOrder.id, type: LoyaltyType.EARN },
      });
      expect(earnTxsAfterReplay).toHaveLength(1);

      // (c) GET /loyalty/me: loyaltyPoints = 6 và danh sách giao dịch khớp (EARN +6, REDEEM -20)
      const loyaltyAfterPayRes = await request(app.getHttpServer())
        .get('/loyalty/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const loyaltyAfterPay = loyaltyAfterPayRes.body as {
        loyaltyPoints: number;
        transactions: Array<{
          id: string;
          type: LoyaltyType;
          points: number;
          orderNumber: number | null;
          createdAt: string;
        }>;
      };
      expect(loyaltyAfterPay.loyaltyPoints).toBe(6);
      expect(loyaltyAfterPay.transactions).toHaveLength(2);
      expect(loyaltyAfterPay.transactions[0]).toMatchObject({
        type: LoyaltyType.EARN,
        points: 6,
        orderNumber: createdOrder.orderNumber,
      });
      expect(loyaltyAfterPay.transactions[1]).toMatchObject({
        type: LoyaltyType.REDEEM,
        points: -20,
        orderNumber: createdOrder.orderNumber,
      });

      // (d) Hủy đơn PAID: đơn thành CANCELLED, kho hoàn đúng (8 + 2 = 10), điểm hoàn REFUND (+20), thu hồi REVOKE (-6), điểm cuối = 20 (>= 0)
      const cancelRes1 = await request(app.getHttpServer())
        .post(`/orders/${createdOrder.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(cancelRes1.body).toMatchObject({
        id: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        status: OrderStatus.CANCELLED,
        subtotalAmount: 92000,
        discountAmount: 9200,
        promotionCode: codePercent10Cap15k,
        pointsUsed: 20,
        pointsEarned: 6,
        totalAmount: 62800,
      });

      const teaAfterCancel = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_TEA_ID },
      });
      expect(teaAfterCancel.stock).toBe(10);

      const userAfterCancel = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfterCancel.loyaltyPoints).toBe(20);
      expect(userAfterCancel.loyaltyPoints).toBeGreaterThanOrEqual(0);

      const loyaltyAfterCancelRes = await request(app.getHttpServer())
        .get('/loyalty/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const loyaltyAfterCancel = loyaltyAfterCancelRes.body as {
        loyaltyPoints: number;
        transactions: Array<{
          id: string;
          type: LoyaltyType;
          points: number;
          orderNumber: number | null;
          createdAt: string;
        }>;
      };
      expect(loyaltyAfterCancel.loyaltyPoints).toBe(20);
      expect(loyaltyAfterCancel.transactions).toHaveLength(4);

      const txMapByType = new Map(
        loyaltyAfterCancel.transactions.map((t) => [t.type, t.points]),
      );
      expect(txMapByType.get(LoyaltyType.REDEEM)).toBe(-20);
      expect(txMapByType.get(LoyaltyType.EARN)).toBe(6);
      expect(txMapByType.get(LoyaltyType.REFUND)).toBe(20);
      expect(txMapByType.get(LoyaltyType.REVOKE)).toBe(-6);
      for (const tx of loyaltyAfterCancel.transactions) {
        expect(tx.orderNumber).toBe(createdOrder.orderNumber);
      }

      // (e) Hủy lần hai trả 409 và không thay đổi gì thêm
      const cancelRes2 = await request(app.getHttpServer())
        .post(`/orders/${createdOrder.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);

      expect(cancelRes2.body).toMatchObject({
        statusCode: 409,
        message: 'Không thể hủy đơn ở trạng thái hiện tại',
      });

      const teaAfterSecondCancel = await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_TEA_ID },
      });
      expect(teaAfterSecondCancel.stock).toBe(10);

      const userAfterSecondCancel = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfterSecondCancel.loyaltyPoints).toBe(20);

      const txCountAfterSecondCancel = await prisma.loyaltyTransaction.count({
        where: { userId, orderId: createdOrder.id },
      });
      expect(txCountAfterSecondCancel).toBe(4);
    });

    it('2. Đặt đồng thời (3 vòng liên tiếp): món còn stock = 3, gửi đồng thời 5 request POST /orders (mỗi request 1 ly) bằng Promise.all -> đúng 3 đơn 201, 2 request 409, stock cuối = 0', async () => {
      // Làm ấm kết nối trong pool trước khi bắn đồng thời
      await Promise.all(
        Array.from({ length: 5 }, () => prisma.$queryRaw`SELECT 1`),
      );

      for (let round = 1; round <= 3; round++) {
        // Đặt lại stock = 3 trước mỗi vòng
        await prisma.product.update({
          where: { id: PRODUCT_TEA_ID },
          data: { stock: 3 },
        });

        const responses = await Promise.all(
          concurrentCustomerTokens.map((token) =>
            request(app.getHttpServer())
              .post('/orders')
              .set('Authorization', `Bearer ${token}`)
              .send({
                items: [{ productId: PRODUCT_TEA_ID, quantity: 1 }],
              }),
          ),
        );

        const successResponses = responses.filter((r) => r.status === 201);
        const conflictResponses = responses.filter((r) => r.status === 409);

        expect(successResponses).toHaveLength(3);
        expect(conflictResponses).toHaveLength(2);

        for (const conflictRes of conflictResponses) {
          expect(conflictRes.body).toMatchObject({
            statusCode: 409,
            error: 'Conflict',
          });
        }

        const productAfterRound = await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_TEA_ID },
        });
        expect(productAfterRound.stock).toBe(0);
      }
    });

    it('3. Hai đơn dùng điểm đồng thời của cùng một khách chỉ đủ điểm cho 1 đơn: không bao giờ làm điểm âm; đơn thứ hai hoặc được trừ ít điểm hơn theo đúng công thức, hoặc trả 409 "Số điểm không đủ, vui lòng thử lại"', async () => {
      await Promise.all(
        Array.from({ length: 4 }, () => prisma.$queryRaw`SELECT 1`),
      );

      for (let round = 1; round <= 3; round++) {
        // Khách chỉ có 20 điểm; mỗi đơn là 1 bánh 30.000đ (nếu đủ điểm có thể dùng tối đa 29 điểm)
        await prisma.user.update({
          where: { id: userId },
          data: { loyaltyPoints: 20 },
        });
        await prisma.product.update({
          where: { id: PRODUCT_CAKE_ID },
          data: { stock: 10 },
        });

        const [res1, res2] = await Promise.all([
          request(app.getHttpServer())
            .post('/orders')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              usePoints: true,
              items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
            }),
          request(app.getHttpServer())
            .post('/orders')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              usePoints: true,
              items: [{ productId: PRODUCT_CAKE_ID, quantity: 1 }],
            }),
        ]);

        const statuses = [res1.status, res2.status].sort((a, b) => a - b);
        const userAfterRound = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
        });

        // Điểm không bao giờ âm; đúng hết 20 điểm đã được trừ tổng cộng
        expect(userAfterRound.loyaltyPoints).toBe(0);
        expect(userAfterRound.loyaltyPoints).toBeGreaterThanOrEqual(0);

        if (statuses[0] === 201 && statuses[1] === 409) {
          // Trường hợp 2 request cùng đọc thấy 20 điểm: 1 đơn thắng trừ 20 điểm, đơn kia bị chặn bởi updateMany (loyaltyPoints >= 20) -> 409
          const winner = res1.status === 201 ? res1 : res2;
          const loser = res1.status === 409 ? res1 : res2;

          expect(winner.body).toMatchObject({
            subtotalAmount: 30000,
            pointsUsed: 20,
            totalAmount: 10000,
          });
          expect(loser.body).toMatchObject({
            statusCode: 409,
            message: 'Số điểm không đủ, vui lòng thử lại',
          });
        } else {
          // Trường hợp request 2 đọc sau khi request 1 đã trừ 20 điểm: đơn 1 dùng 20 điểm, đơn 2 dùng 0 điểm
          expect(statuses).toEqual([201, 201]);
          const pointsUsedList = [
            (res1.body as { pointsUsed: number }).pointsUsed,
            (res2.body as { pointsUsed: number }).pointsUsed,
          ].sort((a, b) => a - b);
          expect(pointsUsedList).toEqual([0, 20]);
        }
      }
    });
  });
});
