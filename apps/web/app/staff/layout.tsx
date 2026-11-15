import React from 'react';
import StaffShell from './components/StaffShell';

export default function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StaffShell>{children}</StaffShell>;
}

