import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const STAFF_NOT_FOUND_MESSAGE = 'Không tìm thấy nhân viên';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAFF_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const staffList = await this.prisma.user.findMany({
      where: { role: Role.STAFF },
      orderBy: { displayName: 'asc' },
      select: STAFF_SELECT,
    });

    return staffList.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    }));
  }

  async updateStatus(id: string, isActive: boolean) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException(STAFF_NOT_FOUND_MESSAGE);
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!existing || existing.role !== Role.STAFF) {
      throw new NotFoundException(STAFF_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: STAFF_SELECT,
    });

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }
}
