'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  getSafeRedirectUrl,
  validateEmail,
  validateLoginPassword,
  extractErrorMessage,
} from '../../utils/auth';
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
      const message = extractErrorMessage(err, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
      setErrors({
        general: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tránh nhấp nháy form nếu đã đăng nhập và đang chuyển hướng
  if (!isHydrated || (isHydrated && isAuthenticated)) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mb-2"></div>
        <p>Đang kiểm tra trạng thái đăng nhập...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto my-6 sm:my-10 bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-xs space-y-6">
      {/* Tiêu đề */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Đăng nhập tài khoản</h1>
        <p className="text-sm text-gray-500">Chào mừng bạn quay lại với BrewLite ☕</p>
      </div>

      {/* Thông báo phiên hết hạn */}
      {isExpired && !errors.general && (
        <div
          role="alert"
          className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-start gap-2"
        >
          <span className="text-base leading-none">⚠️</span>
          <span>{AUTH_ERROR_MESSAGES.SESSION_EXPIRED}</span>
        </div>
      )}

      {/* Thông báo đăng ký thành công */}
      {isRegistered && !errors.general && (
        <div
          role="alert"
          className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm flex items-start gap-2"
        >
          <span className="text-base leading-none">✅</span>
          <span>{AUTH_ERROR_MESSAGES.REGISTRATION_SUCCESS}</span>
        </div>
      )}

      {/* Thông báo lỗi tổng quát (từ server hoặc validate) */}
      {errors.general && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2"
        >
          <span className="text-base leading-none">⚠️</span>
          <span>{errors.general}</span>
        </div>
      )}

      {/* Form đăng nhập */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Trường Email */}
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Địa chỉ email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nhapemail@vidu.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
              errors.email
                ? 'border-red-400 focus:ring-red-400 bg-red-50/20'
                : 'border-gray-200 focus:ring-amber-500'
            }`}
          />
          {errors.email && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {errors.email}
            </p>
          )}
        </div>

        {/* Trường Mật khẩu */}
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
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
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm pr-12 focus:outline-none focus:ring-2 ${
                errors.password
                  ? 'border-red-400 focus:ring-red-400 bg-red-50/20'
                  : 'border-gray-200 focus:ring-amber-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 text-sm font-medium cursor-pointer"
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          {errors.password && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {errors.password}
            </p>
          )}
        </div>

        {/* Nút gửi */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 rounded-xl font-bold text-sm text-white transition shadow-sm ${
            isSubmitting
              ? 'bg-amber-400 cursor-not-allowed opacity-75'
              : 'bg-amber-600 hover:bg-amber-700 active:scale-98 cursor-pointer'
          }`}
        >
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      {/* Điều hướng sang đăng ký */}
      <div className="text-center text-xs sm:text-sm text-gray-500 pt-3 border-t border-gray-100">
        Chưa có tài khoản?{' '}
        <Link
          href={`/register${redirectParam ? `?redirect=${encodeURIComponent(targetRedirect)}` : ''}`}
          className="text-amber-600 font-semibold hover:underline"
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
        <div className="max-w-md mx-auto py-16 text-center text-gray-500 text-sm">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mb-2"></div>
          <p>Đang tải trang đăng nhập...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
