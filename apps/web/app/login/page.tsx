'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  getSafeRedirectUrl,
  validateEmail,
  validateLoginPassword,
} from '../../utils/auth';
import { classifyApiError } from '../../utils/validation';
import { AUTH_ERROR_MESSAGES } from '../../services/auth-contract';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isHydrated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const redirectParam = searchParams.get('redirect');
  const targetRedirect = getSafeRedirectUrl(redirectParam, '/');
  const isExpired = searchParams.get('expired') === 'true';
  const isRegistered = searchParams.get('registered') === 'true';

  // Nếu người dùng đã đăng nhập từ trước, tự động chuyển về trang đích hoặc Menu
  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace(targetRedirect);
    }
  }, [isHydrated, isAuthenticated, targetRedirect, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    // 1. Validate phía client: email hợp lệ và mật khẩu bắt buộc nhập (không áp tối thiểu 6 ký tự ở login)
    const emailValidation = validateEmail(email);
    const passwordValidation = validateLoginPassword(password);

    const newErrors: { email?: string; password?: string; general?: string } = {};

    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.error;
    }
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      // Đăng nhập thành công -> chuyển về trang định vào trước đó
      router.push(targetRedirect);
    } catch (err) {
      // Thông báo lỗi chung 401 hoặc lỗi validate, không tiết lộ cụ thể sai email hay sai mật khẩu
      const classified = classifyApiError(err, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
      setErrors({
        general: classified.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tránh nhấp nháy form nếu đã đăng nhập và đang chuyển hướng
  if (!isHydrated || (isHydrated && isAuthenticated)) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full mb-2"></div>
        <p>Đang kiểm tra trạng thái đăng nhập...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto my-6 sm:my-10 bg-cream p-6 sm:p-8 rounded-card border border-tan/60 shadow-soft space-y-6">
      {/* Tiêu đề */}
      <div className="text-center space-y-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-noir">Đăng nhập tài khoản</h1>
        <p className="text-sm text-noir/65">Chào mừng bạn quay lại với BrewLite ☕</p>
      </div>

      {/* Thông báo phiên hết hạn */}
      {isExpired && !errors.general && (
        <div
          role="alert"
          className="p-3 bg-tan/25 border border-tan/80 rounded-control text-noir text-sm flex items-start gap-2"
        >
          <span className="text-base leading-none">⚠️</span>
          <span>{AUTH_ERROR_MESSAGES.SESSION_EXPIRED}</span>
        </div>
      )}

      {/* Thông báo đăng ký thành công */}
      {isRegistered && !errors.general && (
        <div
          role="alert"
          className="p-3 bg-moss/15 border border-moss/40 rounded-control text-kombu text-sm flex items-start gap-2"
        >
          <span className="text-base leading-none">✅</span>
          <span>{AUTH_ERROR_MESSAGES.REGISTRATION_SUCCESS}</span>
        </div>
      )}

      {/* Thông báo lỗi tổng quát (từ server hoặc validate) */}
      {errors.general && (
        <div
          role="alert"
          className="p-3 bg-error/10 border border-error/40 rounded-control text-error text-sm flex items-start gap-2 font-medium"
        >
          <span className="text-base leading-none">⚠️</span>
          <span>{errors.general}</span>
        </div>
      )}

      {/* Form đăng nhập */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Trường Email */}
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-semibold text-noir">
            Địa chỉ email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nhapemail@vidu.com"
            value={email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            className={`w-full px-3.5 py-2.5 bg-bone border rounded-control text-sm text-noir placeholder:text-noir/40 focus:outline-none focus:ring-2 ${
              errors.email
                ? 'border-error text-error bg-error/10 focus:ring-error/30'
                : 'border-tan focus:ring-moss/30 focus:border-moss'
            }`}
          />
          {errors.email && (
            <p id="login-email-error" role="alert" className="text-xs text-error font-medium">
              {errors.email}
            </p>
          )}
        </div>

        {/* Trường Mật khẩu */}
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-semibold text-noir">
            Mật khẩu
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              value={password}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              className={`w-full px-3.5 py-2.5 bg-bone border rounded-control text-sm text-noir placeholder:text-noir/40 pr-12 focus:outline-none focus:ring-2 ${
                errors.password
                  ? 'border-error text-error bg-error/10 focus:ring-error/30'
                  : 'border-tan focus:ring-moss/30 focus:border-moss'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-noir/50 hover:text-noir p-1 text-sm font-medium cursor-pointer"
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          {errors.password && (
            <p id="login-password-error" role="alert" className="text-xs text-error font-medium">
              {errors.password}
            </p>
          )}
        </div>

        {/* Nút gửi */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 rounded-control font-bold text-sm shadow-soft transition ${
            isSubmitting
              ? 'bg-tan/40 text-noir/40 cursor-not-allowed opacity-75'
              : 'bg-kombu text-bone hover:bg-noir active:scale-[0.98] cursor-pointer'
          }`}
        >
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      {/* Điều hướng sang đăng ký */}
      <div className="text-center text-xs sm:text-sm text-noir/65 pt-3 border-t border-tan/40">
        Chưa có tài khoản?{' '}
        <Link
          href={`/register${redirectParam ? `?redirect=${encodeURIComponent(targetRedirect)}` : ''}`}
          className="text-kombu font-bold underline decoration-moss underline-offset-4 hover:text-noir"
        >
          Đăng ký ngay
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full mb-2"></div>
          <p>Đang tải trang đăng nhập...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
