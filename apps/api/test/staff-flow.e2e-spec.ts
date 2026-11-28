import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Category,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  Size,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/app-config';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl } from './orders.e2e-spec';

describe('Staff & Role Management Integration (10B)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let customerToken: string;
  let customerId: string;
  let customerEmail: string;

  let otherCustomerToken: string;
  let otherCustomerId: string;

  let staffToken: string;
  let staffId: string;
  let staffEmail: string;

  let adminToken: string;
  let adminId: string;

  const PASSWORD = 'Password123@';
  const PRODUCT_DRINK_ID = 'aaaaaaaa-0000-4000-8000-0000000010b1';
  const PRODUCT_HIDDEN_ID = 'aaaaaaaa-0000-4000-8000-0000000010b2';
  const TOPPING_ID = 'bbbbbbbb-0000-4000-8000-0000000010b1';
  const UNKNOWN_UUID = '99999999-0000-4000-8000-000000009999';

  const suiteProductIds = new Set<string>([
    PRODUCT_DRINK_ID,
    PRODUCT_HIDDEN_ID,
  ]);
  const SUITE_TOPPING_IDS = [TOPPING_ID];
  const createdUserEmails: string[] = [];

  async function cleanupSuiteData() {
    if (!prisma) {
      return;
    }

    const productIds = Array.from(suiteProductIds);

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
          { items: { some: { productId: { in: productIds } } } },
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
      where: { productId: { in: productIds } },
    });
    await prisma.topping.deleteMany({
      where: { id: { in: SUITE_TOPPING_IDS } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  }

  async function createOrderViaHttp(token: string = customerToken) {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productId: PRODUCT_DRINK_ID,
            quantity: 1,
            size: Size.M,
            toppingIds: [TOPPING_ID],
          },
        ],
      })
      .expect(201);

    return res.body as {
      id: string;
      orderNumber: number;
      status: OrderStatus;
      totalAmount: number;
    };
  }

  async function payOrderViaHttp(
    orderId: string,
    accountNumber: string,
    idemKey: string,
    token: string = customerToken,
  ) {
    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send({
        orderId,
        method: PaymentMethod.WALLET,
        accountNumber,
      })
      .expect(201);

    return res.body as {
      id: string;
      status: PaymentStatus;
      order: { id: string; status: OrderStatus };
    };
  }

  beforeAll(async () => {
    const safeTestDbUrl = assertSafeTestDatabaseUrl();
    process.env.DATABASE_URL = safeTestDbUrl;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-brewlite-10b';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupSuiteData();

    const ts = Date.now();
    customerEmail = `cust.10b.${ts}@example.com`;
    const otherCustomerEmail = `cust2.10b.${ts}@example.com`;
    staffEmail = `staff.10b.${ts}@example.com`;
    const adminEmail = `admin.10b.${ts}@example.com`;

    createdUserEmails.push(
      customerEmail,
      otherCustomerEmail,
      staffEmail,
      adminEmail,
    );

    // 1. Tạo 2 tài khoản CUSTOMER qua HTTP POST /auth/register
    const regCust1 = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: customerEmail,
        password: PASSWORD,
        displayName: 'Khách 10B',
      })
      .expect(201);
    customerId = (regCust1.body as { id: string }).id;

    const regCust2 = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: otherCustomerEmail,
        password: PASSWORD,
        displayName: 'Khách Khác 10B',
      })
      .expect(201);
    otherCustomerId = (regCust2.body as { id: string }).id;

    // 2. Tạo tài khoản STAFF và ADMIN trong DB test, sau đó đăng nhập qua HTTP thật
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const staffUser = await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash,
        displayName: 'Nhân viên 10B',
        role: Role.STAFF,
        isActive: true,
      },
    });
    staffId = staffUser.id;

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        displayName: 'Quản lý 10B',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    adminId = adminUser.id;

    // 3. Đăng nhập qua HTTP POST /auth/login cho cả 4 tài khoản để lấy JWT thật
    const loginCust1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: customerEmail, password: PASSWORD })
      .expect(200);
    customerToken = (loginCust1.body as { accessToken: string }).accessToken;

    const loginCust2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherCustomerEmail, password: PASSWORD })
      .expect(200);
    otherCustomerToken = (loginCust2.body as { accessToken: string })
      .accessToken;

    const loginStaff = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: PASSWORD })
      .expect(200);
    staffToken = (loginStaff.body as { accessToken: string }).accessToken;

    const loginAdmin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    adminToken = (loginAdmin.body as { accessToken: string }).accessToken;
  });

  beforeEach(async () => {
    const userIds = [customerId, otherCustomerId, staffId, adminId].filter(
      Boolean,
    );

    const existingOrders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
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

    await prisma.user.update({
      where: { id: staffId },
      data: { isActive: true },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_DRINK_ID },
      update: {
        name: 'Trà đào cam sả 10B',
        category: Category.TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/tea-10b.jpg',
        stock: 999,
        isVisible: true,
      },
      create: {
        id: PRODUCT_DRINK_ID,
        name: 'Trà đào cam sả 10B',
        category: Category.TEA,
        basePrice: 35000,
        imageUrl: 'https://example.com/tea-10b.jpg',
        stock: 999,
        isVisible: true,
      },
    });

    await prisma.product.upsert({
      where: { id: PRODUCT_HIDDEN_ID },
      update: {
        name: 'Món ẩn thử nghiệm 10B',
        category: Category.COFFEE,
        basePrice: 40000,
        imageUrl: 'https://example.com/hidden-10b.jpg',
        stock: 999,
        isVisible: false,
      },
      create: {
        id: PRODUCT_HIDDEN_ID,
        name: 'Món ẩn thử nghiệm 10B',
        category: Category.COFFEE,
        basePrice: 40000,
        imageUrl: 'https://example.com/hidden-10b.jpg',
        stock: 999,
        isVisible: false,
      },
    });

    await prisma.topping.upsert({
      where: { id: TOPPING_ID },
      update: {
        name: 'Trân châu trắng 10B',
        price: 5000,
        isVisible: true,
      },
      create: {
        id: TOPPING_ID,
        name: 'Trân châu trắng 10B',
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

  it('1. Phân quyền: không token -> 401; CUSTOMER gọi API nhân viên/quản lý -> 403; STAFF gọi API riêng của ADMIN -> 403; STAFF và ADMIN qua được các endpoint của mình', async () => {
    const order = await createOrderViaHttp(customerToken);

    // 1.1 Không có token -> 401
    await request(app.getHttpServer()).get('/orders').expect(401);
    await request(app.getHttpServer())
      .patch(`/orders/${order.id}/status`)
      .send({ status: OrderStatus.CANCELLED })
      .expect(401);
    await request(app.getHttpServer()).get('/products/manage').expect(401);
    await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
      .send({ isAvailable: false })
      .expect(401);
    await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'Món không token',
        category: Category.TEA,
        basePrice: 30000,
      })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}`)
      .send({ name: 'Đổi tên không token' })
      .expect(401);
    await request(app.getHttpServer()).get('/staff').expect(401);
    await request(app.getHttpServer())
      .patch(`/staff/${staffId}/status`)
      .send({ isActive: false })
      .expect(401);

    // 1.2 Khách (CUSTOMER) gọi các endpoint của STAFF/ADMIN -> 403 "Bạn không có quyền thực hiện thao tác này"
    const custForbiddenEndpoints = [
      () =>
        request(app.getHttpServer())
          .get('/orders')
          .set('Authorization', `Bearer ${customerToken}`),
      () =>
        request(app.getHttpServer())
          .patch(`/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ status: OrderStatus.CANCELLED }),
      () =>
        request(app.getHttpServer())
          .get('/products/manage')
          .set('Authorization', `Bearer ${customerToken}`),
      () =>
        request(app.getHttpServer())
          .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ isAvailable: false }),
      () =>
        request(app.getHttpServer())
          .get('/staff')
          .set('Authorization', `Bearer ${customerToken}`),
    ];

    for (const callEndpoint of custForbiddenEndpoints) {
      const res = await callEndpoint().expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }

    // 1.3 STAFF gọi POST /products, PATCH /products/:id, GET /staff -> 403 "Bạn không có quyền thực hiện thao tác này"
    const staffForbiddenEndpoints = [
      () =>
        request(app.getHttpServer())
          .post('/products')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            name: 'Món STAFF tạo thử',
            category: Category.TEA,
            basePrice: 30000,
          }),
      () =>
        request(app.getHttpServer())
          .patch(`/products/${PRODUCT_DRINK_ID}`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ name: 'STAFF sửa thử' }),
      () =>
        request(app.getHttpServer())
          .get('/staff')
          .set('Authorization', `Bearer ${staffToken}`),
    ];

    for (const callEndpoint of staffForbiddenEndpoints) {
      const res = await callEndpoint().expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }

    // 1.4 STAFF qua được các endpoint của mình
    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/products/manage')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isAvailable: true, stock: 50 })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: OrderStatus.CANCELLED })
      .expect(200);

    // 1.5 ADMIN qua được các endpoint của STAFF và ADMIN
    const orderForAdmin = await createOrderViaHttp(customerToken);

    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/orders/${orderForAdmin.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: OrderStatus.CANCELLED })
      .expect(200);

    await request(app.getHttpServer())
      .get('/products/manage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAvailable: true, stock: 80 })
      .expect(200);

    const createdProdRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bánh mới Admin 10B',
        category: Category.CAKE,
        basePrice: 32000,
      })
      .expect(201);

    expect(createdProdRes.body).toMatchObject({
      name: 'Bánh mới Admin 10B',
      category: Category.CAKE,
      basePrice: 32000,
      stock: 50,
      isVisible: true,
    });

    const createdProdId = (createdProdRes.body as { id: string }).id;
    suiteProductIds.add(createdProdId);

    const createdWithStockRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bánh có stock tùy chọn 10B',
        category: Category.CAKE,
        basePrice: 35000,
        stock: 15,
      })
      .expect(201);

    expect(createdWithStockRes.body).toMatchObject({
      name: 'Bánh có stock tùy chọn 10B',
      category: Category.CAKE,
      basePrice: 35000,
      stock: 15,
      isVisible: true,
    });
    suiteProductIds.add((createdWithStockRes.body as { id: string }).id);

    for (const invalidCreateStock of [-1, 10000, 12.5, '50']) {
      const badCreateRes = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Món stock lỗi',
          category: Category.TEA,
          basePrice: 30000,
          stock: invalidCreateStock,
        })
        .expect(400);

      expect(
        Array.isArray((badCreateRes.body as { message: unknown }).message),
      ).toBe(true);
    }

    await request(app.getHttpServer())
      .patch(`/products/${createdProdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ basePrice: 34000, isVisible: false })
      .expect(200);

    const staffListRes = await request(app.getHttpServer())
      .get('/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(staffListRes.body)).toBe(true);
    const staffList = staffListRes.body as Array<{
      id: string;
      role: Role;
      passwordHash?: unknown;
    }>;
    expect(staffList.some((s) => s.id === staffId)).toBe(true);
    expect(staffList.every((s) => s.role === Role.STAFF)).toBe(true);
  });

  it('2. Khóa tài khoản: ADMIN khóa/mở khóa STAFF qua PATCH /staff/:id/status; STAFF bị khóa gọi API bị 403 ngay dù token còn hạn và đăng nhập bị 403; PATCH lên ADMIN, khách, id lạ trả 404', async () => {
    // 2.1 ADMIN khóa STAFF qua PATCH /staff/:id/status
    const lockRes = await request(app.getHttpServer())
      .patch(`/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    expect(lockRes.body).toMatchObject({
      id: staffId,
      email: staffEmail,
      role: Role.STAFF,
      isActive: false,
    });

    // 2.2 Token STAFF đang còn hạn nhưng gọi API nhân viên bị chặn NGAY với 403 "Tài khoản đã bị khóa"
    const lockedStaffCalls = [
      () =>
        request(app.getHttpServer())
          .get('/orders')
          .set('Authorization', `Bearer ${staffToken}`),
      () =>
        request(app.getHttpServer())
          .get('/products/manage')
          .set('Authorization', `Bearer ${staffToken}`),
      () =>
        request(app.getHttpServer())
          .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ isAvailable: false }),
    ];

    for (const callApi of lockedStaffCalls) {
      const res = await callApi().expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        message: 'Tài khoản đã bị khóa',
      });
    }

    // 2.3 STAFF bị khóa đăng nhập lại cũng bị 403 "Tài khoản đã bị khóa"
    const lockedLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: PASSWORD })
      .expect(403);

    expect(lockedLoginRes.body).toMatchObject({
      statusCode: 403,
      message: 'Tài khoản đã bị khóa',
    });

    // 2.4 ADMIN mở khóa lại cho STAFF -> đăng nhập và gọi API trở lại bình thường
    const unlockRes = await request(app.getHttpServer())
      .patch(`/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);

    expect(unlockRes.body).toMatchObject({
      id: staffId,
      isActive: true,
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    // 2.5 PATCH /staff/:id/status lên ADMIN, khách, id lạ -> 404 "Không tìm thấy nhân viên"
    for (const targetId of [adminId, customerId, UNKNOWN_UUID, 'not-a-uuid']) {
      const notFoundRes = await request(app.getHttpServer())
        .patch(`/staff/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(404);

      expect(notFoundRes.body).toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy nhân viên',
      });
    }
  });

  it('3. Hủy đơn (POST /orders/:id/cancel): khách hủy được PENDING, PAYMENT_FAILED, PAID (Payment vẫn SUCCESS, hoàn kho đúng kể cả gộp cùng món khác size); hủy lần 2 hoặc PREPARING/READY/COMPLETED -> 409 và kho không đổi; đơn người khác/id lạ -> 404', async () => {
    // 3.1 (a) Khách hủy đơn PENDING -> hoàn đúng kho; (d) hủy lần thứ hai trả 409 và kho KHÔNG bị cộng thêm
    const stockBeforePending = (
      await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_DRINK_ID },
      })
    ).stock;

    const pendingOrder = await createOrderViaHttp(customerToken);
    const stockAfterOrder = (
      await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_DRINK_ID },
      })
    ).stock;
    expect(stockAfterOrder).toBe(stockBeforePending - 1);

    const cancelPendingRes = await request(app.getHttpServer())
      .post(`/orders/${pendingOrder.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect((cancelPendingRes.body as { status: OrderStatus }).status).toBe(
      OrderStatus.CANCELLED,
    );

    const stockAfterCancelPending = (
      await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_DRINK_ID },
      })
    ).stock;
    expect(stockAfterCancelPending).toBe(stockBeforePending);

    // (d) Hủy lần thứ hai cùng đơn đó -> 409 và kho giữ nguyên không bị cộng thêm
    const cancelSecondTimeRes = await request(app.getHttpServer())
      .post(`/orders/${pendingOrder.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(409);
    expect(cancelSecondTimeRes.body).toMatchObject({
      statusCode: 409,
      message: 'Không thể hủy đơn ở trạng thái hiện tại',
    });

    const stockAfterSecondCancel = (
      await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_DRINK_ID },
      })
    ).stock;
    expect(stockAfterSecondCancel).toBe(stockBeforePending);

    // 3.1b (c) Đơn có cùng món khác size ở 2 dòng (2 ly size S + 3 ly size L = 5) -> hủy đơn gộp hoàn đúng 5 vào kho
    const multiSizeOrderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [
          { productId: PRODUCT_DRINK_ID, quantity: 2, size: Size.S },
          { productId: PRODUCT_DRINK_ID, quantity: 3, size: Size.L },
        ],
      })
      .expect(201);
    const multiSizeOrderId = (multiSizeOrderRes.body as { id: string }).id;

    const stockAfterMultiOrder = (
      await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_DRINK_ID },
      })
    ).stock;
    expect(stockAfterMultiOrder).toBe(stockBeforePending - 5);

    await request(app.getHttpServer())
      .post(`/orders/${multiSizeOrderId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const stockAfterMultiCancel = (
      await prisma.product.findUniqueOrThrow({
        where: { id: PRODUCT_DRINK_ID },
      })
    ).stock;
    expect(stockAfterMultiCancel).toBe(stockBeforePending);

    // 3.2 Hủy đơn PAYMENT_FAILED
    const failedOrder = await createOrderViaHttp(customerToken);
    await payOrderViaHttp(
      failedOrder.id,
      '0900000000',
      'idem-10b-cancel-failed-1',
    );
    const cancelFailedRes = await request(app.getHttpServer())
      .post(`/orders/${failedOrder.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect((cancelFailedRes.body as { status: OrderStatus }).status).toBe(
      OrderStatus.CANCELLED,
    );

    // 3.3 Hủy đơn PAID -> đơn thành CANCELLED, bản ghi Payment vẫn giữ nguyên SUCCESS
    const paidOrder = await createOrderViaHttp(customerToken);
    const paymentRes = await payOrderViaHttp(
      paidOrder.id,
      '0900000001',
      'idem-10b-cancel-paid-1',
    );
    expect(paymentRes.status).toBe(PaymentStatus.SUCCESS);

    const cancelPaidRes = await request(app.getHttpServer())
      .post(`/orders/${paidOrder.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect((cancelPaidRes.body as { status: OrderStatus }).status).toBe(
      OrderStatus.CANCELLED,
    );

    const paymentInDb = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentRes.id },
    });
    expect(paymentInDb.status).toBe(PaymentStatus.SUCCESS);

    // 3.4 Đơn của người khác hoặc id lạ -> 404 "Không tìm thấy đơn hàng"
    const otherUserOrder = await createOrderViaHttp(otherCustomerToken);
    for (const targetOrderId of [
      otherUserOrder.id,
      UNKNOWN_UUID,
      'invalid-order-id',
    ]) {
      const notFoundRes = await request(app.getHttpServer())
        .post(`/orders/${targetOrderId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(404);

      expect(notFoundRes.body).toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy đơn hàng',
      });
    }

    // 3.5 (e) Đơn đang ở PREPARING, READY, COMPLETED, CANCELLED -> 409 "Không thể hủy đơn ở trạng thái hiện tại" và kho không đổi
    const nonCancellableStatuses: OrderStatus[] = [
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ];

    for (const st of nonCancellableStatuses) {
      const ord = await createOrderViaHttp(customerToken);
      await prisma.order.update({
        where: { id: ord.id },
        data: { status: st },
      });

      const stockBeforeAttempt = (
        await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_DRINK_ID },
        })
      ).stock;

      const conflictRes = await request(app.getHttpServer())
        .post(`/orders/${ord.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(409);

      expect(conflictRes.body).toMatchObject({
        statusCode: 409,
        message: 'Không thể hủy đơn ở trạng thái hiện tại',
      });

      const stockAfterAttempt = (
        await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_DRINK_ID },
        })
      ).stock;
      expect(stockAfterAttempt).toBe(stockBeforeAttempt);
    }
  });

  it('4. Đổi trạng thái (PATCH /orders/:id/status) & GET /orders: đi đúng PAID→PREPARING→READY→COMPLETED; hủy từ PENDING/PAYMENT_FAILED/PAID; lùi/bỏ bước/đi tiếp từ cuối/hủy từ PREPARING,READY -> 409; status cấm/sai -> 400; GET /orders kèm customer, không lộ passwordHash, lọc ?status=', async () => {
    // 4.1 Luồng chuẩn PAID -> PREPARING -> READY -> COMPLETED
    const mainOrder = await createOrderViaHttp(customerToken);
    await payOrderViaHttp(mainOrder.id, '0900000001', 'idem-10b-flow-paid-1');

    const step1 = await request(app.getHttpServer())
      .patch(`/orders/${mainOrder.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: OrderStatus.PREPARING })
      .expect(200);
    expect(step1.body).toMatchObject({
      id: mainOrder.id,
      status: OrderStatus.PREPARING,
      customer: {
        id: customerId,
        displayName: 'Khách 10B',
        email: customerEmail,
      },
    });

    const step2 = await request(app.getHttpServer())
      .patch(`/orders/${mainOrder.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: OrderStatus.READY })
      .expect(200);
    expect((step2.body as { status: OrderStatus }).status).toBe(
      OrderStatus.READY,
    );

    const step3 = await request(app.getHttpServer())
      .patch(`/orders/${mainOrder.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: OrderStatus.COMPLETED })
      .expect(200);
    expect((step3.body as { status: OrderStatus }).status).toBe(
      OrderStatus.COMPLETED,
    );

    // 4.2 (b) Nhân viên hủy đơn từ PENDING, PAYMENT_FAILED, PAID qua PATCH -> 200 CANCELLED và hoàn đúng kho; (d) hủy lần 2 trả 409 và kho không cộng thêm
    for (const initialStatus of [
      OrderStatus.PENDING,
      OrderStatus.PAYMENT_FAILED,
      OrderStatus.PAID,
    ]) {
      const stockBeforeOrd = (
        await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_DRINK_ID },
        })
      ).stock;

      const ord = await createOrderViaHttp(customerToken);
      await prisma.order.update({
        where: { id: ord.id },
        data: { status: initialStatus },
      });

      const stockAfterOrd = (
        await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_DRINK_ID },
        })
      ).stock;
      expect(stockAfterOrd).toBe(stockBeforeOrd - 1);

      const cancelByStaffRes = await request(app.getHttpServer())
        .patch(`/orders/${ord.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      expect((cancelByStaffRes.body as { status: OrderStatus }).status).toBe(
        OrderStatus.CANCELLED,
      );

      const stockAfterStaffCancel = (
        await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_DRINK_ID },
        })
      ).stock;
      expect(stockAfterStaffCancel).toBe(stockBeforeOrd);

      // Hủy lần 2 qua PATCH -> 409 và kho giữ nguyên
      await request(app.getHttpServer())
        .patch(`/orders/${ord.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.CANCELLED })
        .expect(409);

      const stockAfterStaffSecondCancel = (
        await prisma.product.findUniqueOrThrow({
          where: { id: PRODUCT_DRINK_ID },
        })
      ).stock;
      expect(stockAfterStaffSecondCancel).toBe(stockBeforeOrd);
    }

    // 4.3 Lùi, bỏ bước, đi tiếp từ COMPLETED/CANCELLED, hủy từ PREPARING/READY -> 409
    const invalidTransitions: Array<{ from: OrderStatus; to: OrderStatus }> = [
      // Bỏ bước
      { from: OrderStatus.PENDING, to: OrderStatus.PREPARING },
      { from: OrderStatus.PAID, to: OrderStatus.READY },
      { from: OrderStatus.PAID, to: OrderStatus.COMPLETED },
      { from: OrderStatus.PREPARING, to: OrderStatus.COMPLETED },
      // Lùi bước
      { from: OrderStatus.READY, to: OrderStatus.PREPARING },
      // Hủy từ PREPARING / READY
      { from: OrderStatus.PREPARING, to: OrderStatus.CANCELLED },
      { from: OrderStatus.READY, to: OrderStatus.CANCELLED },
      // Đi tiếp từ trạng thái cuối COMPLETED / CANCELLED
      { from: OrderStatus.COMPLETED, to: OrderStatus.PREPARING },
      { from: OrderStatus.COMPLETED, to: OrderStatus.CANCELLED },
      { from: OrderStatus.CANCELLED, to: OrderStatus.PREPARING },
      { from: OrderStatus.CANCELLED, to: OrderStatus.COMPLETED },
    ];

    const testTransitionOrder = await createOrderViaHttp(customerToken);
    for (const { from, to } of invalidTransitions) {
      await prisma.order.update({
        where: { id: testTransitionOrder.id },
        data: { status: from },
      });

      await request(app.getHttpServer())
        .patch(`/orders/${testTransitionOrder.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: to })
        .expect(409);
    }

    // 4.4 Status không được phép cho PATCH /orders/:id/status (PAID, PENDING, PAYMENT_FAILED, sai hẳn) -> 400
    for (const badStatus of [
      OrderStatus.PAID,
      OrderStatus.PENDING,
      OrderStatus.PAYMENT_FAILED,
      'INVALID_STATUS',
    ]) {
      const badRes = await request(app.getHttpServer())
        .patch(`/orders/${testTransitionOrder.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: badStatus })
        .expect(400);

      expect(Array.isArray((badRes.body as { message: unknown }).message)).toBe(
        true,
      );
    }

    // 4.5 GET /orders kèm customer (id, displayName, email), không lộ passwordHash, lọc ?status= đúng, status sai -> 400 "Trạng thái không hợp lệ"
    const allOrdersRes = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    const allOrders = allOrdersRes.body as Array<{
      id: string;
      status: OrderStatus;
      customer: {
        id: string;
        displayName: string;
        email: string;
        passwordHash?: unknown;
      };
      passwordHash?: unknown;
    }>;
    const foundMain = allOrders.find((o) => o.id === mainOrder.id);
    expect(foundMain).toBeDefined();
    expect(foundMain?.customer).toEqual({
      id: customerId,
      displayName: 'Khách 10B',
      email: customerEmail,
    });
    expect(foundMain?.customer).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(foundMain)).not.toContain('passwordHash');

    const completedOrdersRes = await request(app.getHttpServer())
      .get('/orders')
      .query({ status: OrderStatus.COMPLETED })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    const completedOrders = completedOrdersRes.body as Array<{
      id: string;
      status: OrderStatus;
    }>;
    expect(completedOrders.length).toBeGreaterThan(0);
    expect(
      completedOrders.every((o) => o.status === OrderStatus.COMPLETED),
    ).toBe(true);
    expect(completedOrders.some((o) => o.id === mainOrder.id)).toBe(true);

    const invalidFilterRes = await request(app.getHttpServer())
      .get('/orders')
      .query({ status: 'WRONG_STATUS' })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(400);

    expect(invalidFilterRes.body).toMatchObject({
      statusCode: 400,
      message: 'Trạng thái không hợp lệ',
    });
  });

  it('5. Gạt bán/hết & Quản lý món: PATCH /products/:id/availability false -> stock = 0 (kể cả khi gửi kèm stock, POST /orders bị 409), true kèm stock -> đặt đúng stock (thiếu/sai stock -> 400); GET /products/manage thấy cả món ẩn', async () => {
    // 5.1 Gạt isAvailable = false (kể cả không kèm hay kèm stock) -> stock = 0
    const offRes = await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isAvailable: false })
      .expect(200);

    expect(offRes.body).toMatchObject({
      id: PRODUCT_DRINK_ID,
      stock: 0,
      isVisible: true,
    });

    const offWithStockRes = await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isAvailable: false, stock: 75 })
      .expect(200);

    expect(offWithStockRes.body).toMatchObject({
      id: PRODUCT_DRINK_ID,
      stock: 0,
      isVisible: true,
    });

    // 5.2 Khách đặt món vừa bị gạt tạm hết -> 409 Conflict
    const orderOosRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: PRODUCT_DRINK_ID, quantity: 1 }],
      })
      .expect(409);

    expect(orderOosRes.body).toEqual({
      statusCode: 409,
      message: "Sản phẩm 'Trà đào cam sả 10B' hiện đã tạm hết",
      error: 'Conflict',
      details: [
        {
          productId: PRODUCT_DRINK_ID,
          name: 'Trà đào cam sả 10B',
          available: 0,
        },
      ],
    });

    // 5.2b Gạt isAvailable = true nhưng thiếu stock, stock = 0, stock = 10000, stock không nguyên -> 400
    for (const invalidBody of [
      { isAvailable: true },
      { isAvailable: true, stock: 0 },
      { isAvailable: true, stock: 10000 },
      { isAvailable: true, stock: 15.5 },
      { isAvailable: true, stock: '20' },
      { isAvailable: 'true', stock: 20 },
    ]) {
      const badAvailRes = await request(app.getHttpServer())
        .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send(invalidBody)
        .expect(400);

      expect(
        Array.isArray((badAvailRes.body as { message: unknown }).message),
      ).toBe(true);
    }

    // 5.3 Gạt isAvailable = true kèm stock = 35 -> stock = 35 (không cộng dồn), đặt lại đơn thành công (201)
    const onRes = await request(app.getHttpServer())
      .patch(`/products/${PRODUCT_DRINK_ID}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isAvailable: true, stock: 35 })
      .expect(200);

    expect(onRes.body).toMatchObject({
      id: PRODUCT_DRINK_ID,
      stock: 35,
      isVisible: true,
    });

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: PRODUCT_DRINK_ID, quantity: 1 }],
      })
      .expect(201);

    // 5.4 GET /products/manage thấy cả món đang hiển thị và món đang ẩn (isVisible = false)
    const manageRes = await request(app.getHttpServer())
      .get('/products/manage')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    const managedProducts = manageRes.body as Array<{
      id: string;
      isVisible: boolean;
    }>;
    const visibleItem = managedProducts.find((p) => p.id === PRODUCT_DRINK_ID);
    const hiddenItem = managedProducts.find((p) => p.id === PRODUCT_HIDDEN_ID);

    expect(visibleItem).toBeDefined();
    expect(visibleItem?.isVisible).toBe(true);
    expect(hiddenItem).toBeDefined();
    expect(hiddenItem?.isVisible).toBe(false);
  });
});
