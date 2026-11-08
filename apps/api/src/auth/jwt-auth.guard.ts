import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const UNAUTHORIZED_MESSAGE = 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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

      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      return true;
    } catch {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }
  }
}
