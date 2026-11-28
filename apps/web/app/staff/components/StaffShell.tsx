'use client';

import React, { createContext, Suspense, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { ROLE_LABELS, UserRole } from '../../../services/auth-contract';
import { CoffeeIcon } from '../../components/Icons';
import {
  getMockStaffShellUser,
  isStaffShellMockEnabled,
  STAFF_SHELL_MOCK_CONFIG,
  StaffMockRole,
} from '../mocks/staff-shell-mock';

interface StaffNavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}

export interface StaffShellContextValue {
  role: UserRole | null;
  usingMockFallback: boolean;
}

const StaffShellContext = createContext<StaffShellContextValue | null>(null);

export function useStaffShellContext(): StaffShellContextValue | null {
  return useContext(StaffShellContext);
}

const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { href: '/staff', label: 'Đơn hàng' },
  { href: '/staff/products', label: 'Món' },
  { href: '/staff/employees', label: 'Nhân viên', adminOnly: true },
  { href: '/staff/promotions', label: 'Khuyến mãi', adminOnly: true },
];

function isNavItemActive(pathname: string, href: string): boolean {
  const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (href === '/staff') {
    return cleanPath === '/staff';
  }
  return cleanPath === href || cleanPath.startsWith(`${href}/`);
}

function StaffShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/staff';
  const router = useRouter();
  const { user, isAuthenticated, isHydrated, logout } = useAuth();
  const [mockRole, setMockRole] = useState<StaffMockRole>(
    STAFF_SHELL_MOCK_CONFIG.defaultRole
  );

  const mockEnabled = isStaffShellMockEnabled();
  const hasRealSession = Boolean(isAuthenticated && user);
  const usingMockFallback = !hasRealSession && mockEnabled;
  const activeUser = hasRealSession
    ? user
    : usingMockFallback
      ? getMockStaffShellUser(mockRole)
      : null;

  const visibleNavItems = STAFF_NAV_ITEMS.filter(
    (item) => !item.adminOnly || activeUser?.role === 'ADMIN'
  );

  const roleLabel = activeUser ? (ROLE_LABELS[activeUser.role] ?? activeUser.role) : '';

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!isHydrated) {
    return (
      <div
        data-testid="staff-shell-loading"
        className="min-h-screen flex items-center justify-center bg-bone text-noir/70 text-sm"
      >
        <div className="text-center space-y-2">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full" />
          <p>Đang tải không gian làm việc...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-bone text-noir">
      {/* Thanh điều hướng bên trái tối ưu cho máy tính */}
      <aside className="w-64 shrink-0 bg-kombu text-bone border-r border-moss/30 flex flex-col">
        <div className="h-20 px-6 flex items-center gap-3 border-b border-moss/30">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-bone text-kombu">
            <CoffeeIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <Link
              href="/staff"
              className="block font-display text-xl font-bold tracking-tight text-bone hover:text-tan transition"
            >
              BrewLite
            </Link>
            <p className="text-xs text-bone/70">Khu nhân viên</p>
          </div>
        </div>

        <nav
          aria-label="Điều hướng khu nhân viên"
          className="flex-1 px-4 py-6 space-y-1.5"
        >
          {visibleNavItems.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center px-4 py-2.5 rounded-control text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss ${
                  active
                    ? 'bg-tan text-noir shadow-soft'
                    : 'text-bone/90 hover:bg-moss/25 hover:text-tan'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-moss/30 text-xs text-bone/60">
          Vận hành tại quầy
        </div>
      </aside>

      {/* Vùng nội dung chính bên phải */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-20 bg-cream border-b border-tan/70 px-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-noir/70">
              Hệ thống quản lý quầy BrewLite
            </span>

            {usingMockFallback && (
              <div
                data-testid="staff-mock-role-switcher"
                className="flex items-center gap-1.5 rounded-control bg-bone border border-tan px-2.5 py-1 text-xs"
              >
                <span className="text-noir/70 font-medium">Thử vai trò giả:</span>
                <button
                  type="button"
                  onClick={() => setMockRole('STAFF')}
                  aria-pressed={mockRole === 'STAFF'}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${
                    mockRole === 'STAFF'
                      ? 'bg-kombu text-bone'
                      : 'text-noir/80 hover:bg-tan/50'
                  }`}
                >
                  {ROLE_LABELS.STAFF}
                </button>
                <button
                  type="button"
                  onClick={() => setMockRole('ADMIN')}
                  aria-pressed={mockRole === 'ADMIN'}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${
                    mockRole === 'ADMIN'
                      ? 'bg-kombu text-bone'
                      : 'text-noir/80 hover:bg-tan/50'
                  }`}
                >
                  {ROLE_LABELS.ADMIN}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {activeUser ? (
              <div className="flex items-center gap-3">
                <div className="text-right leading-tight">
                  <p
                    data-testid="staff-user-name"
                    className="text-sm font-bold text-noir"
                  >
                    {activeUser.displayName}
                  </p>
                  <span
                    data-testid="staff-user-role"
                    className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-moss/25 text-kombu border border-moss/40"
                  >
                    {roleLabel}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-sm text-noir/65">Chưa đăng nhập</span>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-control text-sm font-semibold bg-error/90 hover:bg-error text-bone transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <StaffShellContext.Provider
              value={{
                role: activeUser?.role ?? null,
                usingMockFallback,
              }}
            >
              {children}
            </StaffShellContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function StaffShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bone text-noir/70 text-sm">
          Đang tải không gian làm việc...
        </div>
      }
    >
      <StaffShellInner>{children}</StaffShellInner>
    </Suspense>
  );
}

