import { PaymentStatus } from '@prisma/client';

export const SIMULATED_FAILURE_REASON = 'Giao dịch bị từ chối (mô phỏng)';

export interface SimulatedGatewayResult {
  status: PaymentStatus;
  accountLast4: string;
  failureReason: string | null;
}

export function simulatePaymentGateway(
  accountNumber: string,
): SimulatedGatewayResult {
  const accountLast4 = accountNumber.slice(-4);
  if (accountNumber.endsWith('0000')) {
    return {
      status: PaymentStatus.FAILED,
      accountLast4,
      failureReason: SIMULATED_FAILURE_REASON,
    };
  }

  return {
    status: PaymentStatus.SUCCESS,
    accountLast4,
    failureReason: null,
  };
}
