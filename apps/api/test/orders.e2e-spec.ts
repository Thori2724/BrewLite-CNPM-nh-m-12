import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  IceLevel,
  OrderStatus,
  ReceiveType,
  Size,
  SugarLevel,
} from '@prisma/client';
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

  const PRODUCT_TEA_ID = 'aaaaaaaa-0000-4000-8000-000000009a01';
  const PRODUCT_CAKE_ID = 'aaaaaaaa-0000-4000-8000-000000009a02';
  const PRODUCT_OOS_ID = 'aaaaaaaa-0000-4000-8000-000000009a03';
  const TOPPING_PEARL_ID = 'bbbbbbbb-0000-4000-8000-000000009a01';

  const SUITE_PRODUCT_IDS = [PRODUCT_TEA_ID, PRODUCT_CAKE_ID, PRODUCT_OOS_ID];
  const SUITE_TOPPING_IDS = [TOPPING_PEARL_ID];
  const createdUserEmails: string[] = [];

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

  it('a) Tạo đơn hợp lệ: 201, status PENDING, tiền do server tự tính (bỏ qua giá từ client), orderNumber tăng dần và stock KHÔNG bị trừ', async () => {
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

    // Kiểm tra trực tiếp trong PostgreSQL: stock KHÔNG bị trừ (giữ nguyên 10 và 6)
    const teaInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    const cakeInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });
    expect(teaInDb.stock).toBe(10);
    expect(cakeInDb.stock).toBe(6);

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

  it('b) Chưa đăng nhập: trả 401 Unauthorized và không tạo đơn nào', async () => {
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

  it('c) Giỏ rỗng hoặc dữ liệu sai (quantity sai, món bánh gửi kèm size/toppingIds): trả 400 Bad Request và không tạo đơn nào', async () => {
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

  it('d) Món tạm hết (stock = 0): trả 409 từ chối CẢ ĐƠN kèm details [{ productId, name }], không tạo đơn nào và stock KHÔNG bị trừ', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { productId: PRODUCT_TEA_ID, quantity: 3 },
          { productId: PRODUCT_OOS_ID, quantity: 1 },
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
        },
      ],
    });
    expect(
      (res.body as { details: Array<Record<string, unknown>> }).details[0],
    ).not.toHaveProperty('available');

    const teaInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    const oosInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_OOS_ID },
    });
    expect(teaInDb.stock).toBe(10);
    expect(oosInDb.stock).toBe(0);

    const orderCount = await prisma.order.count({
      where: { userId },
    });
    expect(orderCount).toBe(0);
  });
});
