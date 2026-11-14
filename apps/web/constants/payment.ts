export type QrWalletProvider = 'ZALOPAY' | 'MOMO';

export const DEFAULT_QR_WALLET: QrWalletProvider = 'ZALOPAY';

/**
 * Luôn gửi WALLET cho thanh toán QR theo hợp đồng API mục 6.2.
 */
export const QR_PAYMENT_METHOD = 'WALLET' as const;

/**
 * Hai số tài khoản mô phỏng cố định dùng nội bộ để gọi POST /payments,
 * không hiển thị trên giao diện người dùng.
 */
export const QR_PAYMENT_SUCCESS_ACCOUNT = '0900000001';
export const QR_PAYMENT_FAILURE_ACCOUNT = '0900000000';

export const QR_PAYMENT_COUNTDOWN_SECONDS = 5;

export interface QrWalletConfig {
  id: QrWalletProvider;
  name: 'ZaloPay' | 'MoMo';
  displayLabel: string;
  subtitle: string;
  badgeText: string;
  accentHex: string;
  badgeBgClass: string;
  accentTextClass: string;
  cardActiveClass: string;
  qrBorderClass: string;
  headerBgClass: string;
  pillClass: string;
}

export const QR_WALLET_CONFIGS: Record<QrWalletProvider, QrWalletConfig> = {
  ZALOPAY: {
    id: 'ZALOPAY',
    name: 'ZaloPay',
    displayLabel: 'Ví điện tử (ZaloPay)',
    subtitle: 'Thanh toán nhanh qua ứng dụng ZaloPay',
    badgeText: 'ZP',
    accentHex: '#0068FF',
    badgeBgClass: 'bg-[#0068FF] text-white',
    accentTextClass: 'text-[#0068FF]',
    cardActiveClass: 'border-[#0068FF] bg-[#0068FF]/5 ring-2 ring-[#0068FF]/20',
    qrBorderClass: 'border-[#0068FF]/30 bg-[#0068FF]/[0.03]',
    headerBgClass: 'bg-[#0068FF]/10 border-[#0068FF]/25',
    pillClass: 'bg-[#0068FF]/12 text-[#0052CC] border-[#0068FF]/25',
  },
  MOMO: {
    id: 'MOMO',
    name: 'MoMo',
    displayLabel: 'Ví điện tử (MoMo)',
    subtitle: 'Quét mã bằng ứng dụng ví MoMo',
    badgeText: 'M',
    accentHex: '#A50064',
    badgeBgClass: 'bg-[#A50064] text-white',
    accentTextClass: 'text-[#A50064]',
    cardActiveClass: 'border-[#A50064] bg-[#A50064]/5 ring-2 ring-[#A50064]/20',
    qrBorderClass: 'border-[#A50064]/30 bg-[#A50064]/[0.03]',
    headerBgClass: 'bg-[#A50064]/10 border-[#A50064]/25',
    pillClass: 'bg-[#A50064]/12 text-[#8C0055] border-[#A50064]/25',
  },
};

export const QR_WALLET_OPTIONS: QrWalletConfig[] = [
  QR_WALLET_CONFIGS.ZALOPAY,
  QR_WALLET_CONFIGS.MOMO,
];

/**
 * Tạo chuỗi nội dung mã QR mô phỏng từ mã đơn hàng.
 * Chỉ dùng để hiển thị mã QR trên client, không gửi lên server.
 */
export function buildQrPayload(params: {
  orderId: string;
  orderNumber: number;
  wallet: QrWalletProvider;
}): string {
  return `BREWLITE:${params.wallet}:ORDER:${params.orderNumber}:${params.orderId}`;
}

