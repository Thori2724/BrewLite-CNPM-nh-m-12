import { PaymentMethod } from '../services/order-contract';

export type QrWalletProvider = 'ZALOPAY' | 'MOMO';
export type QrBankProvider = 'VCB' | 'MB' | 'TCB' | 'BIDV' | 'CTG' | 'ACB';

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'WALLET';
export const DEFAULT_QR_WALLET: QrWalletProvider = 'ZALOPAY';
export const DEFAULT_QR_BANK: QrBankProvider = 'VCB';

/**
 * Giá trị mặc định cho thanh toán QR (hỗ trợ cả WALLET và CARD theo hợp đồng mục 6.2).
 */
export const QR_PAYMENT_METHOD = DEFAULT_PAYMENT_METHOD;

/**
 * Hai số tài khoản mô phỏng cố định dùng nội bộ để gọi POST /payments
 * cho cả Ví điện tử (WALLET) và Chuyển khoản ngân hàng (CARD),
 * tuyệt đối không hiển thị trên giao diện người dùng.
 */
export const QR_PAYMENT_SUCCESS_ACCOUNT = '0900000001';
export const QR_PAYMENT_FAILURE_ACCOUNT = '0900000000';

export const QR_PAYMENT_COUNTDOWN_SECONDS = 5;

export interface QrProviderConfig<TId extends string = string> {
  id: TId;
  name: string;
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

export type QrWalletConfig = QrProviderConfig<QrWalletProvider>;
export type QrBankConfig = QrProviderConfig<QrBankProvider>;

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

export const QR_BANK_CONFIGS: Record<QrBankProvider, QrBankConfig> = {
  VCB: {
    id: 'VCB',
    name: 'Vietcombank',
    displayLabel: 'Chuyển khoản ngân hàng (Vietcombank)',
    subtitle: 'Quét mã VietQR trên ứng dụng VCB Digibank',
    badgeText: 'VCB',
    accentHex: '#007B40',
    badgeBgClass: 'bg-[#007B40] text-white',
    accentTextClass: 'text-[#007B40]',
    cardActiveClass: 'border-[#007B40] bg-[#007B40]/5 ring-2 ring-[#007B40]/20',
    qrBorderClass: 'border-[#007B40]/30 bg-[#007B40]/[0.03]',
    headerBgClass: 'bg-[#007B40]/10 border-[#007B40]/25',
    pillClass: 'bg-[#007B40]/12 text-[#005F31] border-[#007B40]/25',
  },
  MB: {
    id: 'MB',
    name: 'MB Bank',
    displayLabel: 'Chuyển khoản ngân hàng (MB Bank)',
    subtitle: 'Quét mã VietQR trên ứng dụng MBBank',
    badgeText: 'MB',
    accentHex: '#141ED2',
    badgeBgClass: 'bg-[#141ED2] text-white',
    accentTextClass: 'text-[#141ED2]',
    cardActiveClass: 'border-[#141ED2] bg-[#141ED2]/5 ring-2 ring-[#141ED2]/20',
    qrBorderClass: 'border-[#141ED2]/30 bg-[#141ED2]/[0.03]',
    headerBgClass: 'bg-[#141ED2]/10 border-[#141ED2]/25',
    pillClass: 'bg-[#141ED2]/12 text-[#1018A8] border-[#141ED2]/25',
  },
  TCB: {
    id: 'TCB',
    name: 'Techcombank',
    displayLabel: 'Chuyển khoản ngân hàng (Techcombank)',
    subtitle: 'Quét mã VietQR trên ứng dụng Techcombank Mobile',
    badgeText: 'TCB',
    accentHex: '#D71920',
    badgeBgClass: 'bg-[#D71920] text-white',
    accentTextClass: 'text-[#D71920]',
    cardActiveClass: 'border-[#D71920] bg-[#D71920]/5 ring-2 ring-[#D71920]/20',
    qrBorderClass: 'border-[#D71920]/30 bg-[#D71920]/[0.03]',
    headerBgClass: 'bg-[#D71920]/10 border-[#D71920]/25',
    pillClass: 'bg-[#D71920]/12 text-[#A81218] border-[#D71920]/25',
  },
  BIDV: {
    id: 'BIDV',
    name: 'BIDV',
    displayLabel: 'Chuyển khoản ngân hàng (BIDV)',
    subtitle: 'Quét mã VietQR trên ứng dụng BIDV SmartBanking',
    badgeText: 'BIDV',
    accentHex: '#006B68',
    badgeBgClass: 'bg-[#006B68] text-white',
    accentTextClass: 'text-[#006B68]',
    cardActiveClass: 'border-[#006B68] bg-[#006B68]/5 ring-2 ring-[#006B68]/20',
    qrBorderClass: 'border-[#006B68]/30 bg-[#006B68]/[0.03]',
    headerBgClass: 'bg-[#006B68]/10 border-[#006B68]/25',
    pillClass: 'bg-[#006B68]/12 text-[#00514E] border-[#006B68]/25',
  },
  CTG: {
    id: 'CTG',
    name: 'VietinBank',
    displayLabel: 'Chuyển khoản ngân hàng (VietinBank)',
    subtitle: 'Quét mã VietQR trên ứng dụng VietinBank iPay',
    badgeText: 'CTG',
    accentHex: '#00599D',
    badgeBgClass: 'bg-[#00599D] text-white',
    accentTextClass: 'text-[#00599D]',
    cardActiveClass: 'border-[#00599D] bg-[#00599D]/5 ring-2 ring-[#00599D]/20',
    qrBorderClass: 'border-[#00599D]/30 bg-[#00599D]/[0.03]',
    headerBgClass: 'bg-[#00599D]/10 border-[#00599D]/25',
    pillClass: 'bg-[#00599D]/12 text-[#00457A] border-[#00599D]/25',
  },
  ACB: {
    id: 'ACB',
    name: 'ACB',
    displayLabel: 'Chuyển khoản ngân hàng (ACB)',
    subtitle: 'Quét mã VietQR trên ứng dụng ACB ONE',
    badgeText: 'ACB',
    accentHex: '#005AA9',
    badgeBgClass: 'bg-[#005AA9] text-white',
    accentTextClass: 'text-[#005AA9]',
    cardActiveClass: 'border-[#005AA9] bg-[#005AA9]/5 ring-2 ring-[#005AA9]/20',
    qrBorderClass: 'border-[#005AA9]/30 bg-[#005AA9]/[0.03]',
    headerBgClass: 'bg-[#005AA9]/10 border-[#005AA9]/25',
    pillClass: 'bg-[#005AA9]/12 text-[#004482] border-[#005AA9]/25',
  },
};

export const QR_BANK_OPTIONS: QrBankConfig[] = [
  QR_BANK_CONFIGS.VCB,
  QR_BANK_CONFIGS.MB,
  QR_BANK_CONFIGS.TCB,
  QR_BANK_CONFIGS.BIDV,
  QR_BANK_CONFIGS.CTG,
  QR_BANK_CONFIGS.ACB,
];

export function getQrProviderConfig(
  method: PaymentMethod,
  wallet: QrWalletProvider,
  bank: QrBankProvider
): QrProviderConfig {
  return method === 'CARD'
    ? QR_BANK_CONFIGS[bank] || QR_BANK_CONFIGS[DEFAULT_QR_BANK]
    : QR_WALLET_CONFIGS[wallet] || QR_WALLET_CONFIGS[DEFAULT_QR_WALLET];
}

/**
 * Sinh chuỗi ngẫu nhiên UUID v4 để mỗi lần mở màn QR có một mã QR khác nhau.
 */
export function generateQrRandomToken(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Tạo nội dung mã QR theo đúng hợp đồng mục 6.2:
 * `BREWLITE|<orderNumber>|<totalAmount>|<chuỗi ngẫu nhiên>`
 * Chỉ dùng để hiển thị mã QR trên client, không gửi lên server.
 */
export function buildQrPayload(params: {
  orderNumber: number;
  totalAmount: number;
  randomToken?: string;
}): string {
  const token = (params.randomToken ?? '').trim() || generateQrRandomToken();
  return `BREWLITE|${params.orderNumber}|${params.totalAmount}|${token}`;
}
