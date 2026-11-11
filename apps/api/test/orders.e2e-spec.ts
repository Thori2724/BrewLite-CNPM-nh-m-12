import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  OrderStatus,
  PrismaClient,
  ReceiveType,
  Size,
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
  let testPrisma: PrismaClient;
  let accessToken: string;
  let userId: string;

  const PRODUCT_TEA_ID = 'aaaaaaaa-0000-4000-8000-000000009a01';
  const PRODUCT_CAKE_ID = 'aaaaaaaa-0000-4000-8000-000000009a02';
  const PRODUCT_OOS_ID = 'aaaaaaaa-0000-4000-8000-000000009a03';
  const PRODUCT_CONCURRENT_ID = 'aaaaaaaa-0000-4000-8000-000000009a04';
  const TOPPING_PEARL_ID = 'bbbbbbbb-0000-4000-8000-000000009a01';

  const SUITE_PRODUCT_IDS = [
    PRODUCT_TEA_ID,
    PRODUCT_CAKE_ID,
    PRODUCT_OOS_ID,
    PRODUCT_CONCURRENT_ID,
  ];
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

    testPrisma = new PrismaClient({
      datasources: { db: { url: safeTestDbUrl } },
    });
    await testPrisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupSuiteData();

    const uniqueEmail = `orders.9a.${Date.now()}@example.com`;
    createdUserEmails.push(uniqueEmail);

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: uniqueEmail,
        password: 'Password123@',
        displayName: 'Khách Integration 9a',
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
        name: 'Trà sữa टेस्ट 9a',
        category: Category.MILK_TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/tea-9a.jpg',
        stock: 10,
        isVisible: true,
      },
      create: {
        id: PRODUCT_TEA_ID,
        name: 'Trà sữa टेस्ट 9a',
        category: Category.MILK_TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/tea-9a.jpg',
        stock: 10,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_CAKE_ID },
      update: {
        name: 'Bánh sừng bò 9a',
        category: Category.CAKE,
        basePrice: 30000,
        imageUrl: 'https://example.com/cake-9a.jpg',
        stock: 6,
        isVisible: true,
      },
      create: {
        id: PRODUCT_CAKE_ID,
        name: 'Bánh sừng bò 9a',
        category: Category.CAKE,
        basePrice: 30000,
        imageUrl: 'https://example.com/cake-9a.jpg',
        stock: 6,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_OOS_ID },
      update: {
        name: 'Bạc xỉu hết hàng 9a',
        category: Category.COFFEE,
        basePrice: 32000,
        imageUrl: 'https://example.com/oos-9a.jpg',
        stock: 0,
        isVisible: true,
      },
      create: {
        id: PRODUCT_OOS_ID,
        name: 'Bạc xỉu hết hàng 9a',
        category: Category.COFFEE,
        basePrice: 32000,
        imageUrl: 'https://example.com/oos-9a.jpg',
        stock: 0,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_CONCURRENT_ID },
      update: {
        name: 'Cà phê giới hạn 9a',
        category: Category.COFFEE,
        basePrice: 29000,
        imageUrl: 'https://example.com/concurrent-9a.jpg',
        stock: 5,
        isVisible: true,
      },
      create: {
        id: PRODUCT_CONCURRENT_ID,
        name: 'Cà phê giới hạn 9a',
        category: Category.COFFEE,
        basePrice: 29000,
        imageUrl: 'https://example.com/concurrent-9a.jpg',
        stock: 5,
        isVisible: true,
      },
    });

    await prisma.topping.upsert({
      where: { id: TOPPING_PEARL_ID },
      update: {
        name: 'Trân châu đen 9a',
        price: 5000,
        isVisible: true,
      },
      create: {
        id: TOPPING_PEARL_ID,
        name: 'Trân châu đen 9a',
        price: 5000,
        isVisible: true,
      },
    });
  });

  afterAll(async () => {
    await cleanupSuiteData();
    if (testPrisma) {
      await testPrisma.$disconnect();
    }
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

  it('a) Tạo đơn thành công: 201, totalAmount đúng, tồn kho giảm đúng trong DB, orderNumber đơn sau lớn hơn đơn trước', async () => {
    // Đơn 1: 2 ly Trà sữa size M (35000 + 6000 + topping 5000 = 46000 x 2 = 92000) + 1 Bánh (30000) = 122000
    const res1 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        receiveType: ReceiveType.TAKE_AWAY,
        note: 'Đơn tích hợp 1',
        items: [
          {
            productId: PRODUCT_TEA_ID,
            quantity: 2,
            size: Size.M,
            toppingIds: [TOPPING_PEARL_ID],
          },
          {
            productId: PRODUCT_CAKE_ID,
            quantity: 1,
          },
        ],
      })
      .expect(201);

    const body1 = res1.body as {
      id: string;
      orderNumber: number;
      totalAmount: number;
      status: OrderStatus;
    };
    expect(body1.totalAmount).toBe(122000);
    expect(body1.status).toBe(OrderStatus.PENDING);

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
    };
    expect(body2.totalAmount).toBe(30000);
    expect(body2.orderNumber).toBeGreaterThan(body1.orderNumber);

    // Kiểm tra trực tiếp trong PostgreSQL bằng Prisma
    const teaInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    const cakeInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });
    expect(teaInDb.stock).toBe(8); // 10 - 2
    expect(cakeInDb.stock).toBe(4); // 6 - 1 - 1

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

  it('b) Kho cộng gộp: cùng một món ở 2 dòng có tổng vượt tồn kho thì trả 409 kèm details; tồn kho giữ nguyên và KHÔNG có Order nào được tạo', async () => {
    // PRODUCT_CAKE_ID có stock = 6; đặt dòng 1: 4 cái, dòng 2: 3 cái (tổng 7 > 6)
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { productId: PRODUCT_CAKE_ID, quantity: 4 },
          { productId: PRODUCT_CAKE_ID, quantity: 3 },
        ],
      })
      .expect(409);

    expect(res.body).toEqual({
      statusCode: 409,
      message: "Sản phẩm 'Bánh sừng bò 9a' không đủ số lượng trong kho",
      error: 'Conflict',
      details: [
        {
          productId: PRODUCT_CAKE_ID,
          name: 'Bánh sừng bò 9a',
          available: 6,
        },
      ],
    });

    const cakeInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });
    expect(cakeInDb.stock).toBe(6);

    const orderCount = await prisma.order.count({
      where: { userId },
    });
    expect(orderCount).toBe(0);
  });

  it('c) Đơn gồm 2 món (1 món đủ hàng, 1 món hết hàng): trả 409; món đủ hàng KHÔNG bị trừ kho và KHÔNG có Order nào được tạo (rollback thật)', async () => {
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
      message: "Sản phẩm 'Bạc xỉu hết hàng 9a' không đủ số lượng trong kho",
      error: 'Conflict',
      details: [
        {
          productId: PRODUCT_OOS_ID,
          name: 'Bạc xỉu hết hàng 9a',
          available: 0,
        },
      ],
    });

    const teaInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_TEA_ID },
    });
    const oosInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_OOS_ID },
    });
    expect(teaInDb.stock).toBe(10); // Không bị trừ kho nhờ rollback transaction
    expect(oosInDb.stock).toBe(0);

    const orderCount = await prisma.order.count({
      where: { userId },
    });
    expect(orderCount).toBe(0);
  });

  it('d) Không bán quá kho khi đặt đồng thời: stock = 5, gửi 8 request POST /orders song song (quantity 1) -> đúng 5 cái 201, 3 cái 409, stock cuối = 0, đúng 5 Order trong DB', async () => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    // Làm nóng 2 kết nối cho pool của testPrisma (dùng để kiểm tra DB)
    await Promise.all([
      testPrisma.$queryRaw`SELECT 1`,
      testPrisma.$queryRaw`SELECT 1`,
    ]);
    await sleep(50);

    // Làm nóng pool của app (PrismaService) theo từng đợt nhỏ 2 truy vấn, chờ 50ms giữa các đợt
    for (let batch = 1; batch <= 5; batch++) {
      await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        prisma.$queryRaw`SELECT 1`,
      ]);
      await sleep(50);
    }

    const concurrentRequests = Array.from({ length: 8 }, () =>
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [
            {
              productId: PRODUCT_CONCURRENT_ID,
              quantity: 1,
            },
          ],
        }),
    );

    const responses = await Promise.all(concurrentRequests);

    const successResponses = responses.filter((r) => r.status === 201);
    const conflictResponses = responses.filter((r) => r.status === 409);

    expect(successResponses).toHaveLength(5);
    expect(conflictResponses).toHaveLength(3);

    const productInDb = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CONCURRENT_ID },
    });
    expect(productInDb.stock).toBe(0);

    const ordersInDb = await prisma.order.findMany({
      where: { userId },
    });
    expect(ordersInDb).toHaveLength(5);
  });
});
