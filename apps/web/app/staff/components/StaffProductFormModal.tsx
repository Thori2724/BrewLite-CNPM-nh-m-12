'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ProductCategory, ProductManage } from '../../../services/api';
import {
  buildCreateProductPayload,
  buildUpdateProductPayload,
  createStaffProduct,
  formatStaffProductVnd,
  isValidPreviewImageUrl,
  ParsedStaffProductError,
  parseStaffProductFormError,
  ProductFormFieldErrors,
  STAFF_PRODUCT_CATEGORY_OPTIONS,
  STAFF_PRODUCT_FALLBACK_IMAGE,
  updateStaffProduct,
  validateProductBasePrice,
  validateProductForm,
} from '../services/staff-products';

export interface StaffProductFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialProduct?: ProductManage | null;
  usingMockFallback: boolean;
  onClose: () => void;
  onSaved: (savedProduct: ProductManage, mode: 'create' | 'edit') => void;
  onAuthFailure: (parsedError: ParsedStaffProductError) => boolean;
}

export default function StaffProductFormModal(props: StaffProductFormModalProps) {
  if (!props.isOpen) {
    return null;
  }

  const formKey =
    props.mode === 'edit' && props.initialProduct
      ? `edit-${props.initialProduct.id}`
      : 'create';

  return <StaffProductFormModalInner key={formKey} {...props} />;
}

function StaffProductFormModalInner({
  mode,
  initialProduct,
  usingMockFallback,
  onClose,
  onSaved,
  onAuthFailure,
}: StaffProductFormModalProps) {
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const submitInFlightRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);

  const isEditMode = mode === 'edit' && Boolean(initialProduct);

  const [name, setName] = useState<string>(() =>
    isEditMode && initialProduct ? initialProduct.name : ''
  );
  const [category, setCategory] = useState<ProductCategory | ''>(() =>
    isEditMode && initialProduct ? initialProduct.category : ''
  );
  const [basePrice, setBasePrice] = useState<string>(() =>
    isEditMode && initialProduct ? String(initialProduct.basePrice) : ''
  );
  const [imageUrl, setImageUrl] = useState<string>(() =>
    isEditMode && initialProduct ? (initialProduct.imageUrl ?? '') : ''
  );
  const [stock, setStock] = useState<string>('');

  const [fieldErrors, setFieldErrors] = useState<ProductFormFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [previewLoadFailed, setPreviewLoadFailed] = useState<boolean>(false);

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
      nameInputRef.current?.focus();
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
  }, []);

  const clearFieldError = (field: keyof ProductFormFieldErrors) => {
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
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitInFlightRef.current || isSubmitting) return;

    const validation = validateProductForm(
      isEditMode
        ? { name, category, basePrice, imageUrl }
        : { name, category, basePrice, imageUrl, stock },
      { mode: isEditMode ? 'edit' : 'create' }
    );
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setServerError(null);
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setServerError(null);

    try {
      let saved: ProductManage;
      if (isEditMode && initialProduct) {
        const payload = buildUpdateProductPayload(
          { name, category, basePrice, imageUrl },
          initialProduct
        );
        saved = await updateStaffProduct(initialProduct.id, payload, usingMockFallback);
      } else {
        const payload = buildCreateProductPayload({ name, category, basePrice, imageUrl, stock });
        saved = await createStaffProduct(payload, usingMockFallback);
      }

      if (!isMountedRef.current) return;
      onSaved(saved, isEditMode ? 'edit' : 'create');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffProductFormError(err);

      if (onAuthFailure(parsed)) {
        return;
      }

      if (Object.keys(parsed.fieldErrors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
      }
      setServerError(parsed.message);
    } finally {
      submitInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const trimmedImageUrl = imageUrl.trim();
  const hasPreviewableUrl = isValidPreviewImageUrl(trimmedImageUrl);
  const previewSrc =
    hasPreviewableUrl && !previewLoadFailed ? trimmedImageUrl : STAFF_PRODUCT_FALLBACK_IMAGE;

  const priceValidation = validateProductBasePrice(basePrice);
  const formattedPriceHint =
    basePrice.trim() && priceValidation.isValid
      ? formatStaffProductVnd(Number(basePrice.trim()))
      : null;

  return (
    <div
      data-testid="product-form-backdrop"
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-noir/50 backdrop-blur-[1px] p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="product-form-dialog"
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-card border border-tan bg-cream p-6 shadow-raised outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-tan/70 pb-4">
          <div>
            <h2 id={titleId} className="font-display text-xl font-bold text-noir">
              {isEditMode ? 'Sửa thông tin món' : 'Thêm món mới'}
            </h2>
            <p className="mt-1 text-xs text-noir/65">
              {isEditMode
                ? 'Cập nhật tên, danh mục, giá gốc hoặc link ảnh của món.'
                : 'Nhập thông tin món mới để đưa vào thực đơn.'}
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
              data-testid="product-form-server-error"
              className="rounded-control border border-error/45 bg-error/10 px-4 py-3 text-sm font-medium text-error"
            >
              {serverError}
            </div>
          )}

          {/* Tên món */}
          <div className="space-y-1.5">
            <label
              htmlFor="product-form-name"
              className="block text-sm font-semibold text-noir"
            >
              Tên món <span className="text-error">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="product-form-name"
              name="name"
              type="text"
              value={name}
              disabled={isSubmitting}
              placeholder="Ví dụ: Trà đào cam sả"
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'product-form-name-error' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError('name');
              }}
              className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                fieldErrors.name ? 'border-error' : 'border-tan'
              }`}
            />
            {fieldErrors.name && (
              <p
                id="product-form-name-error"
                data-testid="product-form-error-name"
                role="alert"
                className="text-xs font-medium text-error"
              >
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Danh mục & Giá gốc */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="product-form-category"
                className="block text-sm font-semibold text-noir"
              >
                Danh mục <span className="text-error">*</span>
              </label>
              <select
                id="product-form-category"
                name="category"
                value={category}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.category)}
                aria-describedby={
                  fieldErrors.category ? 'product-form-category-error' : undefined
                }
                onChange={(e) => {
                  setCategory(e.target.value as ProductCategory | '');
                  clearFieldError('category');
                }}
                className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                  fieldErrors.category ? 'border-error' : 'border-tan'
                }`}
              >
                <option value="">-- Chọn danh mục --</option>
                {STAFF_PRODUCT_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {fieldErrors.category && (
                <p
                  id="product-form-category-error"
                  data-testid="product-form-error-category"
                  role="alert"
                  className="text-xs font-medium text-error"
                >
                  {fieldErrors.category}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="product-form-basePrice"
                className="block text-sm font-semibold text-noir"
              >
                Giá gốc (VND) <span className="text-error">*</span>
              </label>
              <input
                id="product-form-basePrice"
                name="basePrice"
                type="text"
                inputMode="numeric"
                value={basePrice}
                disabled={isSubmitting}
                placeholder="Ví dụ: 29000"
                aria-invalid={Boolean(fieldErrors.basePrice)}
                aria-describedby={
                  fieldErrors.basePrice ? 'product-form-basePrice-error' : undefined
                }
                onChange={(e) => {
                  setBasePrice(e.target.value);
                  clearFieldError('basePrice');
                }}
                className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                  fieldErrors.basePrice ? 'border-error' : 'border-tan'
                }`}
              />
              {fieldErrors.basePrice ? (
                <p
                  id="product-form-basePrice-error"
                  data-testid="product-form-error-basePrice"
                  role="alert"
                  className="text-xs font-medium text-error"
                >
                  {fieldErrors.basePrice}
                </p>
              ) : (
                <p className="text-xs text-noir/60">
                  Số nguyên từ 1.000 đến 1.000.000đ
                  {formattedPriceHint ? ` (${formattedPriceHint})` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Số lượng (chỉ hiện ở form Thêm món) */}
          {!isEditMode && (
            <div className="space-y-1.5">
              <label
                htmlFor="product-form-stock"
                className="block text-sm font-semibold text-noir"
              >
                Số lượng
              </label>
              <input
                id="product-form-stock"
                name="stock"
                type="text"
                inputMode="numeric"
                value={stock}
                disabled={isSubmitting}
                placeholder="Mặc định 50"
                aria-invalid={Boolean(fieldErrors.stock)}
                aria-describedby={
                  fieldErrors.stock
                    ? 'product-form-stock-error product-form-stock-hint'
                    : 'product-form-stock-hint'
                }
                onChange={(e) => {
                  setStock(e.target.value);
                  clearFieldError('stock');
                }}
                className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                  fieldErrors.stock ? 'border-error' : 'border-tan'
                }`}
              />
              {fieldErrors.stock && (
                <p
                  id="product-form-stock-error"
                  data-testid="product-form-error-stock"
                  role="alert"
                  className="text-xs font-medium text-error"
                >
                  {fieldErrors.stock}
                </p>
              )}
              <p id="product-form-stock-hint" className="text-xs text-noir/60">
                Bỏ trống = 50. Nhập 0 nếu món tạm hết.
              </p>
            </div>
          )}

          {/* Link ảnh & Ô xem trước */}
          <div className="space-y-2">
            <label
              htmlFor="product-form-imageUrl"
              className="block text-sm font-semibold text-noir"
            >
              Link ảnh
            </label>
            <input
              id="product-form-imageUrl"
              name="imageUrl"
              type="text"
              value={imageUrl}
              disabled={isSubmitting}
              placeholder="https://example.com/images/mon.jpg"
              aria-invalid={Boolean(fieldErrors.imageUrl)}
              aria-describedby={
                fieldErrors.imageUrl ? 'product-form-imageUrl-error' : undefined
              }
              onChange={(e) => {
                setImageUrl(e.target.value);
                setPreviewLoadFailed(false);
                clearFieldError('imageUrl');
              }}
              className={`w-full rounded-control border bg-bone/50 px-3.5 py-2.5 text-sm text-noir placeholder:text-noir/45 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60 ${
                fieldErrors.imageUrl ? 'border-error' : 'border-tan'
              }`}
            />
            {fieldErrors.imageUrl && (
              <p
                id="product-form-imageUrl-error"
                data-testid="product-form-error-imageUrl"
                role="alert"
                className="text-xs font-medium text-error"
              >
                {fieldErrors.imageUrl}
              </p>
            )}

            <div className="flex items-center gap-3.5 rounded-control border border-tan/75 bg-bone/40 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Link ảnh xem trước do quản lý nhập từ nguồn ngoài bất kỳ */}
              <img
                data-testid="product-form-image-preview"
                src={previewSrc}
                alt={trimmedImageUrl ? 'Xem trước ảnh món' : 'Ảnh mặc định của món'}
                onError={() => {
                  if (hasPreviewableUrl) {
                    setPreviewLoadFailed(true);
                  }
                }}
                className="h-16 w-16 shrink-0 rounded-control border border-tan/80 bg-bone object-cover"
              />
              <div className="min-w-0 space-y-0.5 text-xs">
                <p className="font-semibold text-noir/85">
                  {!trimmedImageUrl
                    ? 'Ảnh xem trước mặc định'
                    : !hasPreviewableUrl
                      ? 'Link ảnh chưa hợp lệ — đang hiện ảnh mặc định'
                      : previewLoadFailed
                        ? 'Không tải được ảnh từ link này — đang hiện ảnh mặc định'
                        : 'Xem trước ảnh từ link đã nhập'}
                </p>
                <p className="text-noir/65">Để trống sẽ dùng ảnh mặc định</p>
              </div>
            </div>
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
                  : 'Thêm món'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

