'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  getSafeRedirectUrl,
  validateEmail,
  validatePassword,
  validateDisplayName,
  validateConfirmPassword,
} from '../../utils/auth';
import { classifyApiError } from '../../utils/validation';
import { AUTH_ERROR_MESSAGES } from '../../services/auth-contract';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isAuthenticated, isHydrated } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  const redirectParam = searchParams.get('redirect');
  const targetRedirect = getSafeRedirectUrl(redirectParam, '/');

  // Nếu người dùng đã đăng nhập từ trước, tự động chuyển về trang đích hoặc Menu
  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace(targetRedirect);
    }
  }, [isHydrated, isAuthenticated, targetRedirect, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    // 1. Validate toàn bộ form phía client
    const nameVal = validateDisplayName(displayName);
    const emailVal = validateEmail(email);
    const passVal = validatePassword(password);
    const confirmVal = validateConfirmPassword(password, confirmPassword);

    const newErrors: typeof errors = {};

    if (!nameVal.isValid) newErrors.displayName = nameVal.error;
    if (!emailVal.isValid) newErrors.email = emailVal.error;
    if (!passVal.isValid) newErrors.password = passVal.error;
    if (!confirmVal.isValid) newErrors.confirmPassword = confirmVal.error;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      // Đăng ký thành công -> chuyển sang trang /login kèm thông báo (không tự đăng nhập vì API không trả token)
      const loginUrl = `/login?registered=true${
        redirectParam ? `&redirect=${encodeURIComponent(targetRedirect)}` : ''
      }`;
      router.push(loginUrl);
    } catch (err) {
      const classified = classifyApiError(err, AUTH_ERROR_MESSAGES.UNKNOWN_ERROR);
      if (classified.statusCode === 409) {
        // Lỗi 409 ("Email này đã được sử dụng"): hiển thị ngay dưới ô email (A1)
        setErrors({
          email: classified.fieldErrors.email || classified.message,
        });
      } else if (classified.kind === 'validation') {
        // Lỗi 400 (mảng chuỗi tiếng Anh): hiển thị thông báo tiếng Việt chung + gắn vào đúng ô nếu nhận diện được (A1)
        setErrors({
          general: classified.message,
          displayName: classified.fieldErrors.displayName,
          email: classified.fieldErrors.email,
          password: classified.fieldErrors.password,
        });
      } else {
        setErrors({
          general: classified.message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tránh nhấp nháy form nếu đã đăng nhập và đang chuyển hướng
  if (!isHydrated || (isHydrated && isAuthenticated)) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full mb-2"></div>
        <p>Đang kiểm tra trạng thái...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto my-6 sm:my-10 bg-cream p-6 sm:p-8 rounded-card border border-tan/60 shadow-soft space-y-6">
      {/* Tiêu đề */}
      <div className="text-center space-y-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-noir">Đăng ký tài khoản</h1>
        <p className="text-sm text-noir/65">Tạo tài khoản để đặt món nhanh chóng cùng BrewLite ☕</p>
      </div>

      {/* Thông báo lỗi tổng quát (409 email đã tồn tại hoặc lỗi validate) */}
      {errors.general && (
        <div
          role="alert"
          className="p-3 bg-error/10 border border-error/40 rounded-control text-error text-sm flex items-start gap-2 font-medium"
        >
          <span className="text-base leading-none">⚠️</span>
          <span>{errors.general}</span>
        </div>
      )}

      {/* Form đăng ký */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Trường Tên hiển thị */}
        <div className="space-y-1">
          <label htmlFor="displayName" className="block text-sm font-semibold text-noir">
            Tên hiển thị
          </label>
          <input
            id="displayName"
            type="text"
            name="displayName"
            autoComplete="name"
            placeholder="Ví dụ: Nguyễn Văn An"
            value={displayName}
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={errors.displayName ? 'register-displayName-error' : undefined}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (errors.displayName) setErrors((prev) => ({ ...prev, displayName: undefined }));
            }}
            className={`w-full px-3.5 py-2.5 bg-bone border rounded-control text-sm text-noir placeholder:text-noir/40 focus:outline-none focus:ring-2 ${
              errors.displayName
                ? 'border-error text-error bg-error/10 focus:ring-error/30'
                : 'border-tan focus:ring-moss/30 focus:border-moss'
            }`}
          />
          {errors.displayName && (
            <p id="register-displayName-error" role="alert" className="text-xs text-error font-medium">
              {errors.displayName}
            </p>
          )}
        </div>

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
            aria-describedby={errors.email ? 'register-email-error' : undefined}
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
            <p id="register-email-error" role="alert" className="text-xs text-error font-medium">
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
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'register-password-error' : undefined}
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
            <p id="register-password-error" role="alert" className="text-xs text-error font-medium">
              {errors.password}
            </p>
          )}
        </div>

        {/* Trường Xác nhận mật khẩu */}
        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="block text-sm font-semibold text-noir">
            Nhập lại mật khẩu
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Nhập lại chính xác mật khẩu trên"
            value={confirmPassword}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? 'register-confirmPassword-error' : undefined}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) {
                setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }
            }}
            className={`w-full px-3.5 py-2.5 bg-bone border rounded-control text-sm text-noir placeholder:text-noir/40 focus:outline-none focus:ring-2 ${
              errors.confirmPassword
                ? 'border-error text-error bg-error/10 focus:ring-error/30'
                : 'border-tan focus:ring-moss/30 focus:border-moss'
            }`}
          />
          {errors.confirmPassword && (
            <p id="register-confirmPassword-error" role="alert" className="text-xs text-error font-medium">
              {errors.confirmPassword}
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
          {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}
        </button>
      </form>

      {/* Điều hướng sang đăng nhập */}
      <div className="text-center text-xs sm:text-sm text-noir/65 pt-3 border-t border-tan/40">
        Đã có tài khoản?{' '}
        <Link
          href={`/login${redirectParam ? `?redirect=${encodeURIComponent(targetRedirect)}` : ''}`}
          className="text-kombu font-bold underline decoration-moss underline-offset-4 hover:text-noir"
        >
          Đăng nhập ngay
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto py-16 text-center text-noir/65 text-sm">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full mb-2"></div>
          <p>Đang kiểm tra trạng thái...</p>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
