import { Injectable } from '@nestjs/common';
import { LoyaltyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const LOYALTY_HISTORY_LIMIT = 50;

export interface LoyaltyTransactionItem {
  id: string;
  type: LoyaltyType;
  points: number;
  orderNumber: number | null;
  createdAt: Date;
}

export interface LoyaltyMeResponse {
  loyaltyPoints: number;
  transactions: LoyaltyTransactionItem[];
}

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyLoyalty(userId: string): Promise<LoyaltyMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        loyaltyPoints: true,
        loyaltyTransactions: {
          where: { userId },
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

    if (!user) {
      return {
        loyaltyPoints: 0,
        transactions: [],
      };
    }

    return {
      loyaltyPoints: user.loyaltyPoints,
      transactions: user.loyaltyTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        points: tx.points,
        orderNumber:
          tx.order && tx.order.userId === userId ? tx.order.orderNumber : null,
        createdAt: tx.createdAt,
      })),
    };
  }
}
