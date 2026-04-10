import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { DashboardShellWrapper } from '@/components/admin/DashboardShellWrapper';
import { PreferencesHydrator } from '@/core/components/dashboard/PreferencesHydrator';
import { Toaster } from '@/core/components/Toaster';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminSidebar />
      <PreferencesHydrator />
      <DashboardShellWrapper>{children}</DashboardShellWrapper>
      <Toaster />
    </>
  );
}
