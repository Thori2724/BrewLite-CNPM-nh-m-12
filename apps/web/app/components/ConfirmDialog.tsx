'use client';

import React, { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  message?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  processingLabel?: string;
  loading?: boolean;
  isProcessing?: boolean;
  variant?: 'danger' | 'primary' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ConfirmDialog({
  open,
  isOpen,
  title,
  message,
  description,
  children,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Quay lại',
  processingLabel = 'Đang xử lý...',
  loading,
  isProcessing,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const resolvedOpen = open ?? isOpen ?? false;
  const resolvedMessage = message ?? description;
  const resolvedLoading = loading ?? isProcessing ?? false;

  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isProcessingRef = useRef(resolvedLoading);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    isProcessingRef.current = resolvedLoading;
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!resolvedOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Đưa tiêu điểm vào nút an toàn ("Quay lại" / "Giữ đơn" / "Đóng") khi hộp thoại mở
    const focusTimer = window.setTimeout(() => {
      if (cancelButtonRef.current && !cancelButtonRef.current.disabled) {
        cancelButtonRef.current.focus();
      } else {
        dialogRef.current?.focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isProcessingRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);

        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        }
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
  }, [resolvedOpen]);

  if (!resolvedOpen) {
    return null;
  }

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !resolvedLoading) {
      onCancel();
    }
  };

  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-error hover:bg-error/90 text-bone'
      : 'bg-kombu hover:bg-noir text-bone';

  const hasDescription = Boolean(resolvedMessage || children);

  return (
    <div
      data-testid="confirm-dialog-backdrop"
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-noir/50 backdrop-blur-[1px] p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-md rounded-card border border-tan bg-cream p-6 shadow-raised outline-none space-y-4"
      >
        <div className="space-y-2">
          <h2 id={titleId} className="font-display text-lg sm:text-xl font-bold text-noir">
            {title}
          </h2>
          {hasDescription && (
            <div id={descriptionId} className="text-sm text-noir/80 space-y-2 leading-relaxed">
              {resolvedMessage &&
                (typeof resolvedMessage === 'string' || typeof resolvedMessage === 'number' ? (
                  <p>{resolvedMessage}</p>
                ) : (
                  <div>{resolvedMessage}</div>
                ))}
              {children}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={resolvedLoading}
            onClick={onCancel}
            className="min-h-10 px-4 py-2 rounded-control border border-tan bg-bone/60 hover:bg-tan/40 text-noir font-semibold text-sm transition disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={resolvedLoading}
            onClick={() => {
              if (!resolvedLoading) {
                onConfirm();
              }
            }}
            className={`min-h-10 px-4 py-2 rounded-control font-semibold text-sm transition shadow-soft disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer ${confirmBtnClass}`}
          >
            {resolvedLoading ? processingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

