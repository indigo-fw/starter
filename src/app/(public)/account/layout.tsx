import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { AccountNav } from '@/components/public/AccountNav';
import { EmailVerificationBanner } from '@/components/public/EmailVerificationBanner';
import { GeoSyncer } from '@/core/components/GeoSyncer';
import { publicAuthRoutes, accountRoutes } from '@/config/routes';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`${publicAuthRoutes.login}?callbackUrl=${accountRoutes.home}`);
  }

  return (
    <div className="app-container py-8 max-w-5xl">
      <GeoSyncer />
      <EmailVerificationBanner />
      <div className="flex flex-col md:flex-row gap-8">
        <AccountNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
