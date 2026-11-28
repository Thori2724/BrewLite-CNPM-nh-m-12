import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PromotionType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/app-config';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl } from './orders.e2e-spec';

describe('Promotions Admin Integration (VIỆC 6 - 7A.2, 7A.3, 7A.4)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let customerToken: string;
  let staffToken: string;
  let adminToken: string;

  const PASSWORD = 'Password123@';
  const UNKNOWN_UUID = '99999999-0000-4000-8000-000000009999';

  const createdUserEmails: string[] = [];
  const createdPromotionIds = new Set<string>();
  const createdPromotionCodes = new Set<string>();

  async function cleanupSuiteData() {
    if (!prisma) {
      return;
    }

    const promoIds = Array.from(createdPromotionIds);
    const promoCodes = Array.from(createdPromotionCodes);

    if (promoIds.length > 0 || promoCodes.length > 0) {
      await prisma.promotion.deleteMany({
        where: {
          OR: [
            ...(promoIds.length > 0 ? [{ id: { in: promoIds } }] : []),
            ...(promoCodes.length > 0 ? [{ code: { in: promoCodes } }] : []),
          ],
        },
      });
    }

    if (createdUserEmails.length > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: createdUserEmails } },
      });
    }
  }

  beforeAll(async () => {
    const safeTestDbUrl = assertSafeTestDatabaseUrl();
    process.env.DATABASE_URL = safeTestDbUrl;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-brewlite-promotions';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupSuiteData();

    const ts = Date.now();
    const customerEmail = `cust.promo.${ts}@example.com`;
    const staffEmail = `staff.promo.${ts}@example.com`;
    const adminEmail = `admin.promo.${ts}@example.com`;

    createdUserEmails.push(customerEmail, staffEmail, adminEmail);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    await prisma.user.create({
      data: {
        email: customerEmail,
        passwordHash,
        displayName: 'Khách Promo E2E',
        role: Role.CUSTOMER,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash,
        displayName: 'Nhân viên Promo E2E',
        role: Role.STAFF,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        displayName: 'Quản lý Promo E2E',
        role: Role.ADMIN,
        isActive: true,
      },
    });

    const loginCust = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: customerEmail, password: PASSWORD })
      .expect(200);
    customerToken = (loginCust.body as { accessToken: string }).accessToken;

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

  afterAll(async () => {
    await cleanupSuiteData();
    if (app) {
      await app.close();
    }
  });

  it('(a) Phân quyền: chưa đăng nhập gọi cả 3 endpoint -> 401; STAFF và CUSTOMER gọi cả 3 endpoint -> 403 "Bạn không có quyền thực hiện thao tác này"', async () => {
    // 1. Chưa đăng nhập -> 401
    await request(app.getHttpServer()).get('/promotions').expect(401);
    await request(app.getHttpServer())
      .post('/promotions')
      .send({
        code: 'NOAUTH10',
        type: PromotionType.PERCENT,
        value: 10,
      })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/promotions/${UNKNOWN_UUID}`)
      .send({ isActive: false })
      .expect(401);

    // 2. CUSTOMER và STAFF gọi cả 3 endpoint -> 403
    for (const token of [customerToken, staffToken]) {
      const getRes = await request(app.getHttpServer())
        .get('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(getRes.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });

      const postRes = await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'FORBID10',
          type: PromotionType.PERCENT,
          value: 10,
        })
        .expect(403);
      expect(postRes.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });

      const patchRes = await request(app.getHttpServer())
        .patch(`/promotions/${UNKNOWN_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false })
        .expect(403);
      expect(patchRes.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }
  });

  it('(b), (c), (d), (e) POST /promotions: tạo mã thành công (code thường đổi sang HOA, PERCENT không gửi maxDiscount lưu null), trùng code trả 409 (kể cả khác hoa/thường), sai ràng buộc value/maxDiscount trả 400 mảng chuỗi tiếng Anh', async () => {
    const suffix = String(Date.now()).slice(-6);
    const rawCode1 = `  e2e_per_${suffix}  `;
    const expectedCode1 = `E2E_PER_${suffix}`;
    createdPromotionCodes.add(expectedCode1);

    // (b) & (e) Tạo mã PERCENT viết thường, không gửi maxDiscount -> lưu HOA, maxDiscount = null, isActive = true
    const createPerRes = await request(app.getHttpServer())
      .post('/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: rawCode1,
        type: PromotionType.PERCENT,
        value: 15,
      })
      .expect(201);

    const createdPer = createPerRes.body as {
      id: string;
      code: string;
      type: PromotionType;
      value: number;
      maxDiscount: number | null;
      isActive: boolean;
      createdAt: string;
    };
    createdPromotionIds.add(createdPer.id);

    expect(createdPer).toMatchObject({
      code: expectedCode1,
      type: PromotionType.PERCENT,
      value: 15,
      maxDiscount: null,
      isActive: true,
    });
    expect(typeof createdPer.id).toBe('string');
    expect(typeof createdPer.createdAt).toBe('string');

    // Tạo thêm mã PERCENT có maxDiscount = 25000
    const codeWithCap = `E2E_CAP_${suffix}`;
    createdPromotionCodes.add(codeWithCap);

    const createCapRes = await request(app.getHttpServer())
      .post('/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: codeWithCap.toLowerCase(),
        type: PromotionType.PERCENT,
        value: 20,
        maxDiscount: 25000,
      })
      .expect(201);

    const createdCap = createCapRes.body as {
      id: string;
      code: string;
      maxDiscount: number | null;
    };
    createdPromotionIds.add(createdCap.id);
    expect(createdCap.code).toBe(codeWithCap);
    expect(createdCap.maxDiscount).toBe(25000);

    // (c) Trùng code (kể cả gửi chữ thường/hoa khác nhau) -> 409 "Mã giảm giá đã tồn tại"
    const dupRes = await request(app.getHttpServer())
      .post('/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: expectedCode1.toLowerCase(),
        type: PromotionType.FIXED,
        value: 15000,
      })
      .expect(409);

    expect(dupRes.body).toMatchObject({
      statusCode: 409,
      message: 'Mã giảm giá đã tồn tại',
    });

    // (d) & (e) Các ca 400: PERCENT value 0 và 101; FIXED value 999 và 1000001; maxDiscount gửi kèm FIXED
    const invalidBodies = [
      { code: `BAD_${suffix}_1`, type: PromotionType.PERCENT, value: 0 },
      { code: `BAD_${suffix}_2`, type: PromotionType.PERCENT, value: 101 },
      { code: `BAD_${suffix}_3`, type: PromotionType.FIXED, value: 999 },
      { code: `BAD_${suffix}_4`, type: PromotionType.FIXED, value: 1000001 },
      {
        code: `BAD_${suffix}_5`,
        type: PromotionType.FIXED,
        value: 20000,
        maxDiscount: 10000,
      },
    ];

    for (const body of invalidBodies) {
      const badRes = await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(400);

      expect(Array.isArray((badRes.body as { message: unknown }).message)).toBe(
        true,
      );
    }
  });

  it('(f), (g), (h), (i) PATCH /promotions/:id & GET /promotions: gửi code hoặc body rỗng -> 400; bật/tắt isActive; đổi PERCENT sang FIXED tự đưa maxDiscount về null; id lạ -> 404; GET trả mới nhất trước và gồm cả mã đã tắt', async () => {
    const suffix = String(Date.now()).slice(-6);
    const code1 = `E2E_P1_${suffix}`;
    const code2 = `E2E_P2_${suffix}`;
    createdPromotionCodes.add(code1);
    createdPromotionCodes.add(code2);

    const res1 = await request(app.getHttpServer())
      .post('/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: code1,
        type: PromotionType.PERCENT,
        value: 10,
        maxDiscount: 30000,
      })
      .expect(201);
    const promo1 = res1.body as {
      id: string;
      code: string;
      maxDiscount: number | null;
      isActive: boolean;
    };
    createdPromotionIds.add(promo1.id);
    expect(promo1.maxDiscount).toBe(30000);

    const res2 = await request(app.getHttpServer())
      .post('/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: code2,
        type: PromotionType.FIXED,
        value: 15000,
      })
      .expect(201);
    const promo2 = res2.body as { id: string; code: string };
    createdPromotionIds.add(promo2.id);

    // (f) PATCH gửi kèm code -> 400; PATCH body rỗng -> 400
    const patchCodeRes = await request(app.getHttpServer())
      .patch(`/promotions/${promo1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'CHANGED_CODE', value: 20 })
      .expect(400);
    expect(
      Array.isArray((patchCodeRes.body as { message: unknown }).message),
    ).toBe(true);

    const patchEmptyRes = await request(app.getHttpServer())
      .patch(`/promotions/${promo1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
    expect(
      Array.isArray((patchEmptyRes.body as { message: unknown }).message),
    ).toBe(true);

    // Đổi sang FIXED nhưng không gửi value hợp lệ (value hiện tại = 10 < 1000) -> 400
    const patchInvalidTypeSwitch = await request(app.getHttpServer())
      .patch(`/promotions/${promo1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: PromotionType.FIXED })
      .expect(400);
    expect(
      Array.isArray(
        (patchInvalidTypeSwitch.body as { message: unknown }).message,
      ),
    ).toBe(true);

    // (g) PATCH tắt rồi bật isActive; đổi từ PERCENT sang FIXED thì maxDiscount tự về null
    const disableRes = await request(app.getHttpServer())
      .patch(`/promotions/${promo1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);
    expect((disableRes.body as { isActive: boolean }).isActive).toBe(false);

    const switchToFixedRes = await request(app.getHttpServer())
      .patch(`/promotions/${promo1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: PromotionType.FIXED,
        value: 25000,
      })
      .expect(200);

    expect(switchToFixedRes.body).toMatchObject({
      id: promo1.id,
      code: code1,
      type: PromotionType.FIXED,
      value: 25000,
      maxDiscount: null,
      isActive: false,
    });

    // (h) PATCH id không tồn tại hoặc không phải UUID -> 404 "Không tìm thấy mã giảm giá"
    for (const badId of [UNKNOWN_UUID, 'not-a-valid-uuid']) {
      const notFoundRes = await request(app.getHttpServer())
        .patch(`/promotions/${badId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(404);

      expect(notFoundRes.body).toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy mã giảm giá',
      });
    }

    // (i) GET /promotions trả mới nhất trước (promo2 tạo sau nên đứng trước promo1) và có cả mã đã tắt (promo1 có isActive = false)
    const listRes = await request(app.getHttpServer())
      .get('/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const list = listRes.body as Array<{
      id: string;
      code: string;
      type: PromotionType;
      value: number;
      maxDiscount: number | null;
      isActive: boolean;
      createdAt: string;
    }>;

    const idxPromo2 = list.findIndex((p) => p.id === promo2.id);
    const idxPromo1 = list.findIndex((p) => p.id === promo1.id);

    expect(idxPromo2).toBeGreaterThanOrEqual(0);
    expect(idxPromo1).toBeGreaterThanOrEqual(0);
    expect(idxPromo2).toBeLessThan(idxPromo1);
    expect(list[idxPromo1].isActive).toBe(false);

    for (let i = 0; i < list.length - 1; i++) {
      const currentTs = new Date(list[i].createdAt).getTime();
      const nextTs = new Date(list[i + 1].createdAt).getTime();
      expect(currentTs).toBeGreaterThanOrEqual(nextTs);
    }
  });
});
