import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
  JwtPayload,
} from './jwt-auth.guard';
import { ROLES_KEY } from './roles.decorator';

const UNAUTHORIZED_MESSAGE = 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn';
const FORBIDDEN_ROLE_MESSAGE = 'Bạn không có quyền thực hiện thao tác này';
const ACCOUNT_LOCKED_MESSAGE = 'Tài khoản đã bị khóa';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.authenticateRequest(request);

    const configuredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles =
      configuredRoles && configuredRoles.length > 0
        ? configuredRoles
        : [Role.STAFF, Role.ADMIN];

    const hasRole =
      requiredRoles.includes(user.role) ||
      (user.role === Role.ADMIN && requiredRoles.includes(Role.STAFF));

    if (!hasRole) {
      throw new ForbiddenException(FORBIDDEN_ROLE_MESSAGE);
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new ForbiddenException(ACCOUNT_LOCKED_MESSAGE);
    }

    return true;
  }

  private async authenticateRequest(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedUser> {
    if (
      request.user &&
      request.user.id &&
      request.user.email &&
      request.user.role
    ) {
      return request.user;
    }

    const authHeader = request.headers?.authorization;
    if (typeof authHeader !== 'string') {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    const token = parts[1];

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload || !payload.sub || !payload.email || !payload.role) {
        throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
      }

      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      request.user = authenticatedUser;
      return authenticatedUser;
    } catch {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }
  }
}
