'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  getSafeRedirectUrl,
  validateEmail,
  validatePassword,
  validateFullName,
  validateConfirmPassword,
  extractErrorMessage,
} from '../../utils/auth';
import { AUTH_ERROR_MESSAGES } from '../../services/auth-contract';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isAuthenticated, isHydrated } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState<{
    fullName?: string;
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
    const nameVal = validateFullName(fullName);
    const emailVal = validateEmail(email);
    const passVal = validatePassword(password);
    const confirmVal = validateConfirmPassword(password, confirmPassword);

    const newErrors: typeof errors = {};

    if (!nameVal.isValid) newErrors.fullName = nameVal.error;
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
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });

      // Đăng ký thành công -> chuyển sang trang /login kèm thông báo
      const loginUrl = `/login?registered=true${
        redirectParam ? `&redirect=${encodeURIComponent(targetRedirect)}` : ''
      }`;
      router.push(loginUrl);
    } catch (err) {
      const message = extractErrorMessage(err, AUTH_ERROR_MESSAGES.UNKNOWN_ERROR);
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
      <div className="py-16 text-center text-gray-500 text-sm">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mb-2"></div>
        <p>Đang kiểm tra trạng thái...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-4 space-y-6">
      {/* Tiêu đề */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Đăng ký tài khoản</h1>
        <p className="text-sm text-gray-500">Tạo tài khoản để nhận ưu đãi và tích điểm BrewLite ☕</p>
      </div>

      {/* Thông báo lỗi tổng quát (409 email đã tồn tại hoặc lỗi server) */}
      {errors.general && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2"
        >
          <span className="text-base leading-none">⚠️</span>
          <span>{errors.general}</span>
        </div>
      )}

      {/* Form đăng ký */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4 bg-white">
        {/* Trường Họ và tên */}
        <div className="space-y-1">
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
            Họ và tên
          </label>
          <input
            id="fullName"
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder="Ví dụ: Nguyễn Văn A"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
            }}
            className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
              errors.fullName
                ? 'border-red-400 focus:ring-red-400 bg-red-50/20'
                : 'border-gray-200 focus:ring-amber-500'
            }`}
          />
          {errors.fullName && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {errors.fullName}
            </p>
          )}
        </div>

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
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 text-sm font-medium"
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

        {/* Trường Nhập lại mật khẩu */}
        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Nhập lại mật khẩu
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Khớp với mật khẩu đã nhập ở trên"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }}
            className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
              errors.confirmPassword
                ? 'border-red-400 focus:ring-red-400 bg-red-50/20'
                : 'border-gray-200 focus:ring-amber-500'
            }`}
          />
          {errors.confirmPassword && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* Nút Đăng ký */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-amber-600 text-white font-medium rounded-xl text-sm shadow hover:bg-amber-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              <span>Đang tạo tài khoản...</span>
            </>
          ) : (
            'Tạo tài khoản'
          )}
        </button>
      </form>

      {/* Điều hướng sang trang Đăng nhập */}
      <div className="text-center pt-2">
        <p className="text-sm text-gray-600">
          Đã có tài khoản?{' '}
          <Link
            href={`/login${redirectParam ? `?redirect=${encodeURIComponent(targetRedirect)}` : ''}`}
            className="text-amber-600 font-semibold hover:underline"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-gray-500 text-sm">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mb-2"></div>
          <p>Đang tải trang đăng ký...</p>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}

