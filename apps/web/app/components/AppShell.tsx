'use client';

import React, { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { isStaffPath } from '../../utils/auth';

interface AppShellProps {
  header: React.ReactNode;
  notice: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

function AppShellInner({ header, notice, footer, children }: AppShellProps) {
  const pathname = usePathname() || '/';
  const isStaffRoute = isStaffPath(pathname);

  if (isStaffRoute) {
    return (
      <div className="min-h-screen flex flex-col">
        {notice}
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {header}
      {notice}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      {footer}
    </div>
  );
}

/**
 * Điều phối khung hiển thị chung:
 * - Khu /staff dùng layout riêng, ẩn header/footer và khung max-w-6xl của khách.
 * - Các trang khác giữ nguyên bố cục khu khách như cũ.
 */
export default function AppShell(props: AppShellProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          {props.notice}
          <div className="flex-1 flex flex-col">{props.children}</div>
        </div>
      }
    >
      <AppShellInner {...props} />
    </Suspense>
  );
}

