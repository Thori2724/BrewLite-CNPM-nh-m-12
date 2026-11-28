import {
  LoyaltyMeResponse,
  LoyaltyTransaction,
  LoyaltyType,
} from '../services/loyalty';
import { isMockLoyaltyActive } from './mock-config';

export { isMockLoyaltyActive };

export const MOCK_WELCOME_LOYALTY_TRANSACTION: LoyaltyTransaction = {
  id: '99999999-0000-0000-0000-000000000001',
  type: 'EARN',
  points: 50,
  orderNumber: null,
  createdAt: '2026-11-01T08:00:00.000Z',
};

let mockLoyaltyPoints = 50;
let mockLoyaltyTransactions: LoyaltyTransaction[] = [
  { ...MOCK_WELCOME_LOYALTY_TRANSACTION },
];

function generateMockLoyaltyTxId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `99999999-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;
}

export function resetMockLoyaltyDatabase(): void {
  mockLoyaltyPoints = 50;
  mockLoyaltyTransactions = [{ ...MOCK_WELCOME_LOYALTY_TRANSACTION }];
}

export function getMockLoyaltyPoints(): number {
  return mockLoyaltyPoints;
}

export function recordMockLoyaltyTransaction(params: {
  type: LoyaltyType;
  points: number;
  orderNumber: number | null;
}): number {
  mockLoyaltyPoints = Math.max(0, mockLoyaltyPoints + params.points);
  mockLoyaltyTransactions = [
    {
      id: generateMockLoyaltyTxId(),
      type: params.type,
      points: params.points,
      orderNumber: params.orderNumber,
      createdAt: new Date().toISOString(),
    },
    ...mockLoyaltyTransactions,
  ].slice(0, 50);
  return mockLoyaltyPoints;
}

export async function mockGetMyLoyalty(): Promise<LoyaltyMeResponse> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  return {
    loyaltyPoints: mockLoyaltyPoints,
    transactions: mockLoyaltyTransactions.slice(0, 50).map((tx) => ({ ...tx })),
  };
}
