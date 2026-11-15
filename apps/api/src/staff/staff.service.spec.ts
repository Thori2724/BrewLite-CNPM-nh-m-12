import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsController } from '../products/products.controller';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { StaffController } from './staff.controller';
import { STAFF_NOT_FOUND_MESSAGE, StaffService } from './staff.service';

describe('StaffModule (StaffService, StaffController, DTO, Guards)', () => {
  let service: StaffService;
  let controller: StaffController;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const mockCreatedAt1 = new Date('2026-11-10T08:00:00.000Z');
  const mockCreatedAt2 = new Date('2026-11-10T09:00:00.000Z');
  const mockCreatedAt3 = new Date('2026-11-10T10:00:00.000Z');

  const staff1 = {
    id: '55555555-0000-0000-0000-000000000001',
    email: 'nhanvien1@example.com',
    displayName: 'Nhân viên 1',
    role: Role.STAFF,
    isActive: true,
    createdAt: mockCreatedAt1,
  };

  const staff2 = {
    id: '55555555-0000-0000-0000-000000000002',
    email: 'nhanvien2@example.com',
    displayName: 'Nhân viên 2',
    role: Role.STAFF,
    isActive: true,
    createdAt: mockCreatedAt2,
  };

  const staff3 = {
    id: '55555555-0000-0000-0000-000000000003',
    email: 'nhanvien3@example.com',
    displayName: 'Nhân viên 3',
    role: Role.STAFF,
    isActive: false,
    createdAt: mockCreatedAt3,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        StaffService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn(), signAsync: jest.fn() },
        },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
    controller = module.get<StaffController>(StaffController);
  });

  describe('GET /staff (findAll)', () => {
    it('chỉ lấy tài khoản có role = STAFF (không gồm ADMIN và CUSTOMER), sắp xếp theo displayName asc và tuyệt đối không lộ passwordHash', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          ...staff1,
          passwordHash: '$2b$10$secretHash1',
          updatedAt: new Date(),
        },
        {
          ...staff2,
          passwordHash: '$2b$10$secretHash2',
          updatedAt: new Date(),
        },
        {
          ...staff3,
          passwordHash: '$2b$10$secretHash3',
          updatedAt: new Date(),
        },
      ]);

      const result = await controller.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.STAFF },
        orderBy: { displayName: 'asc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      expect(result).toHaveLength(3);
      expect(result.map((u) => u.displayName)).toEqual([
        'Nhân viên 1',
        'Nhân viên 2',
        'Nhân viên 3',
      ]);
      for (const item of result) {
        expect(item.role).toBe(Role.STAFF);
        expect(item).not.toHaveProperty('passwordHash');
        expect(item).not.toHaveProperty('updatedAt');
        expect(Object.keys(item).sort()).toEqual(
          [
            'id',
            'email',
            'displayName',
            'role',
            'isActive',
            'createdAt',
          ].sort(),
        );
      }
    });
  });

  describe('PATCH /staff/:id/status (updateStatus)', () => {
    it('khóa STAFF (isActive = false) và mở khóa STAFF (isActive = true) thành công, không lộ passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: staff1.id,
        role: Role.STAFF,
      });
      prisma.user.update.mockResolvedValueOnce({
        ...staff1,
        isActive: false,
        passwordHash: '$2b$10$secretHash1',
      });

      const lockedResult = await controller.updateStatus(staff1.id, {
        isActive: false,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: staff1.id },
        data: { isActive: false },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(lockedResult).toEqual({
        ...staff1,
        isActive: false,
      });
      expect(lockedResult).not.toHaveProperty('passwordHash');

      prisma.user.update.mockResolvedValueOnce({
        ...staff1,
        isActive: true,
      });

      const unlockedResult = await controller.updateStatus(staff1.id, {
        isActive: true,
      });

      expect(unlockedResult).toEqual({
        ...staff1,
        isActive: true,
      });
    });

    it('PATCH lên tài khoản ADMIN trả 404 "Không tìm thấy nhân viên"', async () => {
      const adminId = '66666666-0000-0000-0000-000000000001';
      prisma.user.findUnique.mockResolvedValue({
        id: adminId,
        role: Role.ADMIN,
      });

      await expect(
        controller.updateStatus(adminId, { isActive: false }),
      ).rejects.toThrow(new NotFoundException(STAFF_NOT_FOUND_MESSAGE));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('PATCH lên tài khoản khách (CUSTOMER) trả 404 "Không tìm thấy nhân viên"', async () => {
      const customerId = '44444444-0000-0000-0000-000000000001';
      prisma.user.findUnique.mockResolvedValue({
        id: customerId,
        role: Role.CUSTOMER,
      });

      await expect(
        controller.updateStatus(customerId, { isActive: false }),
      ).rejects.toThrow(new NotFoundException(STAFF_NOT_FOUND_MESSAGE));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('PATCH lên id không tồn tại hoặc chuỗi lạ không phải UUID (ví dụ "abc") đều trả 404 "Không tìm thấy nhân viên"', async () => {
      await expect(
        controller.updateStatus('abc', { isActive: false }),
      ).rejects.toThrow(new NotFoundException(STAFF_NOT_FOUND_MESSAGE));
      expect(prisma.user.findUnique).not.toHaveBeenCalled();

      const unknownUuid = '55555555-0000-0000-0000-000000009999';
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        controller.updateStatus(unknownUuid, { isActive: false }),
      ).rejects.toThrow(new NotFoundException(STAFF_NOT_FOUND_MESSAGE));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('body thiếu hoặc isActive không phải boolean thì trả 400 với message là mảng chuỗi tiếng Anh', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      });

      for (const invalidBody of [
        {},
        { isActive: 'false' },
        { isActive: 1 },
        { isActive: null },
      ]) {
        let caughtError: unknown;
        try {
          await pipe.transform(invalidBody, {
            type: 'body',
            metatype: UpdateStaffStatusDto,
          });
        } catch (err) {
          caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(BadRequestException);
        const response = (caughtError as BadRequestException).getResponse() as {
          statusCode: number;
          message: string[];
        };
        expect(response.statusCode).toBe(400);
        expect(Array.isArray(response.message)).toBe(true);
        expect(response.message[0]).toContain('isActive must be a boolean');
      }
    });
  });

  describe('Hiệu lực ngay sau khi khóa STAFF và phân quyền Guard (401 / 403 / ADMIN)', () => {
    let jwtService: { verifyAsync: jest.Mock; signAsync: jest.Mock };
    let jwtGuard: JwtAuthGuard;
    let rolesGuard: RolesGuard;
    let authService: AuthService;

    beforeEach(() => {
      jwtService = {
        verifyAsync: jest.fn(),
        signAsync: jest.fn(),
      };
      jwtGuard = new JwtAuthGuard(jwtService as unknown as JwtService);
      rolesGuard = new RolesGuard(
        jwtService as unknown as JwtService,
        new Reflector(),
        prisma as unknown as PrismaService,
      );
      authService = new AuthService(
        prisma as unknown as PrismaService,
        jwtService as unknown as JwtService,
      );
    });

    const createStaffControllerContext = (
      methodName: 'findAll' | 'updateStatus',
      authHeader?: string,
    ): ExecutionContext => {
      const req: { headers: { authorization?: string }; user?: unknown } = {
        headers: authHeader ? { authorization: authHeader } : {},
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        StaffController.prototype,
        methodName,
      );
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => descriptor?.value as (...args: never[]) => unknown,
        getClass: () => StaffController,
      } as unknown as ExecutionContext;
    };

    it('sau khi khóa STAFF (isActive = false): STAFF gọi API nhân viên bị RolesGuard chặn 403 "Tài khoản đã bị khóa" ngay và đăng nhập bị 403', async () => {
      const usersDb = new Map<
        string,
        {
          id: string;
          email: string;
          displayName: string;
          role: Role;
          isActive: boolean;
          passwordHash: string;
          createdAt: Date;
        }
      >();
      const passwordHash = await bcrypt.hash('Secret123!', 4);
      usersDb.set(staff1.id, {
        ...staff1,
        isActive: true,
        passwordHash,
      });

      prisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) {
            return Promise.resolve(usersDb.get(where.id) ?? null);
          }
          if (where.email) {
            for (const u of usersDb.values()) {
              if (u.email === where.email) return Promise.resolve(u);
            }
          }
          return Promise.resolve(null);
        },
      );

      prisma.user.update.mockImplementation(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { isActive: boolean };
        }) => {
          const current = usersDb.get(where.id)!;
          const updated = { ...current, isActive: data.isActive };
          usersDb.set(where.id, updated);
          return Promise.resolve(updated);
        },
      );

      // ADMIN khóa staff1
      const locked = await service.updateStatus(staff1.id, false);
      expect(locked.isActive).toBe(false);

      // 1. STAFF đang có token cũ gọi API nhân viên (ví dụ GET /products/manage) bị 403 ngay
      jwtService.verifyAsync.mockResolvedValue({
        sub: staff1.id,
        email: staff1.email,
        role: Role.STAFF,
      });
      const req: { headers: { authorization: string }; user?: unknown } = {
        headers: { authorization: 'Bearer valid-staff-token' },
      };
      const manageDescriptor = Object.getOwnPropertyDescriptor(
        ProductsController.prototype,
        'findAllForManage',
      );
      const staffEndpointCtx = {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () =>
          manageDescriptor?.value as (...args: never[]) => unknown,
        getClass: () => ProductsController,
      } as unknown as ExecutionContext;

      await jwtGuard.canActivate(staffEndpointCtx);
      await expect(rolesGuard.canActivate(staffEndpointCtx)).rejects.toThrow(
        new ForbiddenException('Tài khoản đã bị khóa'),
      );

      // 2. STAFF đăng nhập lại bị 403 "Tài khoản đã bị khóa"
      await expect(
        authService.login({
          email: staff1.email,
          password: 'Secret123!',
        }),
      ).rejects.toThrow(new ForbiddenException('Tài khoản đã bị khóa'));
    });

    it('phân quyền GET /staff và PATCH /staff/:id/status: chưa đăng nhập 401; STAFF 403; khách 403; ADMIN bị khóa 403; ADMIN hoạt động qua được', async () => {
      for (const method of ['findAll', 'updateStatus'] as const) {
        // 1. Chưa đăng nhập -> 401
        const unauthCtx = createStaffControllerContext(method, undefined);
        await expect(jwtGuard.canActivate(unauthCtx)).rejects.toThrow(
          new UnauthorizedException(
            'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
          ),
        );

        // 2. STAFF -> 403
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: staff1.id,
          email: staff1.email,
          role: Role.STAFF,
        });
        const staffCtx = createStaffControllerContext(
          method,
          'Bearer staff-token',
        );
        await jwtGuard.canActivate(staffCtx);
        await expect(rolesGuard.canActivate(staffCtx)).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 3. Khách (CUSTOMER) -> 403
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '44444444-0000-0000-0000-000000000001',
          email: 'khach@example.com',
          role: Role.CUSTOMER,
        });
        const customerCtx = createStaffControllerContext(
          method,
          'Bearer customer-token',
        );
        await jwtGuard.canActivate(customerCtx);
        await expect(rolesGuard.canActivate(customerCtx)).rejects.toThrow(
          new ForbiddenException('Bạn không có quyền thực hiện thao tác này'),
        );

        // 4. ADMIN bị khóa -> 403 "Tài khoản đã bị khóa"
        jwtService.verifyAsync.mockResolvedValueOnce({
          sub: '66666666-0000-0000-0000-000000000001',
          email: 'quanly@example.com',
          role: Role.ADMIN,
        });
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: false });
        const lockedAdminCtx = createStaffControllerContext(
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
        const activeAdminCtx = createStaffControllerContext(
          method,
          'Bearer active-admin-token',
        );
        expect(await jwtGuard.canActivate(activeAdminCtx)).toBe(true);
        expect(await rolesGuard.canActivate(activeAdminCtx)).toBe(true);
      }
    });
  });
});
