import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  Size,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/app-config';
import {
  IDEMPOTENCY_KEY_CONFLICT_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  ORDER_NOT_PAYABLE_MESSAGE,
} from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl } from './orders.e2e-spec';

describe('Payments Integration (POST /payments)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let testPrisma: PrismaClient;
  let accessTokenA: string;
  let userIdA: string;
  let accessTokenB: string;
  let userIdB: string;

  const PRODUCT_COFFEE_ID = 'aaaaaaaa-0000-4000-8000-000000009b01';
  const PRODUCT_CAKE_ID = 'aaaaaaaa-0000-4000-8000-000000009b02';
  const TOPPING_CHEESE_ID = 'bbbbbbbb-0000-4000-8000-000000009b01';

  const SUITE_PRODUCT_IDS = [PRODUCT_COFFEE_ID, PRODUCT_CAKE_ID];
  const SUITE_TOPPING_IDS = [TOPPING_CHEESE_ID];
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

    if (userIds.length > 0) {
      await prisma.payment.deleteMany({
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

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  }

  async function createOrderForUser(token: string) {
    // 1 ly Cà phê size M (29000 + 6000 + topping 10000 = 45000) + 1 Bánh (30000) = 75000
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productId: PRODUCT_COFFEE_ID,
            quantity: 1,
            size: Size.M,
            toppingIds: [TOPPING_CHEESE_ID],
          },
          {
            productId: PRODUCT_CAKE_ID,
            quantity: 1,
          },
        ],
      })
      .expect(201);

    return res.body as {
      id: string;
      orderNumber: number;
      totalAmount: number;
      status: OrderStatus;
    };
  }

  beforeAll(async () => {
    const safeTestDbUrl = assertSafeTestDatabaseUrl();
    process.env.DATABASE_URL = safeTestDbUrl;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-brewlite-9b';

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

    const timestamp = Date.now();
    const emailA = `payments.9b.usera.${timestamp}@example.com`;
    const emailB = `payments.9b.userb.${timestamp}@example.com`;
    createdUserEmails.push(emailA, emailB);

    const regA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: emailA,
        password: 'Password123@',
        displayName: 'Khách A 9b',
      })
      .expect(201);
    userIdA = (regA.body as { id: string }).id;

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: emailA,
        password: 'Password123@',
      })
      .expect(200);
    accessTokenA = (loginA.body as { accessToken: string }).accessToken;

    const regB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: emailB,
        password: 'Password123@',
        displayName: 'Khách B 9b',
      })
      .expect(201);
    userIdB = (regB.body as { id: string }).id;

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: emailB,
        password: 'Password123@',
      })
      .expect(200);
    accessTokenB = (loginB.body as { accessToken: string }).accessToken;
  });

  beforeEach(async () => {
    const existingOrders = await prisma.order.findMany({
      where: { userId: { in: [userIdA, userIdB] } },
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

    await prisma.payment.deleteMany({
      where: { userId: { in: [userIdA, userIdB] } },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_COFFEE_ID },
      update: {
        name: 'Cà phê sữa đá 9b',
        category: Category.COFFEE,
        basePrice: 29000,
        imageUrl: 'https://example.com/coffee-9b.jpg',
        stock: 20,
        isVisible: true,
      },
      create: {
        id: PRODUCT_COFFEE_ID,
        name: 'Cà phê sữa đá 9b',
        category: Category.COFFEE,
        basePrice: 29000,
        imageUrl: 'https://example.com/coffee-9b.jpg',
        stock: 20,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_CAKE_ID },
      update: {
        name: 'Bánh Tiramisu 9b',
        category: Category.CAKE,
        basePrice: 30000,
        imageUrl: 'https://example.com/cake-9b.jpg',
        stock: 20,
        isVisible: true,
      },
      create: {
        id: PRODUCT_CAKE_ID,
        name: 'Bánh Tiramisu 9b',
        category: Category.CAKE,
        basePrice: 30000,
        imageUrl: 'https://example.com/cake-9b.jpg',
        stock: 20,
        isVisible: true,
      },
    });

    await prisma.topping.upsert({
      where: { id: TOPPING_CHEESE_ID },
      update: {
        name: 'Kem cheese 9b',
        price: 10000,
        isVisible: true,
      },
      create: {
        id: TOPPING_CHEESE_ID,
        name: 'Kem cheese 9b',
        price: 10000,
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

  it('a) accountNumber bình thường: 201, SUCCESS, đơn thành PAID, DB có đúng 1 Payment, chỉ lưu accountLast4, amount = totalAmount', async () => {
    const order = await createOrderForUser(accessTokenA);
    expect(order.totalAmount).toBe(75000);

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-a-0001')
      .send({
        orderId: order.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      orderId: order.id,
      method: PaymentMethod.WALLET,
      accountLast4: '4321',
      amount: 75000,
      status: PaymentStatus.SUCCESS,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.PAID,
      },
    });
    expect(res.body).not.toHaveProperty('failureReason');
    expect(res.body).not.toHaveProperty('accountNumber');

    const orderInDb = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderInDb.status).toBe(OrderStatus.PAID);

    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(paymentsInDb).toHaveLength(1);
    expect(paymentsInDb[0].status).toBe(PaymentStatus.SUCCESS);
    expect(paymentsInDb[0].accountLast4).toBe('4321');
    expect(paymentsInDb[0].amount).toBe(order.totalAmount);
    expect(paymentsInDb[0].failureReason).toBeNull();
    expect(paymentsInDb[0]).not.toHaveProperty('accountNumber');
  });

  it('b) accountNumber đuôi 0000: 201, FAILED, đơn thành PAYMENT_FAILED, tồn kho KHÔNG đổi', async () => {
    const order = await createOrderForUser(accessTokenA);

    const coffeeBefore = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_COFFEE_ID },
    });
    const cakeBefore = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-b-0001')
      .send({
        orderId: order.id,
        method: PaymentMethod.CARD,
        accountNumber: '1234560000',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      orderId: order.id,
      method: PaymentMethod.CARD,
      accountLast4: '0000',
      amount: order.totalAmount,
      status: PaymentStatus.FAILED,
      failureReason: 'Giao dịch bị từ chối (mô phỏng)',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.PAYMENT_FAILED,
      },
    });

    const orderInDb = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderInDb.status).toBe(OrderStatus.PAYMENT_FAILED);

    const coffeeAfter = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_COFFEE_ID },
    });
    const cakeAfter = await prisma.product.findUniqueOrThrow({
      where: { id: PRODUCT_CAKE_ID },
    });
    expect(coffeeAfter.stock).toBe(coffeeBefore.stock);
    expect(cakeAfter.stock).toBe(cakeBefore.stock);

    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(paymentsInDb).toHaveLength(1);
    expect(paymentsInDb[0].status).toBe(PaymentStatus.FAILED);
    expect(paymentsInDb[0].accountLast4).toBe('0000');
    expect(paymentsInDb[0].failureReason).toBe(
      'Giao dịch bị từ chối (mô phỏng)',
    );
  });

  it('c) Thử lại sau FAILED với Idempotency-Key MỚI: SUCCESS, đơn PAID, đơn có 2 Payment trong DB', async () => {
    const order = await createOrderForUser(accessTokenA);

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-c-fail-1')
      .send({
        orderId: order.id,
        method: PaymentMethod.WALLET,
        accountNumber: '9999990000',
      })
      .expect(201);

    const retryRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-c-retry-2')
      .send({
        orderId: order.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0912345678',
      })
      .expect(201);

    expect(retryRes.body).toMatchObject({
      orderId: order.id,
      status: PaymentStatus.SUCCESS,
      accountLast4: '5678',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.PAID,
      },
    });

    const orderInDb = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderInDb.status).toBe(OrderStatus.PAID);

    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(paymentsInDb).toHaveLength(2);
    expect(paymentsInDb[0].status).toBe(PaymentStatus.FAILED);
    expect(paymentsInDb[1].status).toBe(PaymentStatus.SUCCESS);
  });

  it('d) Gửi 2 lần cùng key, cùng orderId: lần 2 trả 200 OK, cùng body, DB vẫn đúng 1 Payment', async () => {
    const order = await createOrderForUser(accessTokenA);
    const key = 'idem-9b-case-d-replay';

    const firstRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', key)
      .send({
        orderId: order.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(201);

    const secondRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', key)
      .send({
        orderId: order.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(200);

    expect(secondRes.body).toEqual(firstRes.body);

    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(paymentsInDb).toHaveLength(1);
  });

  it('e) Cùng key nhưng orderId khác: trả 409 Conflict', async () => {
    const order1 = await createOrderForUser(accessTokenA);
    const order2 = await createOrderForUser(accessTokenA);
    const key = 'idem-9b-case-e-conflict';

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', key)
      .send({
        orderId: order1.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(201);

    const conflictRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', key)
      .send({
        orderId: order2.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(409);

    expect(conflictRes.body).toMatchObject({
      statusCode: 409,
      message: IDEMPOTENCY_KEY_CONFLICT_MESSAGE,
    });

    const order2Payments = await prisma.payment.findMany({
      where: { orderId: order2.id },
    });
    expect(order2Payments).toHaveLength(0);
  });

  it('f) Đơn đã PAID thanh toán lại với key mới: 409; Đơn của người khác: 404; Chưa đăng nhập: 401; Thiếu Idempotency-Key hoặc accountNumber sai định dạng: 400', async () => {
    const orderA = await createOrderForUser(accessTokenA);

    // Thanh toán thành công đơn A
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-f-paid-1')
      .send({
        orderId: orderA.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(201);

    // 1. Đơn đã PAID thanh toán lại với key mới -> 409
    const paidAgainRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-f-paid-2')
      .send({
        orderId: orderA.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(409);
    expect(paidAgainRes.body).toMatchObject({
      statusCode: 409,
      message: ORDER_NOT_PAYABLE_MESSAGE,
    });

    // 2. Đơn của người khác (User B thanh toán đơn của User A) -> 404
    const otherUserRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .set('Idempotency-Key', 'idem-9b-case-f-other-user')
      .send({
        orderId: orderA.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(404);
    expect(otherUserRes.body).toMatchObject({
      statusCode: 404,
      message: ORDER_NOT_FOUND_MESSAGE,
    });

    // 3. Chưa đăng nhập -> 401
    await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'idem-9b-case-f-no-auth')
      .send({
        orderId: orderA.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(401);

    // 4. Thiếu Idempotency-Key -> 400
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .send({
        orderId: orderA.id,
        method: PaymentMethod.WALLET,
        accountNumber: '0987654321',
      })
      .expect(400);

    // 5. accountNumber sai định dạng (chứa chữ hoặc ngắn hơn 8 ký tự) -> 400
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .set('Idempotency-Key', 'idem-9b-case-f-bad-acc')
      .send({
        orderId: orderA.id,
        method: PaymentMethod.WALLET,
        accountNumber: '1234abcd',
      })
      .expect(400);

    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: orderA.id },
    });
    expect(paymentsInDb).toHaveLength(1);
  });

  it('g) 2 request thanh toán đồng thời cho cùng đơn, 2 key khác nhau: đúng 1 SUCCESS (201), cái kia 409, DB đúng 1 Payment SUCCESS', async () => {
    const order = await createOrderForUser(accessTokenA);

    await Promise.all([
      ...Array.from({ length: 4 }, () => testPrisma.$queryRaw`SELECT 1`),
      ...Array.from({ length: 4 }, () => prisma.$queryRaw`SELECT 1`),
    ]);

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .set('Idempotency-Key', 'idem-9b-case-g-concurrent-1')
        .send({
          orderId: order.id,
          method: PaymentMethod.WALLET,
          accountNumber: '0987654321',
        }),
      request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .set('Idempotency-Key', 'idem-9b-case-g-concurrent-2')
        .send({
          orderId: order.id,
          method: PaymentMethod.CARD,
          accountNumber: '0123456789',
        }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const orderInDb = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderInDb.status).toBe(OrderStatus.PAID);

    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(paymentsInDb).toHaveLength(1);
    expect(paymentsInDb[0].status).toBe(PaymentStatus.SUCCESS);
  });
});
