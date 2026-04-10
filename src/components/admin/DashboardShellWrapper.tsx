'use client';

import { navigation } from '@/config/admin-nav';
import { DashboardShell } from '@/core/components/dashboard/DashboardShell';

export function DashboardShellWrapper({ children }: { children: React.ReactNode }) {
  return <DashboardShell navigation={navigation}>{children}</DashboardShell>;
}
