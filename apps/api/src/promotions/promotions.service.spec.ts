import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PromotionType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionsController } from './promotions.controller';
import {
  PROMOTION_CODE_EXISTS_MESSAGE,
  PROMOTION_NOT_FOUND_MESSAGE,
  PromotionsService,
} from './promotions.service';

describe('PromotionsService & PromotionsController', () => {
  let service: PromotionsService;
  let controller: PromotionsController;
  let prisma: {
    promotion: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  });

  const PROMO_PERCENT_ID = 'aaaaaaaa-0000-4000-8000-000000007a01';
  const PROMO_FIXED_ID = 'aaaaaaaa-0000-4000-8000-000000007a02';
  const PROMO_INACTIVE_ID = 'aaaaaaaa-0000-4000-8000-000000007a03';

  const mockPercentPromo = {
    id: PROMO_PERCENT_ID,
    code: 'BREW10',
    type: PromotionType.PERCENT,
    value: 10,
    maxDiscount: 30000,
    isActive: true,
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
  };

  const mockFixedPromo = {
    id: PROMO_FIXED_ID,
    code: 'GIAM20K',
    type: PromotionType.FIXED,
    value: 20000,
    maxDiscount: null,
    isActive: true,
    createdAt: new Date('2026-03-02T10:00:00.000Z'),
  };

  const mockInactivePromo = {
    id: PROMO_INACTIVE_ID,
    code: 'TAMNGUNG',
    type: PromotionType.PERCENT,
    value: 15,
    maxDiscount: null,
    isActive: false,
    createdAt: new Date('2026-03-03T10:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      promotion: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PromotionsService>(PromotionsService);
    controller = new PromotionsController(service);
  });

  describe('findAll (GET /promotions)', () => {
    it('(i) trả mọi mã kể cả mã đã tắt (isActive = false), sắp xếp mới nhất trước (createdAt desc), không phân trang, đủ trường hợp đồng', async () => {
      prisma.promotion.findMany.mockResolvedValue([
        mockInactivePromo,
        mockFixedPromo,
        mockPercentPromo,
      ]);

      const result = await controller.findAll();

      expect(prisma.promotion.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.promotion.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          maxDiscount: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(PROMO_INACTIVE_ID);
      expect(result[0].isActive).toBe(false);
    });
  });

  describe('create (POST /promotions)', () => {
    it('(b) & (e) tạo mã thành công, code viết thường và có khoảng trắng hai đầu được tự đổi thành chữ hoa; PERCENT không gửi maxDiscount thì lưu null; isActive mặc định true', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      prisma.promotion.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: PROMO_PERCENT_ID,
            ...data,
            createdAt: new Date('2026-03-10T10:00:00.000Z'),
          }),
      );

      const dto = (await pipe.transform(
        {
          code: '  he_2026-sale  ',
          type: PromotionType.PERCENT,
          value: 25,
        },
        { type: 'body', metatype: CreatePromotionDto },
      )) as CreatePromotionDto;

      expect(dto.code).toBe('HE_2026-SALE');

      const result = await controller.create(dto);

      expect(prisma.promotion.findUnique).toHaveBeenCalledWith({
        where: { code: 'HE_2026-SALE' },
        select: { id: true },
      });
      expect(prisma.promotion.create).toHaveBeenCalledWith({
        data: {
          code: 'HE_2026-SALE',
          type: PromotionType.PERCENT,
          value: 25,
          maxDiscount: null,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          maxDiscount: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(result).toMatchObject({
        code: 'HE_2026-SALE',
        type: PromotionType.PERCENT,
        value: 25,
        maxDiscount: null,
        isActive: true,
      });
    });

    it('(c) trùng code trả 409 "Mã giảm giá đã tồn tại" (kể cả gửi khác chữ hoa/thường hoặc hai request trùng cùng lúc dính lỗi unique P2002)', async () => {
      prisma.promotion.findUnique.mockResolvedValueOnce({
        id: PROMO_PERCENT_ID,
      });

      const dto = (await pipe.transform(
        {
          code: 'brew10',
          type: PromotionType.PERCENT,
          value: 10,
        },
        { type: 'body', metatype: CreatePromotionDto },
      )) as CreatePromotionDto;

      await expect(controller.create(dto)).rejects.toThrow(
        new ConflictException(PROMOTION_CODE_EXISTS_MESSAGE),
      );
      expect(prisma.promotion.create).not.toHaveBeenCalled();

      // Mô phỏng race condition: findUnique trả null nhưng create ném P2002
      prisma.promotion.findUnique.mockResolvedValueOnce(null);
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`code`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
        },
      );
      prisma.promotion.create.mockRejectedValueOnce(p2002Error);

      await expect(controller.create(dto)).rejects.toThrow(
        new ConflictException(PROMOTION_CODE_EXISTS_MESSAGE),
      );
    });

    it('(d) & (e) trả 400 (message mảng chuỗi tiếng Anh) khi PERCENT value=0 hoặc 101, FIXED value=999 hoặc 1000001, FIXED gửi kèm maxDiscount, hoặc code sai định dạng/độ dài', async () => {
      const invalidPayloads = [
        // code quá ngắn, quá dài, chứa ký tự đặc biệt/khoảng trắng ở giữa
        { code: 'AB', type: PromotionType.PERCENT, value: 10 },
        { code: 'A'.repeat(21), type: PromotionType.PERCENT, value: 10 },
        { code: 'BREW 10', type: PromotionType.PERCENT, value: 10 },
        { code: 'BREW@10', type: PromotionType.PERCENT, value: 10 },
        // (d) PERCENT value 0 và 101
        { code: 'PER0', type: PromotionType.PERCENT, value: 0 },
        { code: 'PER101', type: PromotionType.PERCENT, value: 101 },
        { code: 'PERFLOAT', type: PromotionType.PERCENT, value: 10.5 },
        // (d) FIXED value 999 và 1.000.001
        { code: 'FIX999', type: PromotionType.FIXED, value: 999 },
        { code: 'FIX1M1', type: PromotionType.FIXED, value: 1000001 },
        // (e) maxDiscount gửi kèm FIXED
        {
          code: 'FIXMAX',
          type: PromotionType.FIXED,
          value: 20000,
          maxDiscount: 20000,
        },
        // PERCENT maxDiscount ngoài 1.000..1.000.000
        {
          code: 'PERMAX999',
          type: PromotionType.PERCENT,
          value: 10,
          maxDiscount: 999,
        },
        {
          code: 'PERMAX1M1',
          type: PromotionType.PERCENT,
          value: 10,
          maxDiscount: 1000001,
        },
      ];

      for (const payload of invalidPayloads) {
        try {
          const transformed = (await pipe.transform(payload, {
            type: 'body',
            metatype: CreatePromotionDto,
          })) as CreatePromotionDto;
          await controller.create(transformed);
          fail(`Expected 400 for payload: ${JSON.stringify(payload)}`);
        } catch (err) {
          expect(err).toBeInstanceOf(BadRequestException);
          const response = (err as BadRequestException).getResponse() as {
            message: unknown;
          };
          expect(Array.isArray(response.message)).toBe(true);
        }
      }
    });
  });

  describe('update (PATCH /promotions/:id)', () => {
    it('(f) PATCH gửi kèm code hoặc body rỗng bị 400 với message là mảng chuỗi tiếng Anh', async () => {
      await expect(
        pipe.transform(
          { code: 'NEWCODE', value: 20 },
          { type: 'body', metatype: UpdatePromotionDto },
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await pipe.transform(
          { code: 'NEWCODE' },
          { type: 'body', metatype: UpdatePromotionDto },
        );
        fail('Expected pipe to reject code in UpdatePromotionDto');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = (err as BadRequestException).getResponse() as {
          message: unknown;
        };
        expect(Array.isArray(res.message)).toBe(true);
      }

      const emptyDto = (await pipe.transform(
        {},
        { type: 'body', metatype: UpdatePromotionDto },
      )) as UpdatePromotionDto;

      try {
        await controller.update(PROMO_PERCENT_ID, emptyDto);
        fail('Expected empty PATCH body to throw 400');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = (err as BadRequestException).getResponse() as {
          message: unknown;
        };
        expect(Array.isArray(res.message)).toBe(true);
      }
    });

    it('(g) PATCH bật/tắt isActive hoạt động; đổi từ PERCENT sang FIXED thì maxDiscount tự về null', async () => {
      // 1. Tắt isActive
      prisma.promotion.findUnique.mockResolvedValueOnce(mockPercentPromo);
      prisma.promotion.update.mockResolvedValueOnce({
        ...mockPercentPromo,
        isActive: false,
      });

      const toggleDto = (await pipe.transform(
        { isActive: false },
        { type: 'body', metatype: UpdatePromotionDto },
      )) as UpdatePromotionDto;

      const toggledRes = await controller.update(PROMO_PERCENT_ID, toggleDto);

      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: PROMO_PERCENT_ID },
        data: { isActive: false },
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          maxDiscount: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(toggledRes.isActive).toBe(false);

      // 2. Đổi từ PERCENT (đang có maxDiscount = 30000) sang FIXED kèm value = 25000 -> maxDiscount tự về null
      prisma.promotion.findUnique.mockResolvedValueOnce(mockPercentPromo);
      prisma.promotion.update.mockResolvedValueOnce({
        ...mockPercentPromo,
        type: PromotionType.FIXED,
        value: 25000,
        maxDiscount: null,
      });

      const toFixedDto = (await pipe.transform(
        { type: PromotionType.FIXED, value: 25000 },
        { type: 'body', metatype: UpdatePromotionDto },
      )) as UpdatePromotionDto;

      const fixedRes = await controller.update(PROMO_PERCENT_ID, toFixedDto);

      expect(prisma.promotion.update).toHaveBeenLastCalledWith({
        where: { id: PROMO_PERCENT_ID },
        data: {
          type: PromotionType.FIXED,
          value: 25000,
          maxDiscount: null,
        },
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          maxDiscount: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(fixedRes.type).toBe(PromotionType.FIXED);
      expect(fixedRes.maxDiscount).toBeNull();
    });

    it('kiểm tra value và maxDiscount theo loại SAU KHI sửa (ví dụ đổi PERCENT value=10 sang FIXED mà không đổi value, hoặc gửi maxDiscount cho mã đang là FIXED -> 400 mảng chuỗi tiếng Anh)', async () => {
      // Đổi PERCENT (value = 10) sang FIXED mà không gửi value mới hợp lệ -> 10 < 1000 -> 400
      prisma.promotion.findUnique.mockResolvedValueOnce(mockPercentPromo);
      try {
        await controller.update(PROMO_PERCENT_ID, {
          type: PromotionType.FIXED,
        });
        fail('Expected 400 when changing PERCENT(10) to FIXED without value');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = (err as BadRequestException).getResponse() as {
          message: unknown;
        };
        expect(Array.isArray(res.message)).toBe(true);
      }

      // Đổi FIXED (value = 20000) sang PERCENT mà không gửi value mới hợp lệ -> 20000 > 100 -> 400
      prisma.promotion.findUnique.mockResolvedValueOnce(mockFixedPromo);
      try {
        await controller.update(PROMO_FIXED_ID, {
          type: PromotionType.PERCENT,
        });
        fail(
          'Expected 400 when changing FIXED(20000) to PERCENT without value',
        );
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = (err as BadRequestException).getResponse() as {
          message: unknown;
        };
        expect(Array.isArray(res.message)).toBe(true);
      }

      // Mã đang là FIXED mà PATCH gửi maxDiscount -> 400
      prisma.promotion.findUnique.mockResolvedValueOnce(mockFixedPromo);
      try {
        await controller.update(PROMO_FIXED_ID, {
          maxDiscount: 15000,
        });
        fail('Expected 400 when setting maxDiscount on FIXED promotion');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = (err as BadRequestException).getResponse() as {
          message: unknown;
        };
        expect(Array.isArray(res.message)).toBe(true);
      }
    });

    it('(h) PATCH id không tồn tại hoặc không phải UUID trả 404 "Không tìm thấy mã giảm giá"', async () => {
      await expect(
        controller.update('not-a-uuid', { isActive: false }),
      ).rejects.toThrow(new NotFoundException(PROMOTION_NOT_FOUND_MESSAGE));
      expect(prisma.promotion.findUnique).not.toHaveBeenCalled();

      prisma.promotion.findUnique.mockResolvedValueOnce(null);
      await expect(
        controller.update('99999999-0000-4000-8000-000000009999', {
          isActive: false,
        }),
      ).rejects.toThrow(new NotFoundException(PROMOTION_NOT_FOUND_MESSAGE));
      expect(prisma.promotion.update).not.toHaveBeenCalled();
    });
  });

  describe('(a) Guards trên GET /promotions, POST /promotions, PATCH /promotions/:id', () => {
    let jwtService: { verifyAsync: jest.Mock };
    let jwtGuard: JwtAuthGuard;
    let rolesGuard: RolesGuard;

    const createContext = (
      methodName: 'findAll' | 'create' | 'update',
      authHeader?: string,
    ): ExecutionContext => {
      const req: Record<string, unknown> = {
        headers: authHeader ? { authorization: authHeader } : {},
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        PromotionsController.prototype,
        methodName,
      );
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => descriptor?.value as (...args: never[]) => unknown,
        getClass: () => PromotionsController,
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

    it('chưa đăng nhập -> 401; CUSTOMER và STAFF gọi cả 3 endpoint -> 403 "Bạn không có quyền thực hiện thao tác này"; ADMIN bị khóa -> 403; chỉ ADMIN đang hoạt động qua được', async () => {
      for (const method of ['findAll', 'create', 'update'] as const) {
        // 1. Chưa đăng nhập -> 401
        const unauthCtx = createContext(method, undefined);
        await expect(jwtGuard.canActivate(unauthCtx)).rejects.toThrow(
          new UnauthorizedException(
            'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
          ),
        );

        // 2. CUSTOMER -> 403
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '44444444-0000-0000-0000-000000000001',
          email: 'khach1@example.com',
          role: Role.CUSTOMER,
        });
        const customerCtx = createContext(method, 'Bearer customer-token');
        await jwtGuard.canActivate(customerCtx);
        await expect(rolesGuard.canActivate(customerCtx)).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 3. STAFF -> 403
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '55555555-0000-0000-0000-000000000001',
          email: 'nhanvien1@example.com',
          role: Role.STAFF,
        });
        const staffCtx = createContext(method, 'Bearer staff-token');
        await jwtGuard.canActivate(staffCtx);
        await expect(rolesGuard.canActivate(staffCtx)).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 4. ADMIN bị khóa (isActive = false) -> 403
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '66666666-0000-0000-0000-000000000001',
          email: 'quanly@example.com',
          role: Role.ADMIN,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: false });
        const lockedAdminCtx = createContext(
          method,
          'Bearer locked-admin-token',
        );
        await jwtGuard.canActivate(lockedAdminCtx);
        await expect(rolesGuard.canActivate(lockedAdminCtx)).rejects.toThrow(
          new ForbiddenException('Tài khoản đã bị khóa'),
        );

        // 5. ADMIN đang hoạt động -> qua được
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '66666666-0000-0000-0000-000000000001',
          email: 'quanly@example.com',
          role: Role.ADMIN,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: true });
        const activeAdminCtx = createContext(
          method,
          'Bearer active-admin-token',
        );
        expect(await jwtGuard.canActivate(activeAdminCtx)).toBe(true);
        expect(await rolesGuard.canActivate(activeAdminCtx)).toBe(true);
      }
    });
  });
});
