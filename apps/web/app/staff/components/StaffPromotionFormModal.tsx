'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Promotion, PromotionType, UpdatePromotionDto } from '../../../services/promotions';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  buildCreatePromotionPayload,
  buildUpdatePromotionPayload,
  createStaffPromotion,
  formatStaffPromotionVnd,
  getStaffPromotionStatusLabel,
  ParsedStaffPromotionError,
  parseStaffPromotionFormError,
  PROMOTION_CODE_MAX_LENGTH,
  PROMOTION_CODE_MIN_LENGTH,
  PromotionFormFieldErrors,
  STAFF_PROMOTION_ERROR_MESSAGES,
  STAFF_PROMOTION_TYPE_OPTIONS,
  updateStaffPromotion,
  validatePromotionMaxDiscount,
  validatePromotionValue,
  validatePromotionForm,
} from '../services/staff-promotions';

export interface StaffPromotionFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialPromotion?: Promotion | null;
  usingMockFallback: boolean;
  onClose: () => void;
  onSaved: (savedPromotion: Promotion, mode: 'create' | 'edit') => void;
  onAuthFailure: (parsedError: ParsedStaffPromotionError) => boolean;
}

export default function StaffPromotionFormModal(props: StaffPromotionFormModalProps) {
  if (!props.isOpen) {
    return null;
  }

  const formKey =
    props.mode === 'edit' && props.initialPromotion
      ? `edit-${props.initialPromotion.id}`
      : 'create';

  return <StaffPromotionFormModalInner key={formKey} {...props} />;
}

function StaffPromotionFormModalInner({
  mode,
  initialPromotion,
  usingMockFallback,
  onClose,
  onSaved,
  onAuthFailure,
}: StaffPromotionFormModalProps) {
  const titleId = useId();
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const typeSelectRef = useRef<HTMLSelectElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const submitInFlightRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const isConfirmOpenRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);

  const isEditMode = mode === 'edit' && Boolean(initialPromotion);

  const [code, setCode] = useState<string>(() =>
    isEditMode && initialPromotion ? initialPromotion.code : ''
  );
  const [type, setType] = useState<PromotionType>(() =>
    isEditMode && initialPromotion ? initialPromotion.type : 'PERCENT'
  );
  const [value, setValue] = useState<string>(() =>
    isEditMode && initialPromotion ? String(initialPromotion.value) : ''
  );
  const [maxDiscount, setMaxDiscount] = useState<string>(() =>
    isEditMode &&
    initialPromotion &&
    initialPromotion.type === 'PERCENT' &&
    initialPromotion.maxDiscount !== null
      ? String(initialPromotion.maxDiscount)
      : ''
  );
  const [isActive, setIsActive] = useState<boolean>(() =>
    isEditMode && initialPromotion ? initialPromotion.isActive : true
  );

  const [fieldErrors, setFieldErrors] = useState<PromotionFormFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [pendingDisablePayload, setPendingDisablePayload] = useState<UpdatePromotionDto | null>(
    null
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
    isConfirmOpenRef.current = Boolean(pendingDisablePayload);
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      if (isEditMode) {
        typeSelectRef.current?.focus();
      } else {
        codeInputRef.current?.focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !isSubmittingRef.current &&
        !isConfirmOpenRef.current
      ) {
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

  const clearFieldError = (field: keyof PromotionFormFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (serverError) {
      setServerError(null);
    }
  };

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      !isSubmitting &&
      !pendingDisablePayload
    ) {
      onClose();
    }
  };

  const handleTypeChange = (nextType: PromotionType) => {
    setType(nextType);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.type;
      delete next.value;
      delete next.maxDiscount;
      return next;
    });
    if (serverError) {
      setServerError(null);
    }
  };

  const handleSaveError = (err: unknown) => {
    const parsed = parseStaffPromotionFormError(err);

    if (onAuthFailure(parsed)) {
      return;
    }

    if (Object.keys(parsed.fieldErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
    }

    if (parsed.statusCode === 409 && parsed.fieldErrors.code) {
      setServerError(null);
    } else {
      setServerError(parsed.message);
    }
  };

  const executeCreate = async () => {
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setServerError(null);

    try {
      const payload = buildCreatePromotionPayload({
        code,
        type,
        value,
        maxDiscount,
        isActive,
      });
      const saved = await createStaffPromotion(payload, usingMockFallback);
      if (!isMountedRef.current) return;
      onSaved(saved, 'create');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      handleSaveError(err);
    } finally {
      submitInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const executeUpdate = async (promotionId: string, payload: UpdatePromotionDto) => {
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setServerError(null);

    try {
      const saved = await updateStaffPromotion(promotionId, payload, usingMockFallback);
      if (!isMountedRef.current) return;
      setPendingDisablePayload(null);
      onSaved(saved, 'edit');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setPendingDisablePayload(null);
      handleSaveError(err);
    } finally {
      submitInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitInFlightRef.current || isSubmitting || pendingDisablePayload) return;

    const formValues = { code, type, value, maxDiscount, isActive };
    const validation = validatePromotionForm(formValues, {
      mode: isEditMode ? 'edit' : 'create',
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setServerError(null);
      return;
    }

    if (isEditMode && initialPromotion) {
      const payload = buildUpdatePromotionPayload(formValues, initialPromotion);
      if (Object.keys(payload).length === 0) {
        setFieldErrors({});
        setServerError(STAFF_PROMOTION_ERROR_MESSAGES.NO_CHANGES);
        return;
      }

      if (initialPromotion.isActive && payload.isActive === false) {
        setFieldErrors({});
        setServerError(null);
        setPendingDisablePayload(payload);
        return;
      }

      await executeUpdate(initialPromotion.id, payload);
      return;
    }

    await executeCreate();
  };

  const valueCheck = validatePromotionValue(value, type);
  const formattedFixedValueHint =
    type === 'FIXED' && value.trim() && valueCheck.isValid
      ? formatStaffPromotionVnd(Number(value.trim()))
      : null;

  const maxDiscountCheck = validatePromotionMaxDiscount(maxDiscount, type);
  const formattedMaxDiscountHint =
    type === 'PERCENT' && maxDiscount.trim() && maxDiscountCheck.isValid
      ? formatStaffPromotionVnd(Number(maxDiscount.trim()))
      : null;

  return (
    <>
      <div
        data-testid="promotion-form-backdrop"
        onMouseDown={handleBackdropMouseDown}
        className="fixed inset-0 z-50 flex items-center justify-center bg-noir/50 backdrop-blur-[1px] p-4"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="promotion-form-dialog"
          className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-card border border-tan bg-cream p-6 shadow-raised outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-tan/70 pb-4">
            <div>
              <h2 id={titleId} className="font-display text-xl font-bold text-noir">
                {isEditMode ? 'Sửa mã giảm giá' : 'Thêm mã giảm giá'}
              </h2>
              <p className="mt-1 text-xs text-noir/65">
                {isEditMode
                  ? 'Cập nhật loại giảm, giá trị, trần giảm hoặc trạng thái áp dụng.'
                  : 'Tạo mã giảm giá công khai mới để khách hàng áp dụng khi đặt đơn.'}
              </p>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              aria-label="Đóng biểu mẫu"
              className="rounded-control px-2 py-1 text-sm font-bold text-noir/70 hover:bg-tan/40 hover:text-noir transition disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            {serverError && (
              <div
                role="alert"
                data-testid="promotion-form-server-error"
                className="rounded-control border border-error/45 bg-error/10 px-4 py-3 text-sm font-medium text-error"
              >
                {serverError}
              </div>
            )}

            {/* Mã giảm giá */}
            <div className="space-y-1.5">
              <label
                htmlFor="promotion-form-code"
                className="block text-sm font-semibold text-noir"
              >
                Mã giảm giá {!isEditMode && <span className="text-error">*</span>}
              </label>
              <input
                ref={codeInputRef}
                id="promotion-form-code"
                name="code"
                type="text"
                value={code}
                disabled={isEditMode || isSubmitting}
                placeholder="Ví dụ: BREW15"
                aria-invalid={Boolean(fieldErrors.code)}
                aria-describedby={
                  fieldErrors.code ? 'promotion-form-code-error' : 'promotion-form-code-hint'
                }
                onChange={(e) => {
                  if (isEditMode) return;
                  setCode(e.target.value.toUpperCase());
                  clearFieldError('code');
                }}
                className={`w-full rounded-control border px-3.5 py-2.5 font-mono text-sm uppercase tracking-wide text-noir placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:bg-bone/80 disabled:text-noir/70 disabled:cursor-not-allowed ${
                  fieldErrors.code ? 'border-error bg-bone/50' : 'border-tan bg-bone/50'
                }`}
              />
              {fieldErrors.code ? (
                <p
                  id="promotion-form-code-error"
                  data-testid="promotion-form-error-code"
                  role="alert"
                  className="text-xs font-medium text-error"
                >
                  {fieldErrors.code}
                </p>
              ) : (
                <p id="promotion-form-code-hint" className="text-xs text-noir/60">
                  {isEditMode
                    ? 'Không thể thay đổi mã sau khi đã tạo.'
                    : `${PROMOTION_CODE_MIN_LENGTH} đến ${PROMOTION_CODE_MAX_LENGTH} ký tự, chỉ gồm chữ A-Z, số, '_' và '-' (tự đổi sang chữ hoa).`}
                </p>
              )}
            </div>

            {/* Loại mã & Giá trị */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="promotion-form-type"
                  className="block text-sm font-semibold text-noir"
                >
                  Loại mã <span className="text-error">*</span>
                </label>
                <select
                  ref={typeSelectRef}
                  id="promotion-form-type"
                  name="type"
                  value={type}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.type)}
                  aria-describedby={
                    fieldErrors.type ? 'promotion-form-type-error' : undefined
                  }
                  onChange={(e) => handleTypeChange(e.target.value as PromotionType)}
                  className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                    fieldErrors.type ? 'border-error' : 'border-tan'
                  }`}
                >
                  {STAFF_PROMOTION_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.type && (
                  <p
                    id="promotion-form-type-error"
                    data-testid="promotion-form-error-type"
                    role="alert"
                    className="text-xs font-medium text-error"
                  >
                    {fieldErrors.type}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="promotion-form-value"
                  className="block text-sm font-semibold text-noir"
                >
                  {type === 'PERCENT' ? 'Giá trị (%)' : 'Giá trị (VND)'}{' '}
                  <span className="text-error">*</span>
                </label>
                <input
                  id="promotion-form-value"
                  name="value"
                  type="text"
                  inputMode="numeric"
                  value={value}
                  disabled={isSubmitting}
                  placeholder={type === 'PERCENT' ? 'Ví dụ: 10' : 'Ví dụ: 20000'}
                  aria-invalid={Boolean(fieldErrors.value)}
                  aria-describedby={
                    fieldErrors.value ? 'promotion-form-value-error' : 'promotion-form-value-hint'
                  }
                  onChange={(e) => {
                    setValue(e.target.value);
                    clearFieldError('value');
                  }}
                  className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                    fieldErrors.value ? 'border-error' : 'border-tan'
                  }`}
                />
                {fieldErrors.value ? (
                  <p
                    id="promotion-form-value-error"
                    data-testid="promotion-form-error-value"
                    role="alert"
                    className="text-xs font-medium text-error"
                  >
                    {fieldErrors.value}
                  </p>
                ) : (
                  <p id="promotion-form-value-hint" className="text-xs text-noir/60">
                    {type === 'PERCENT'
                      ? 'Số nguyên từ 1 đến 100 (%).'
                      : `Số nguyên từ 1.000 đến 1.000.000đ${
                          formattedFixedValueHint ? ` (${formattedFixedValueHint})` : ''
                        }`}
                  </p>
                )}
              </div>
            </div>

            {/* Trần giảm: chỉ hiện khi loại là PERCENT */}
            {type === 'PERCENT' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="promotion-form-maxDiscount"
                  className="block text-sm font-semibold text-noir"
                >
                  Trần giảm (VND)
                </label>
                <input
                  id="promotion-form-maxDiscount"
                  name="maxDiscount"
                  type="text"
                  inputMode="numeric"
                  value={maxDiscount}
                  disabled={isSubmitting}
                  placeholder="Để trống nếu không có trần"
                  aria-invalid={Boolean(fieldErrors.maxDiscount)}
                  aria-describedby={
                    fieldErrors.maxDiscount
                      ? 'promotion-form-maxDiscount-error'
                      : 'promotion-form-maxDiscount-hint'
                  }
                  onChange={(e) => {
                    setMaxDiscount(e.target.value);
                    clearFieldError('maxDiscount');
                  }}
                  className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                    fieldErrors.maxDiscount ? 'border-error' : 'border-tan'
                  }`}
                />
                {fieldErrors.maxDiscount ? (
                  <p
                    id="promotion-form-maxDiscount-error"
                    data-testid="promotion-form-error-maxDiscount"
                    role="alert"
                    className="text-xs font-medium text-error"
                  >
                    {fieldErrors.maxDiscount}
                  </p>
                ) : (
                  <p id="promotion-form-maxDiscount-hint" className="text-xs text-noir/60">
                    Số nguyên từ 1.000 đến 1.000.000đ. Để trống nghĩa là không có trần
                    {formattedMaxDiscountHint ? ` (${formattedMaxDiscountHint})` : ''}.
                  </p>
                )}
              </div>
            )}

            {/* Công tắc bật/tắt trạng thái */}
            <div className="flex items-center justify-between gap-4 rounded-control border border-tan/75 bg-bone/40 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-noir">Trạng thái áp dụng</p>
                <p className="text-xs text-noir/65">
                  {getStaffPromotionStatusLabel(isActive)}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                aria-label="Trạng thái áp dụng"
                data-testid="promotion-form-isActive-switch"
                disabled={isSubmitting}
                onClick={() => {
                  setIsActive((prev) => !prev);
                  if (serverError) {
                    setServerError(null);
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  isActive ? 'bg-kombu border-kombu' : 'bg-tan/60 border-tan'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-4 w-4 rounded-full bg-bone shadow-xs transition-transform ${
                    isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Nút hành động */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 border-t border-tan/70 pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="min-h-10 px-4 py-2 rounded-control border border-tan bg-bone/70 hover:bg-tan/45 text-noir text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-10 px-5 py-2 rounded-control bg-kombu hover:bg-noir text-bone text-sm font-semibold transition shadow-soft disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting
                  ? 'Đang lưu...'
                  : isEditMode
                    ? 'Lưu thay đổi'
                    : 'Thêm mã'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Hộp xác nhận nếu lưu làm mã chuyển từ Đang bật sang Đã tắt */}
      <ConfirmDialog
        isOpen={Boolean(pendingDisablePayload)}
        title={initialPromotion ? `Tắt mã giảm giá "${initialPromotion.code}"?` : ''}
        description="Khách hàng sẽ không thể áp dụng mã này cho đơn hàng mới sau khi tắt. Các đơn cũ đã đặt không bị ảnh hưởng. Bạn có thể bật lại sau."
        cancelLabel="Đóng"
        confirmLabel="Xác nhận tắt"
        processingLabel="Đang lưu..."
        variant="danger"
        isProcessing={isSubmitting}
        onCancel={() => {
          if (!isSubmitting) {
            setPendingDisablePayload(null);
          }
        }}
        onConfirm={() => {
          if (initialPromotion && pendingDisablePayload) {
            void executeUpdate(initialPromotion.id, pendingDisablePayload);
          }
        }}
      />
    </>
  );
}
