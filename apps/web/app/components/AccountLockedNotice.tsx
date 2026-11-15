'use client';

import { useEffect, useRef, useState } from 'react';
import { AUTH_ERROR_MESSAGES } from '../../services/auth-contract';
import { AUTH_ACCOUNT_LOCKED_EVENT } from '../../utils/auth';

/**
 * Thông báo nổi cố định ở góc trên bên phải khi API trả về 403 "Tài khoản đã bị khóa".
 */
export default function AccountLockedNotice() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleLocked = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const nextMessage =
        customEvent.detail?.message?.trim() || AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED;

      setMessage(nextMessage);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setMessage(null);
      }, 8000);
    };

    window.addEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLocked);
    return () => {
      window.removeEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLocked);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="alert"
      data-testid="account-locked-notice"
      className="fixed top-24 right-4 z-50 max-w-sm rounded-card border border-error/50 bg-cream px-4 py-3 text-sm font-semibold text-error shadow-raised flex items-start gap-2.5"
    >
      <span className="text-base leading-none shrink-0">⚠️</span>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label="Đóng thông báo"
        className="shrink-0 text-xs font-bold text-noir/60 hover:text-noir cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
}

