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

  describe('POST /promotions/validate (VIỆC 7 - 7A.1 & 5.2)', () => {
    let codePercentNoCap: string;
    let codePercentCap15k: string;
    let codePercent100: string;
    let codeFixed20k: string;
    let codeInactive: string;

    beforeAll(async () => {
      const suffix = String(Date.now()).slice(-6);
      codePercentNoCap = `V7_NOCAP_${suffix}`;
      codePercentCap15k = `V7_CAP15_${suffix}`;
      codePercent100 = `V7_P100_${suffix}`;
      codeFixed20k = `V7_FIX20_${suffix}`;
      codeInactive = `V7_OFF_${suffix}`;

      for (const c of [
        codePercentNoCap,
        codePercentCap15k,
        codePercent100,
        codeFixed20k,
        codeInactive,
      ]) {
        createdPromotionCodes.add(c);
      }

      const p1 = await prisma.promotion.create({
        data: {
          code: codePercentNoCap,
          type: PromotionType.PERCENT,
          value: 10,
          maxDiscount: null,
          isActive: true,
        },
      });
      createdPromotionIds.add(p1.id);

      const p2 = await prisma.promotion.create({
        data: {
          code: codePercentCap15k,
          type: PromotionType.PERCENT,
          value: 10,
          maxDiscount: 15000,
          isActive: true,
        },
      });
      createdPromotionIds.add(p2.id);

      const p3 = await prisma.promotion.create({
        data: {
          code: codePercent100,
          type: PromotionType.PERCENT,
          value: 100,
          maxDiscount: null,
          isActive: true,
        },
      });
      createdPromotionIds.add(p3.id);

      const p4 = await prisma.promotion.create({
        data: {
          code: codeFixed20k,
          type: PromotionType.FIXED,
          value: 20000,
          maxDiscount: null,
          isActive: true,
        },
      });
      createdPromotionIds.add(p4.id);

      const p5 = await prisma.promotion.create({
        data: {
          code: codeInactive,
          type: PromotionType.PERCENT,
          value: 15,
          maxDiscount: null,
          isActive: false,
        },
      });
      createdPromotionIds.add(p5.id);
    });

    it('(a)-(f) tính đúng discountAmount cho PERCENT không trần, PERCENT có trần, làm tròn xuống, FIXED, chặn dưới 1.000đ, và chuẩn hóa code viết thường có khoảng trắng', async () => {
      // (a) & (f) PERCENT không trần: subtotal 80.000, 10% -> 8.000; mã viết thường có khoảng trắng vẫn tra ra
      const resA = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: `  ${codePercentNoCap.toLowerCase()}  `,
          subtotal: 80000,
        })
        .expect(200);

      expect(resA.body).toEqual({
        code: codePercentNoCap,
        type: PromotionType.PERCENT,
        value: 10,
        maxDiscount: null,
        discountAmount: 8000,
      });

      // (b) PERCENT có trần: 10% của 200.000 = 20.000 nhưng trần 15.000 -> 15.000
      const resB = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: codePercentCap15k,
          subtotal: 200000,
        })
        .expect(200);

      expect(resB.body).toEqual({
        code: codePercentCap15k,
        type: PromotionType.PERCENT,
        value: 10,
        maxDiscount: 15000,
        discountAmount: 15000,
      });

      // (c) giá trị lẻ làm tròn xuống: subtotal 33.333 giảm 10% -> 3.333 (không phải 3.334)
      const resC = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: codePercentNoCap,
          subtotal: 33333,
        })
        .expect(200);

      expect(resC.body).toEqual({
        code: codePercentNoCap,
        type: PromotionType.PERCENT,
        value: 10,
        maxDiscount: null,
        discountAmount: 3333,
      });

      // (d) FIXED 20.000 trên subtotal 80.000 -> 20.000
      const resD = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: codeFixed20k,
          subtotal: 80000,
        })
        .expect(200);

      expect(resD.body).toEqual({
        code: codeFixed20k,
        type: PromotionType.FIXED,
        value: 20000,
        maxDiscount: null,
        discountAmount: 20000,
      });

      // (e) mức giảm không làm tổng dưới 1.000đ:
      // - FIXED 20.000 trên subtotal 15.000 -> 14.000
      const resE1 = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: codeFixed20k,
          subtotal: 15000,
        })
        .expect(200);
      expect((resE1.body as { discountAmount: number }).discountAmount).toBe(
        14000,
      );

      // - PERCENT 100% trên 50.000 -> 49.000
      const resE2 = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: codePercent100,
          subtotal: 50000,
        })
        .expect(200);
      expect((resE2.body as { discountAmount: number }).discountAmount).toBe(
        49000,
      );

      // - subtotal 1.000 thì discountAmount = 0
      const resE3 = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: codeFixed20k,
          subtotal: 1000,
        })
        .expect(200);
      expect((resE3.body as { discountAmount: number }).discountAmount).toBe(0);
    });

    it('(g) kiểm tra body trước (400 mảng chuỗi tiếng Anh) -> mã sai trả 404 "Mã giảm giá không tồn tại" -> mã đang tắt trả 409 "Mã giảm giá đã ngừng áp dụng"', async () => {
      // Body sai -> 400 (kể cả khi mã không tồn tại)
      const invalidBodies = [
        { code: '', subtotal: 80000 },
        { code: '   ', subtotal: 80000 },
        { code: 'A'.repeat(31), subtotal: 80000 },
        { code: 'KHONG_TON_TAI', subtotal: 999 },
        { code: 'KHONG_TON_TAI', subtotal: 80000.5 },
      ];

      for (const badBody of invalidBodies) {
        const res400 = await request(app.getHttpServer())
          .post('/promotions/validate')
          .set('Authorization', `Bearer ${customerToken}`)
          .send(badBody)
          .expect(400);

        expect(
          Array.isArray((res400.body as { message: unknown }).message),
        ).toBe(true);
      }

      // Mã sai -> 404 "Mã giảm giá không tồn tại"
      const res404 = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'MA_KHONG_TON_TAI_999', subtotal: 80000 })
        .expect(404);

      expect(res404.body).toMatchObject({
        statusCode: 404,
        message: 'Mã giảm giá không tồn tại',
      });

      // Mã đang tắt (isActive = false) -> 409 "Mã giảm giá đã ngừng áp dụng"
      const res409 = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: ` ${codeInactive.toLowerCase()} `, subtotal: 80000 })
        .expect(409);

      expect(res409.body).toMatchObject({
        statusCode: 409,
        message: 'Mã giảm giá đã ngừng áp dụng',
      });
    });

    it('(h) & (i) Phân quyền validate & hồi quy 3 endpoint ADMIN cũ: chưa đăng nhập -> 401; STAFF -> 403; ADMIN -> 403; CUSTOMER -> 200; 3 endpoint ADMIN cũ vẫn chặn CUSTOMER bằng 403', async () => {
      // (h) Chưa đăng nhập gọi POST /promotions/validate -> 401
      await request(app.getHttpServer())
        .post('/promotions/validate')
        .send({ code: codePercentNoCap, subtotal: 80000 })
        .expect(401);

      // (h) STAFF gọi POST /promotions/validate -> 403
      const staffRes = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: codePercentNoCap, subtotal: 80000 })
        .expect(403);
      expect(staffRes.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });

      // (h) ADMIN gọi POST /promotions/validate -> 403
      const adminRes = await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: codePercentNoCap, subtotal: 80000 })
        .expect(403);
      expect(adminRes.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });

      // (h) CUSTOMER gọi POST /promotions/validate -> 200
      await request(app.getHttpServer())
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: codePercentNoCap, subtotal: 80000 })
        .expect(200);

      // (i) 3 endpoint ADMIN cũ vẫn chặn CUSTOMER bằng 403
      const custGet = await request(app.getHttpServer())
        .get('/promotions')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      expect(custGet.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });

      const custPost = await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'CUST_FORBID',
          type: PromotionType.PERCENT,
          value: 10,
        })
        .expect(403);
      expect(custPost.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });

      const custPatch = await request(app.getHttpServer())
        .patch(`/promotions/${UNKNOWN_UUID}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ isActive: false })
        .expect(403);
      expect(custPatch.body).toMatchObject({
        statusCode: 403,
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    });
  });
});
