'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ProductManage } from '../../../services/api';
import {
  PRODUCT_STOCK_MAX,
  PRODUCT_STOCK_MIN,
  validateProductStock,
} from '../services/staff-products';

export interface StaffProductStockModalProps {
  isOpen: boolean;
  mode: 'enable' | 'edit';
  product: ProductManage | null;
  onClose: () => void;
  onSubmit: (stock: number) => Promise<{ fieldError?: string } | void>;
}

export default function StaffProductStockModal(props: StaffProductStockModalProps) {
  if (!props.isOpen || !props.product) {
    return null;
  }

  return (
    <StaffProductStockModalInner
      key={`${props.mode}-${props.product.id}`}
      {...props}
      product={props.product}
    />
  );
}

interface StaffProductStockModalInnerProps extends StaffProductStockModalProps {
  product: ProductManage;
}

function StaffProductStockModalInner({
  mode,
  product,
  onClose,
  onSubmit,
}: StaffProductStockModalInnerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const submitInFlightRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);

  const isEditMode = mode === 'edit';

  const [stockInput, setStockInput] = useState<string>(() =>
    isEditMode ? String(product.stock) : ''
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
      if (isEditMode) {
        inputRef.current?.select();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      const prevEl = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prevEl && document.contains(prevEl)) {
        prevEl.focus();
      }
    };
  }, [isEditMode]);

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitInFlightRef.current || isSubmitting) return;

    const validation = validateProductStock(stockInput);
    if (!validation.isValid) {
      setFieldError(validation.error ?? 'Số lượng phải là số nguyên từ 1 đến 9999.');
      return;
    }

    const numericStock = Number(stockInput.trim());
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setFieldError(null);

    try {
      const result = await onSubmit(numericStock);
      if (!isMountedRef.current) return;
      if (result?.fieldError) {
        setFieldError(result.fieldError);
      }
    } finally {
      submitInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      data-testid="product-stock-backdrop"
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-noir/50 backdrop-blur-[1px] p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="product-stock-dialog"
        className="w-full max-w-md rounded-card border border-tan bg-cream p-6 shadow-raised outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-tan/70 pb-4">
          <div>
            <h2 id={titleId} className="font-display text-lg sm:text-xl font-bold text-noir">
              {isEditMode
                ? `Sửa số lượng "${product.name}"`
                : `Mở bán lại "${product.name}"`}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs text-noir/70 leading-relaxed">
              {isEditMode
                ? `Nhập số lượng còn lại mới (từ ${PRODUCT_STOCK_MIN} đến ${PRODUCT_STOCK_MAX}). Số mới sẽ đặt lại tồn kho hiện tại, không cộng dồn.`
                : `Nhập số lượng còn lại (từ ${PRODUCT_STOCK_MIN} đến ${PRODUCT_STOCK_MAX}) để chuyển món sang trạng thái Đang bán.`}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Đóng hộp nhập số lượng"
            className="rounded-control px-2 py-1 text-sm font-bold text-noir/70 hover:bg-tan/40 hover:text-noir transition disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form noValidate onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="product-stock-input"
              className="block text-sm font-semibold text-noir"
            >
              Số lượng còn lại <span className="text-error">*</span>
            </label>
            <input
              ref={inputRef}
              id="product-stock-input"
              name="stock"
              type="text"
              inputMode="numeric"
              value={stockInput}
              disabled={isSubmitting}
              placeholder="Ví dụ: 50"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'product-stock-error' : 'product-stock-hint'}
              onChange={(e) => {
                setStockInput(e.target.value);
                if (fieldError) {
                  setFieldError(null);
                }
              }}
              className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                fieldError ? 'border-error' : 'border-tan'
              }`}
            />
            {fieldError ? (
              <p
                id="product-stock-error"
                data-testid="product-stock-error"
                role="alert"
                className="text-xs font-medium text-error"
              >
                {fieldError}
              </p>
            ) : (
              <p id="product-stock-hint" className="text-xs text-noir/60">
                Chỉ nhập số nguyên từ {PRODUCT_STOCK_MIN} đến {PRODUCT_STOCK_MAX}.
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 border-t border-tan/70 pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="min-h-10 px-4 py-2 rounded-control border border-tan bg-bone/70 hover:bg-tan/45 text-noir text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-10 px-5 py-2 rounded-control bg-kombu hover:bg-noir text-bone text-sm font-semibold transition shadow-soft disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting
                ? 'Đang lưu...'
                : isEditMode
                  ? 'Lưu số lượng'
                  : 'Xác nhận mở bán'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
