import { ThemeInit } from '@/core/components/ThemeInit';

export default function DashboardAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--surface-secondary)" data-page="auth">
      <ThemeInit />
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
