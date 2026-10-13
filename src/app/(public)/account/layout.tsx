import { headers } from 'next/headers';

import { AccountNav } from '@/components/public/AccountNav';
import { EmailVerificationBanner } from '@/components/public/EmailVerificationBanner';
import { accountRoutes, publicAuthRoutes } from '@/config/routes';
import { GeoSyncer } from '@/core/components/GeoSyncer';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { getLocale } from '@/lib/locale-server';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect({
      href: {
        pathname: publicAuthRoutes.login,
        query: { callbackUrl: accountRoutes.home },
      },
      locale: await getLocale(),
    });
  }

  return (
    <div className="app-container max-w-5xl py-8" data-page="account">
      <GeoSyncer />
      <EmailVerificationBanner />
      <div className="flex flex-col gap-8 md:flex-row">
        <AccountNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
