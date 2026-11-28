'use client';

import React from 'react';
import { PAYMENT_METHOD_LABELS, PaymentMethod } from '../../services/order-contract';
import {
  QR_BANK_OPTIONS,
  QR_WALLET_OPTIONS,
  QrBankProvider,
  QrProviderConfig,
  QrWalletProvider,
} from '../../constants/payment';

export interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  selectedWallet: QrWalletProvider;
  selectedBank: QrBankProvider;
  onMethodChange: (method: PaymentMethod) => void;
  onWalletChange: (wallet: QrWalletProvider) => void;
  onBankChange: (bank: QrBankProvider) => void;
  disabled?: boolean;
}

const METHOD_OPTIONS: Array<{
  method: PaymentMethod;
  label: string;
  description: string;
}> = [
  {
    method: 'WALLET',
    label: PAYMENT_METHOD_LABELS.WALLET,
    description: 'Quét mã QR bằng ứng dụng ZaloPay hoặc MoMo',
  },
  {
    method: 'CARD',
    label: PAYMENT_METHOD_LABELS.CARD,
    description: 'Quét mã VietQR qua ứng dụng ngân hàng',
  },
];

function ProviderBadge({ config }: { config: QrProviderConfig }) {
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold tracking-tight shadow-sm ${config.badgeBgClass}`}
      aria-hidden="true"
    >
      {config.badgeText}
    </span>
  );
}

/**
 * Bộ chọn 2 cách thanh toán theo mục 6.2 & bảng 9.3 hợp đồng:
 * - Ví điện tử (ZaloPay/Momo) -> gửi method = "WALLET"
 * - Chuyển khoản ngân hàng (danh sách ngân hàng cố định) -> gửi method = "CARD"
 * Tên ví/ngân hàng chỉ để hiển thị, không gửi lên server; không có ô nhập số/thẻ.
 */
export default function PaymentMethodSelector({
  selectedMethod,
  selectedWallet,
  selectedBank,
  onMethodChange,
  onWalletChange,
  onBankChange,
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        role="tablist"
        aria-label="Cách thức thanh toán"
      >
        {METHOD_OPTIONS.map((option) => {
          const isSelected = selectedMethod === option.method;
          return (
            <button
              key={option.method}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => onMethodChange(option.method)}
              className={`rounded-control border-2 p-3.5 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-kombu bg-tan/30 ring-2 ring-kombu/15'
                  : 'border-tan bg-cream hover:border-moss'
              }`}
            >
              <div className="text-sm font-bold text-noir">{option.label}</div>
              <div className="mt-0.5 text-xs text-noir/65">{option.description}</div>
            </button>
          );
        })}
      </div>

      {selectedMethod === 'WALLET' ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-noir/65">
            Chọn ví hiển thị mã QR
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QR_WALLET_OPTIONS.map((wallet) => {
              const isSelected = selectedWallet === wallet.id;
              return (
                <button
                  key={wallet.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onWalletChange(wallet.id)}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-3 rounded-control border p-3.5 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? wallet.cardActiveClass
                      : 'border-noir/15 bg-white hover:border-noir/30'
                  }`}
                >
                  <ProviderBadge config={wallet} />
                  <div>
                    <p className="text-sm font-bold text-noir">{wallet.name}</p>
                    <p className="text-xs text-noir/60">{wallet.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-noir/65">
            Chọn ngân hàng chuyển khoản
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QR_BANK_OPTIONS.map((bank) => {
              const isSelected = selectedBank === bank.id;
              return (
                <button
                  key={bank.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onBankChange(bank.id)}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-3 rounded-control border p-3.5 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? bank.cardActiveClass
                      : 'border-noir/15 bg-white hover:border-noir/30'
                  }`}
                >
                  <ProviderBadge config={bank} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-noir">{bank.name}</p>
                    <p className="text-xs text-noir/60 line-clamp-1">{bank.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
