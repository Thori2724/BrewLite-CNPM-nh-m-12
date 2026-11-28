import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { LoyaltyType, Role } from '@prisma/client';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyController } from './loyalty.controller';
import { LOYALTY_HISTORY_LIMIT, LoyaltyService } from './loyalty.service';

describe('LoyaltyService & LoyaltyController (VIỆC 12 - GET /loyalty/me)', () => {
  let service: LoyaltyService;
  let controller: LoyaltyController;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };

  const CUSTOMER_A_ID = '44444444-0000-4000-8000-0000000012a1';
  const CUSTOMER_B_ID = '44444444-0000-4000-8000-0000000012b2';

  const makeAuthReq = (userId: string): AuthenticatedRequest =>
    ({
      user: {
        id: userId,
        email: 'khach@example.com',
        role: Role.CUSTOMER,
      },
    }) as unknown as AuthenticatedRequest;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoyaltyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
    controller = new LoyaltyController(service);
  });

  it('(a), (c), (g) khách có điểm và vài giao dịch: loyaltyPoints đúng, transactions đúng type, points có dấu, orderNumber đúng (null khi không gắn đơn), mỗi giao dịch chỉ có đúng 5 trường id, type, points, orderNumber, createdAt trong 1 lần truy vấn', async () => {
    const t1 = new Date('2026-03-10T08:00:00.000Z');
    const t2 = new Date('2026-03-10T09:00:00.000Z');
    const t3 = new Date('2026-03-10T10:00:00.000Z');

    prisma.user.findUnique.mockResolvedValueOnce({
      loyaltyPoints: 46,
      loyaltyTransactions: [
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000003',
          type: LoyaltyType.EARN,
          points: 6,
          createdAt: t3,
          order: { userId: CUSTOMER_A_ID, orderNumber: 105 },
        },
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000002',
          type: LoyaltyType.REDEEM,
          points: -10,
          createdAt: t2,
          order: { userId: CUSTOMER_A_ID, orderNumber: 105 },
        },
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          type: LoyaltyType.EARN,
          points: 50,
          createdAt: t1,
          order: null,
        },
      ],
    });

    const result = await controller.findMyLoyalty(makeAuthReq(CUSTOMER_A_ID));

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: CUSTOMER_A_ID },
      select: {
        loyaltyPoints: true,
        loyaltyTransactions: {
          where: { userId: CUSTOMER_A_ID },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: LOYALTY_HISTORY_LIMIT,
          select: {
            id: true,
            type: true,
            points: true,
            createdAt: true,
            order: {
              select: {
                userId: true,
                orderNumber: true,
              },
            },
          },
        },
      },
    });

    expect(result).toEqual({
      loyaltyPoints: 46,
      transactions: [
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000003',
          type: LoyaltyType.EARN,
          points: 6,
          orderNumber: 105,
          createdAt: t3,
        },
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000002',
          type: LoyaltyType.REDEEM,
          points: -10,
          orderNumber: 105,
          createdAt: t2,
        },
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          type: LoyaltyType.EARN,
          points: 50,
          orderNumber: null,
          createdAt: t1,
        },
      ],
    });

    // (g) Mỗi giao dịch có đúng 5 trường, không có userId, orderId
    for (const tx of result.transactions) {
      expect(Object.keys(tx).sort()).toEqual([
        'createdAt',
        'id',
        'orderNumber',
        'points',
        'type',
      ]);
      expect(tx).not.toHaveProperty('userId');
      expect(tx).not.toHaveProperty('orderId');
      expect(tx).not.toHaveProperty('order');
    }
  });

  it('(b) khách có 55 giao dịch: truy vấn giới hạn take = 50, sắp xếp [{ createdAt: "desc" }, { id: "desc" }], trả đúng 50 dòng mới nhất theo thứ tự mới nhất trước', async () => {
    const baseTime = new Date('2026-03-01T00:00:00.000Z').getTime();
    const all55Desc = Array.from({ length: 55 }, (_, idx) => {
      const seq = 55 - idx; // 55 xuống 1 (mới nhất trước)
      return {
        id: `bbbbbbbb-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        type: seq % 2 === 0 ? LoyaltyType.EARN : LoyaltyType.REDEEM,
        points: seq % 2 === 0 ? seq : -seq,
        createdAt: new Date(baseTime + seq * 1000),
        order: { userId: CUSTOMER_A_ID, orderNumber: 1000 + seq },
      };
    });

    prisma.user.findUnique.mockImplementationOnce(
      ({
        select,
      }: {
        select: {
          loyaltyTransactions: { take: number };
        };
      }) =>
        Promise.resolve({
          loyaltyPoints: 120,
          loyaltyTransactions: all55Desc.slice(
            0,
            select.loyaltyTransactions.take,
          ),
        }),
    );

    const result = await controller.findMyLoyalty(makeAuthReq(CUSTOMER_A_ID));

    expect(result.loyaltyPoints).toBe(120);
    expect(result.transactions).toHaveLength(50);
    expect(result.transactions[0].orderNumber).toBe(1055);
    expect(result.transactions[49].orderNumber).toBe(1006);

    for (let i = 0; i < result.transactions.length - 1; i++) {
      expect(result.transactions[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        result.transactions[i + 1].createdAt.getTime(),
      );
    }
  });

  it('(d) khách A chỉ truy vấn theo userId của chính mình từ JWT và không bao giờ thấy giao dịch hay orderNumber của khách B', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      loyaltyPoints: 15,
      loyaltyTransactions: [
        {
          id: 'cccccccc-0000-4000-8000-000000000001',
          type: LoyaltyType.EARN,
          points: 15,
          createdAt: new Date('2026-03-11T10:00:00.000Z'),
          order: { userId: CUSTOMER_B_ID, orderNumber: 999 },
        },
      ],
    });

    const result = await controller.findMyLoyalty(makeAuthReq(CUSTOMER_A_ID));

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: CUSTOMER_A_ID },
      select: {
        loyaltyPoints: true,
        loyaltyTransactions: {
          where: { userId: CUSTOMER_A_ID },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: LOYALTY_HISTORY_LIMIT,
          select: {
            id: true,
            type: true,
            points: true,
            createdAt: true,
            order: {
              select: {
                userId: true,
                orderNumber: true,
              },
            },
          },
        },
      },
    });
    // Ngay cả khi giả định dữ liệu order gắn khác userId, orderNumber cũng bị chặn về null
    expect(result.transactions[0].orderNumber).toBeNull();
  });

  it('(e) khách chưa có giao dịch: loyaltyPoints đúng (kể cả 0) và transactions = []', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      loyaltyPoints: 0,
      loyaltyTransactions: [],
    });

    const result = await controller.findMyLoyalty(makeAuthReq(CUSTOMER_A_ID));
    expect(result).toEqual({
      loyaltyPoints: 0,
      transactions: [],
    });
  });

  it('(h) chu trình đặt đơn dùng điểm -> thanh toán -> hủy đơn: lịch sử trả đủ REDEEM (âm), EARN (dương), REFUND (dương), REVOKE (âm) và ổn định thứ tự khi REFUND & REVOKE cùng createdAt', async () => {
    const cancelTime = new Date('2026-03-12T10:05:00.000Z');
    const payTime = new Date('2026-03-12T10:02:00.000Z');
    const orderTime = new Date('2026-03-12T10:00:00.000Z');

    prisma.user.findUnique.mockResolvedValueOnce({
      loyaltyPoints: 50,
      loyaltyTransactions: [
        {
          id: 'dddddddd-0000-4000-8000-000000000004',
          type: LoyaltyType.REVOKE,
          points: -6,
          createdAt: cancelTime,
          order: { userId: CUSTOMER_A_ID, orderNumber: 201 },
        },
        {
          id: 'dddddddd-0000-4000-8000-000000000003',
          type: LoyaltyType.REFUND,
          points: 10,
          createdAt: cancelTime,
          order: { userId: CUSTOMER_A_ID, orderNumber: 201 },
        },
        {
          id: 'dddddddd-0000-4000-8000-000000000002',
          type: LoyaltyType.EARN,
          points: 6,
          createdAt: payTime,
          order: { userId: CUSTOMER_A_ID, orderNumber: 201 },
        },
        {
          id: 'dddddddd-0000-4000-8000-000000000001',
          type: LoyaltyType.REDEEM,
          points: -10,
          createdAt: orderTime,
          order: { userId: CUSTOMER_A_ID, orderNumber: 201 },
        },
      ],
    });

    const result = await controller.findMyLoyalty(makeAuthReq(CUSTOMER_A_ID));
    expect(result.loyaltyPoints).toBe(50);
    expect(
      result.transactions.map((t) => ({ type: t.type, points: t.points })),
    ).toEqual([
      { type: LoyaltyType.REVOKE, points: -6 },
      { type: LoyaltyType.REFUND, points: 10 },
      { type: LoyaltyType.EARN, points: 6 },
      { type: LoyaltyType.REDEEM, points: -10 },
    ]);
  });

  describe('(f) Guards trên GET /loyalty/me', () => {
    let jwtService: { verifyAsync: jest.Mock };
    let jwtGuard: JwtAuthGuard;
    let rolesGuard: RolesGuard;

    const createContext = (authHeader?: string): ExecutionContext => {
      const req: Record<string, unknown> = {
        headers: authHeader ? { authorization: authHeader } : {},
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        LoyaltyController.prototype,
        'findMyLoyalty',
      );
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => descriptor?.value as (...args: never[]) => unknown,
        getClass: () => LoyaltyController,
      } as unknown as ExecutionContext;
    };

    beforeEach(() => {
      jwtService = { verifyAsync: jest.fn() };
      jwtGuard = new JwtAuthGuard(jwtService as unknown as JwtService);
      rolesGuard = new RolesGuard(
        jwtService as unknown as JwtService,
        new Reflector(),
        prisma as unknown as PrismaService,
      );
    });

    it('chưa đăng nhập hoặc thiếu req.user.id -> 401; STAFF -> 403 "Bạn không có quyền thực hiện thao tác này"; ADMIN -> 403 "Bạn không có quyền thực hiện thao tác này"; CUSTOMER đang hoạt động -> qua được', async () => {
      // 1. Chưa đăng nhập -> 401
      const unauthCtx = createContext(undefined);
      await expect(jwtGuard.canActivate(unauthCtx)).rejects.toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );

      expect(() =>
        controller.findMyLoyalty({} as unknown as AuthenticatedRequest),
      ).toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );

      // 2. STAFF -> 403
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: '55555555-0000-0000-0000-000000000001',
        email: 'nhanvien1@example.com',
        role: Role.STAFF,
      });
      const staffCtx = createContext('Bearer staff-token');
      await jwtGuard.canActivate(staffCtx);
      await expect(rolesGuard.canActivate(staffCtx)).rejects.toThrow(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
      );

      // 3. ADMIN -> 403
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: '66666666-0000-0000-0000-000000000001',
        email: 'quanly@example.com',
        role: Role.ADMIN,
      });
      const adminCtx = createContext('Bearer admin-token');
      await jwtGuard.canActivate(adminCtx);
      await expect(rolesGuard.canActivate(adminCtx)).rejects.toThrow(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
      );

      // 4. CUSTOMER đang hoạt động -> qua được và gán req.user.id = payload.sub
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: CUSTOMER_A_ID,
        email: 'khach@example.com',
        role: Role.CUSTOMER,
      });
      prisma.user.findUnique.mockResolvedValueOnce({ isActive: true });
      const customerCtx = createContext('Bearer customer-token');
      expect(await jwtGuard.canActivate(customerCtx)).toBe(true);
      expect(await rolesGuard.canActivate(customerCtx)).toBe(true);

      const reqInCtx = customerCtx
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();
      expect(reqInCtx.user?.id).toBe(CUSTOMER_A_ID);
    });
  });
});
