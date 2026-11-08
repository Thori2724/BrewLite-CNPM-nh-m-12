import {
  ConflictException,
  ExecutionContext,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
  JwtPayload,
} from './jwt-auth.guard';

const TEST_JWT_SECRET = 'test-jwt-secret-not-from-env';

describe('Auth (Service, DTOs, JwtAuthGuard)', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let guard: JwtAuthGuard;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService = new JwtService({
      secret: TEST_JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    });
    authService = new AuthService(
      mockPrisma as unknown as PrismaService,
      jwtService,
    );
    guard = new JwtAuthGuard(jwtService);
  });

  describe('AuthService.register', () => {
    it('registers successfully with CUSTOMER role, lowercase email, bcrypt hash, and without passwordHash in response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(
        ({
          data,
        }: {
          data: {
            email: string;
            passwordHash: string;
            displayName: string;
            role: Role;
          };
        }) =>
          Promise.resolve({
            id: '99999999-0000-0000-0000-000000000001',
            email: data.email,
            passwordHash: data.passwordHash,
            displayName: data.displayName,
            role: data.role,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
      );

      const dto = plainToInstance(RegisterDto, {
        email: '  NguyenAn@Gmail.com ',
        password: 'Password123@',
        displayName: ' Nguyễn Văn An ',
      });

      const result = await authService.register(dto);

      expect(result).toEqual({
        id: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        displayName: 'Nguyễn Văn An',
        role: Role.CUSTOMER,
      });
      expect(result).not.toHaveProperty('passwordHash');

      const createArg = (
        mockPrisma.user.create.mock.calls as Array<
          [
            {
              data: {
                email: string;
                passwordHash: string;
                displayName: string;
                role: Role;
              };
            },
          ]
        >
      )[0][0].data;
      expect(createArg.email).toBe('nguyenan@gmail.com');
      expect(createArg.role).toBe(Role.CUSTOMER);
      expect(createArg.passwordHash).not.toBe('Password123@');
      await expect(
        bcrypt.compare('Password123@', createArg.passwordHash),
      ).resolves.toBe(true);
    });

    it('throws 409 Conflict with exact message when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
      });

      const promise = authService.register({
        email: 'nguyenan@gmail.com',
        password: 'Password123@',
        displayName: 'Nguyễn Văn An',
      });

      await expect(promise).rejects.toThrow(ConflictException);
      await expect(promise).rejects.toThrow('Email này đã được sử dụng');
    });

    it('throws 409 Conflict when Prisma create throws unique constraint P2002', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.4.1' },
      );
      mockPrisma.user.create.mockRejectedValue(prismaError);

      const promise = authService.register({
        email: 'nguyenan@gmail.com',
        password: 'Password123@',
        displayName: 'Nguyễn Văn An',
      });

      await expect(promise).rejects.toThrow(ConflictException);
      await expect(promise).rejects.toThrow('Email này đã được sử dụng');
    });
  });

  describe('DTO Validation (RegisterDto & LoginDto)', () => {
    it('rejects missing fields, invalid email, 5-char password, and 51-char displayName', async () => {
      const emptyErrors = await validate(plainToInstance(RegisterDto, {}));
      expect(emptyErrors.length).toBeGreaterThanOrEqual(3);

      const invalidEmailErrors = await validate(
        plainToInstance(RegisterDto, {
          email: 'not-an-email',
          password: 'Password123@',
          displayName: 'Nguyễn Văn An',
        }),
      );
      expect(invalidEmailErrors.some((e) => e.property === 'email')).toBe(true);

      const shortPasswordErrors = await validate(
        plainToInstance(RegisterDto, {
          email: 'nguyenan@gmail.com',
          password: '12345',
          displayName: 'Nguyễn Văn An',
        }),
      );
      expect(shortPasswordErrors.some((e) => e.property === 'password')).toBe(
        true,
      );

      const longNameErrors = await validate(
        plainToInstance(RegisterDto, {
          email: 'nguyenan@gmail.com',
          password: 'Password123@',
          displayName: 'A'.repeat(51),
        }),
      );
      expect(longNameErrors.some((e) => e.property === 'displayName')).toBe(
        true,
      );
    });

    it('returns 400 Bad Request with English message array (not 500) when email or password is a number', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      });

      let registerError: unknown;
      try {
        await pipe.transform(
          { email: 12345, password: 67890, displayName: 'An' },
          { type: 'body', metatype: RegisterDto },
        );
      } catch (err) {
        registerError = err;
      }

      expect(registerError).toBeDefined();
      const regRes = (
        registerError as {
          getStatus: () => number;
          getResponse: () => { statusCode: number; message: string[] };
        }
      ).getResponse();
      expect(regRes.statusCode).toBe(400);
      expect(Array.isArray(regRes.message)).toBe(true);

      let loginError: unknown;
      try {
        await pipe.transform(
          { email: 12345, password: 67890 },
          { type: 'body', metatype: LoginDto },
        );
      } catch (err) {
        loginError = err;
      }

      expect(loginError).toBeDefined();
      const loginRes = (
        loginError as {
          getStatus: () => number;
          getResponse: () => { statusCode: number; message: string[] };
        }
      ).getResponse();
      expect(loginRes.statusCode).toBe(400);
      expect(Array.isArray(loginRes.message)).toBe(true);
    });
  });

  describe('AuthService.login', () => {
    it('logs in with valid credentials (including uppercase email) and returns 24h JWT', async () => {
      const passwordHash = await bcrypt.hash('Password123@', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        passwordHash,
        displayName: 'Nguyễn Văn An',
        role: Role.CUSTOMER,
      });

      const dto = plainToInstance(LoginDto, {
        email: 'NGUYENAN@GMAIL.COM',
        password: 'Password123@',
      });

      const result = await authService.login(dto);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'nguyenan@gmail.com' },
      });
      expect(result.user).toEqual({
        id: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        displayName: 'Nguyễn Văn An',
        role: Role.CUSTOMER,
      });
      expect(typeof result.accessToken).toBe('string');

      const decoded = await jwtService.verifyAsync<JwtPayload>(
        result.accessToken,
      );
      expect(decoded.sub).toBe('99999999-0000-0000-0000-000000000001');
      expect(decoded.email).toBe('nguyenan@gmail.com');
      expect(decoded.role).toBe(Role.CUSTOMER);
      expect((decoded.exp ?? 0) - (decoded.iat ?? 0)).toBe(86400);
    });

    it('returns the exact same 401 message for non-existent email and wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      let notFoundErr: unknown;
      try {
        await authService.login({
          email: 'nobody@gmail.com',
          password: 'Password123@',
        });
      } catch (err) {
        notFoundErr = err;
      }

      const passwordHash = await bcrypt.hash('Password123@', 10);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        passwordHash,
        displayName: 'Nguyễn Văn An',
        role: Role.CUSTOMER,
      });

      let wrongPassErr: unknown;
      try {
        await authService.login({
          email: 'nguyenan@gmail.com',
          password: 'WrongPassword',
        });
      } catch (err) {
        wrongPassErr = err;
      }

      expect(notFoundErr).toBeInstanceOf(UnauthorizedException);
      expect(wrongPassErr).toBeInstanceOf(UnauthorizedException);
      expect((notFoundErr as UnauthorizedException).message).toBe(
        'Email hoặc mật khẩu không chính xác',
      );
      expect((wrongPassErr as UnauthorizedException).message).toBe(
        (notFoundErr as UnauthorizedException).message,
      );
    });
  });

  describe('JwtAuthGuard', () => {
    const createContext = (authHeader?: string) => {
      const request: Partial<AuthenticatedRequest> = {
        headers: authHeader !== undefined ? { authorization: authHeader } : {},
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext;
      return { context, request };
    };

    it('throws 401 for missing header, invalid format, wrong signature, or expired token', async () => {
      const { context: noHeaderCtx } = createContext();
      await expect(guard.canActivate(noHeaderCtx)).rejects.toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );

      const { context: badFormatCtx } = createContext('Token abc.def.ghi');
      await expect(guard.canActivate(badFormatCtx)).rejects.toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );

      const otherJwt = new JwtService({ secret: 'wrong-secret' });
      const wrongSigToken = await otherJwt.signAsync({
        sub: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        role: Role.CUSTOMER,
      });
      const { context: wrongSigCtx } = createContext(`Bearer ${wrongSigToken}`);
      await expect(guard.canActivate(wrongSigCtx)).rejects.toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );

      const expiredToken = await jwtService.signAsync(
        {
          sub: '99999999-0000-0000-0000-000000000001',
          email: 'nguyenan@gmail.com',
          role: Role.CUSTOMER,
        },
        { expiresIn: -10 },
      );
      const { context: expiredCtx } = createContext(`Bearer ${expiredToken}`);
      await expect(guard.canActivate(expiredCtx)).rejects.toThrow(
        new UnauthorizedException(
          'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
        ),
      );
    });

    it('allows valid token and attaches { id, email, role } to request.user', async () => {
      const validToken = await jwtService.signAsync({
        sub: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        role: Role.CUSTOMER,
      });

      const { context, request } = createContext(`Bearer ${validToken}`);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({
        id: '99999999-0000-0000-0000-000000000001',
        email: 'nguyenan@gmail.com',
        role: Role.CUSTOMER,
      });
    });
  });
});
