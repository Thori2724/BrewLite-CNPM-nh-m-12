import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  LoyaltyType,
  OrderStatus,
  PaymentMethod,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/app-config';
import { PrismaService } from '../src/prisma/prisma.service';

function assertSafeTestDatabaseUrl(
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

interface LoyaltyTxResponseItem {
  id: string;
  type: LoyaltyType;
  points: number;
  orderNumber: number | null;
  createdAt: string;
}

interface LoyaltyMeResponseBody {
  loyaltyPoints: number;
  transactions: LoyaltyTxResponseItem[];
}

describe('Loyalty Integration (VIỆC 12 - GET /loyalty/me)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const PASSWORD = 'Password123@';
  const SUITE_PRODUCT_ID = 'aaaaaaaa-0000-4000-8000-0000000012c1';
  const SEED_WELCOME_LOYALTY_TX_ID = '99999999-0000-0000-0000-000000000001';

  const createdUserEmails: string[] = [];
  const createdTransactionIds = new Set<string>();
  const createdOrderIds = new Set<string>();

  let staffToken: string;
  let adminToken: string;

  async function createCustomerWithToken(
    tag: string,
    initialPoints = 0,
  ): Promise<{ userId: string; email: string; token: string }> {
    const email = `loyalty.${tag}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2, 7)}@example.com`;
    createdUserEmails.push(email);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: `Khách Loyalty ${tag}`,
        role: Role.CUSTOMER,
        isActive: true,
        loyaltyPoints: initialPoints,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    return {
      userId: user.id,
      email,
      token: (loginRes.body as { accessToken: string }).accessToken,
    };
  }

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
          ...(createdOrderIds.size > 0
            ? [{ id: { in: Array.from(createdOrderIds) } }]
            : []),
          { items: { some: { productId: SUITE_PRODUCT_ID } } },
        ],
      },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    // 1. Xóa LoyaltyTransaction TRƯỚC Order và User (không đụng dòng điểm chào mừng của seed)
    if (
      createdTransactionIds.size > 0 ||
      orderIds.length > 0 ||
      userIds.length > 0
    ) {
      await prisma.loyaltyTransaction.deleteMany({
        where: {
          id: { not: SEED_WELCOME_LOYALTY_TX_ID },
          OR: [
            ...(createdTransactionIds.size > 0
              ? [{ id: { in: Array.from(createdTransactionIds) } }]
              : []),
            ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
            ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
          ],
        },
      });
    }

    // 2. Xóa các bảng con của Order rồi xóa Order
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

    await prisma.orderItem.deleteMany({
      where: { productId: SUITE_PRODUCT_ID },
    });
    await prisma.product.deleteMany({
      where: { id: SUITE_PRODUCT_ID },
    });

    // 3. Xóa Payment và User do test tạo
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
    process.env.JWT_SECRET = 'integration-test-jwt-secret-brewlite-loyalty-12';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupSuiteData();

    await prisma.product.upsert({
      where: { id: SUITE_PRODUCT_ID },
      update: {
        name: 'Bánh Tiramisu Loyalty E2E',
        category: Category.CAKE,
        basePrice: 35000,
        imageUrl: 'https://example.com/loyalty-cake.jpg',
        stock: 50,
        isVisible: true,
      },
      create: {
        id: SUITE_PRODUCT_ID,
        name: 'Bánh Tiramisu Loyalty E2E',
        category: Category.CAKE,
        basePrice: 35000,
        imageUrl: 'https://example.com/loyalty-cake.jpg',
        stock: 50,
        isVisible: true,
      },
    });

    const ts = Date.now();
    const staffEmail = `staff.loyalty.${ts}@example.com`;
    const adminEmail = `admin.loyalty.${ts}@example.com`;
    createdUserEmails.push(staffEmail, adminEmail);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash,
        displayName: 'Nhân viên Loyalty E2E',
        role: Role.STAFF,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        displayName: 'Quản lý Loyalty E2E',
        role: Role.ADMIN,
        isActive: true,
      },
    });

    const staffLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: PASSWORD })
      .expect(200);
    staffToken = (staffLogin.body as { accessToken: string }).accessToken;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    adminToken = (adminLogin.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await cleanupSuiteData();
    if (app) {
      await app.close();
    }
  });

  it('(a), (c), (g) khách có điểm và vài giao dịch: loyaltyPoints đúng, transactions đúng type, points có dấu, orderNumber đúng (null khi orderId null), mỗi giao dịch có đúng 5 trường và createdAt là chuỗi ISO 8601 UTC', async () => {
    const customer = await createCustomerWithToken('case-a', 46);

    const order = await prisma.order.create({
      data: {
        userId: customer.userId,
        status: OrderStatus.PAID,
        subtotalAmount: 70000,
        discountAmount: 0,
        pointsUsed: 10,
        pointsEarned: 6,
        totalAmount: 60000,
      },
    });
    createdOrderIds.add(order.id);

    const txWelcome = await prisma.loyaltyTransaction.create({
      data: {
        userId: customer.userId,
        orderId: null,
        type: LoyaltyType.EARN,
        points: 50,
        createdAt: new Date('2026-03-10T08:00:00.000Z'),
      },
    });
    const txRedeem = await prisma.loyaltyTransaction.create({
      data: {
        userId: customer.userId,
        orderId: order.id,
        type: LoyaltyType.REDEEM,
        points: -10,
        createdAt: new Date('2026-03-10T09:00:00.000Z'),
      },
    });
    const txEarn = await prisma.loyaltyTransaction.create({
      data: {
        userId: customer.userId,
        orderId: order.id,
        type: LoyaltyType.EARN,
        points: 6,
        createdAt: new Date('2026-03-10T10:00:00.000Z'),
      },
    });
    createdTransactionIds.add(txWelcome.id);
    createdTransactionIds.add(txRedeem.id);
    createdTransactionIds.add(txEarn.id);

    const res = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    const body = res.body as LoyaltyMeResponseBody;
    expect(Object.keys(body).sort()).toEqual(['loyaltyPoints', 'transactions']);
    expect(body.loyaltyPoints).toBe(46);
    expect(body.transactions).toHaveLength(3);

    expect(body.transactions[0]).toEqual({
      id: txEarn.id,
      type: LoyaltyType.EARN,
      points: 6,
      orderNumber: order.orderNumber,
      createdAt: '2026-03-10T10:00:00.000Z',
    });
    expect(body.transactions[1]).toEqual({
      id: txRedeem.id,
      type: LoyaltyType.REDEEM,
      points: -10,
      orderNumber: order.orderNumber,
      createdAt: '2026-03-10T09:00:00.000Z',
    });
    // (c) giao dịch không gắn đơn (orderId null) có orderNumber = null
    expect(body.transactions[2]).toEqual({
      id: txWelcome.id,
      type: LoyaltyType.EARN,
      points: 50,
      orderNumber: null,
      createdAt: '2026-03-10T08:00:00.000Z',
    });

    // (g) mỗi giao dịch chỉ có đúng 5 trường id, type, points, orderNumber, createdAt
    for (const tx of body.transactions) {
      expect(Object.keys(tx).sort()).toEqual([
        'createdAt',
        'id',
        'orderNumber',
        'points',
        'type',
      ]);
      expect(tx).not.toHaveProperty('userId');
      expect(tx).not.toHaveProperty('orderId');
      expect(tx.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    }
  });

  it('(b) khách có 55 giao dịch: chỉ trả 50 dòng, là 50 dòng mới nhất, đúng thứ tự mới nhất trước và ổn định khi trùng createdAt', async () => {
    const customer = await createCustomerWithToken('case-b', 200);

    const order = await prisma.order.create({
      data: {
        userId: customer.userId,
        status: OrderStatus.PAID,
        subtotalAmount: 50000,
        discountAmount: 0,
        pointsUsed: 0,
        pointsEarned: 5,
        totalAmount: 50000,
      },
    });
    createdOrderIds.add(order.id);

    const baseTime = new Date('2026-03-01T00:00:00.000Z').getTime();
    const txData = Array.from({ length: 55 }, (_, i) => {
      const seq = i + 1; // 1..55, trong đó 1..5 là cũ nhất, 6..55 là 50 dòng mới nhất
      return {
        id: `12121212-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        userId: customer.userId,
        orderId: seq % 5 === 0 ? null : order.id,
        type: seq % 2 === 0 ? LoyaltyType.EARN : LoyaltyType.REDEEM,
        points: seq % 2 === 0 ? seq : -seq,
        // Cho 2 dòng cuối (54 và 55) có cùng createdAt để kiểm tra sắp xếp phụ ổn định theo id desc
        createdAt:
          seq >= 54
            ? new Date(baseTime + 55 * 60_000)
            : new Date(baseTime + seq * 60_000),
      };
    });

    for (const d of txData) {
      createdTransactionIds.add(d.id);
    }
    await prisma.loyaltyTransaction.createMany({ data: txData });

    const res1 = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    const body1 = res1.body as LoyaltyMeResponseBody;
    const body2 = res2.body as LoyaltyMeResponseBody;

    expect(body1.loyaltyPoints).toBe(200);
    expect(body1.transactions).toHaveLength(50);

    // Dòng mới nhất là seq 55 rồi đến seq 54 (cùng createdAt nhưng id 55 > id 54), dòng thứ 50 là seq 6; các dòng 1..5 không xuất hiện
    expect(body1.transactions[0].id).toBe(
      '12121212-0000-4000-8000-000000000055',
    );
    expect(body1.transactions[1].id).toBe(
      '12121212-0000-4000-8000-000000000054',
    );
    expect(body1.transactions[49].id).toBe(
      '12121212-0000-4000-8000-000000000006',
    );

    const returnedIds = new Set(body1.transactions.map((t) => t.id));
    for (let oldSeq = 1; oldSeq <= 5; oldSeq++) {
      expect(
        returnedIds.has(
          `12121212-0000-4000-8000-${String(oldSeq).padStart(12, '0')}`,
        ),
      ).toBe(false);
    }

    // Thứ tự mới nhất trước và ổn định giữa các lần gọi
    for (let i = 0; i < body1.transactions.length - 1; i++) {
      const currTs = new Date(body1.transactions[i].createdAt).getTime();
      const nextTs = new Date(body1.transactions[i + 1].createdAt).getTime();
      expect(currTs).toBeGreaterThanOrEqual(nextTs);
    }
    expect(body1.transactions).toEqual(body2.transactions);
  });

  it('(d) khách A không bao giờ thấy giao dịch hoặc điểm của khách B (kể cả khi gửi kèm userId trên query)', async () => {
    const customerA = await createCustomerWithToken('case-d-a', 15);
    const customerB = await createCustomerWithToken('case-d-b', 95);

    const orderA = await prisma.order.create({
      data: {
        userId: customerA.userId,
        status: OrderStatus.PAID,
        subtotalAmount: 30000,
        totalAmount: 30000,
      },
    });
    const orderB = await prisma.order.create({
      data: {
        userId: customerB.userId,
        status: OrderStatus.PAID,
        subtotalAmount: 90000,
        totalAmount: 90000,
      },
    });
    createdOrderIds.add(orderA.id);
    createdOrderIds.add(orderB.id);

    const txA = await prisma.loyaltyTransaction.create({
      data: {
        userId: customerA.userId,
        orderId: orderA.id,
        type: LoyaltyType.EARN,
        points: 15,
      },
    });
    const txB1 = await prisma.loyaltyTransaction.create({
      data: {
        userId: customerB.userId,
        orderId: orderB.id,
        type: LoyaltyType.EARN,
        points: 100,
      },
    });
    const txB2 = await prisma.loyaltyTransaction.create({
      data: {
        userId: customerB.userId,
        orderId: orderB.id,
        type: LoyaltyType.REDEEM,
        points: -5,
      },
    });
    createdTransactionIds.add(txA.id);
    createdTransactionIds.add(txB1.id);
    createdTransactionIds.add(txB2.id);

    const resA = await request(app.getHttpServer())
      .get(`/loyalty/me?userId=${customerB.userId}`)
      .set('Authorization', `Bearer ${customerA.token}`)
      .expect(200);

    const bodyA = resA.body as LoyaltyMeResponseBody;
    expect(bodyA.loyaltyPoints).toBe(15);
    expect(bodyA.transactions).toHaveLength(1);
    expect(bodyA.transactions[0].id).toBe(txA.id);
    expect(bodyA.transactions[0].orderNumber).toBe(orderA.orderNumber);
    expect(bodyA.transactions.some((t) => t.id === txB1.id)).toBe(false);
    expect(bodyA.transactions.some((t) => t.id === txB2.id)).toBe(false);
  });

  it('(e) khách chưa có giao dịch: loyaltyPoints đúng (cả khi bằng 0 hoặc dương) và transactions = []', async () => {
    const customerZero = await createCustomerWithToken('case-e-0', 0);

    const resZero = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${customerZero.token}`)
      .expect(200);

    expect(resZero.body).toEqual({
      loyaltyPoints: 0,
      transactions: [],
    });
  });

  it('(f) chưa đăng nhập -> 401; STAFF -> 403 "Bạn không có quyền thực hiện thao tác này"; ADMIN -> 403 "Bạn không có quyền thực hiện thao tác này"', async () => {
    // 1. Chưa đăng nhập hoặc token sai -> 401
    await request(app.getHttpServer()).get('/loyalty/me').expect(401);
    await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', 'Bearer invalid.jwt.token')
      .expect(401);

    // 2. STAFF -> 403
    const staffRes = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
    expect(staffRes.body).toMatchObject({
      statusCode: 403,
      message: 'Bạn không có quyền thực hiện thao tác này',
    });

    // 3. ADMIN -> 403
    const adminRes = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect(adminRes.body).toMatchObject({
      statusCode: 403,
      message: 'Bạn không có quyền thực hiện thao tác này',
    });
  });

  it('(h) sau một chu trình đặt đơn dùng điểm -> thanh toán -> hủy đơn, GET /loyalty/me có đủ REDEEM, EARN, REFUND, REVOKE với dấu đúng và gắn đúng orderNumber', async () => {
    // Tạo khách có sẵn 20 điểm
    const customer = await createCustomerWithToken('case-h-cycle', 20);

    // Bước 1: Đặt đơn 2 bánh (2 x 35.000 = 70.000) có usePoints = true -> dùng 20 điểm (20.000đ), totalAmount = 50.000, tạo dòng REDEEM (-20)
    const createOrderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        usePoints: true,
        items: [{ productId: SUITE_PRODUCT_ID, quantity: 2 }],
      })
      .expect(201);

    const createdOrder = createOrderRes.body as {
      id: string;
      orderNumber: number;
      pointsUsed: number;
      totalAmount: number;
    };
    createdOrderIds.add(createdOrder.id);
    expect(createdOrder.pointsUsed).toBe(20);
    expect(createdOrder.totalAmount).toBe(50000);

    // Bước 2: Thanh toán thành công đơn 50.000 -> tích 5 điểm, tạo dòng EARN (+5)
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `loyalty-cycle-${Date.now()}`)
      .send({
        orderId: createdOrder.id,
        method: PaymentMethod.CARD,
        accountNumber: '9704123456781234',
      })
      .expect(201);

    // Bước 3: Hủy đơn vừa thanh toán -> hoàn 20 điểm đã dùng (REFUND +20) và thu hồi 5 điểm đã tích (REVOKE -5), điểm cuối về lại 20
    await request(app.getHttpServer())
      .post(`/orders/${createdOrder.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    // Bước 4: Gọi GET /loyalty/me kiểm tra lịch sử điểm
    const loyaltyRes = await request(app.getHttpServer())
      .get('/loyalty/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    const body = loyaltyRes.body as LoyaltyMeResponseBody;
    expect(body.loyaltyPoints).toBe(20);
    expect(body.transactions).toHaveLength(4);

    // Tất cả 4 dòng đều gắn đúng orderNumber của đơn
    for (const tx of body.transactions) {
      expect(tx.orderNumber).toBe(createdOrder.orderNumber);
      expect(Object.keys(tx).sort()).toEqual([
        'createdAt',
        'id',
        'orderNumber',
        'points',
        'type',
      ]);
    }

    const byType = new Map(body.transactions.map((t) => [t.type, t.points]));
    expect(byType.get(LoyaltyType.REDEEM)).toBe(-20);
    expect(byType.get(LoyaltyType.EARN)).toBe(5);
    expect(byType.get(LoyaltyType.REFUND)).toBe(20);
    expect(byType.get(LoyaltyType.REVOKE)).toBe(-5);

    // Thứ tự thời gian: 2 dòng hủy đơn (REFUND, REVOKE) ở đầu, tiếp theo là EARN, cuối cùng là REDEEM
    expect(
      [body.transactions[0].type, body.transactions[1].type].sort(),
    ).toEqual([LoyaltyType.REFUND, LoyaltyType.REVOKE]);
    expect(body.transactions[2].type).toBe(LoyaltyType.EARN);
    expect(body.transactions[3].type).toBe(LoyaltyType.REDEEM);
  });
});
