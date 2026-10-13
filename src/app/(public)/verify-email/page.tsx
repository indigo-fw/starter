import { VerifyEmailContent } from './VerifyEmailContent';
import { headers } from 'next/headers';

import { accountRoutes, publicAuthRoutes } from '@/config/routes';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { getLocale } from '@/lib/locale-server';

export default async function VerifyEmailPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const locale = await getLocale();

  if (!session?.user) {
    // next-intl's redirect is not typed `never`, so narrow explicitly.
    redirect({ href: publicAuthRoutes.login, locale });
    return null;
  }

  const u = session.user as Record<string, unknown>;
  const emailVerified = (u.emailVerified as boolean) ?? false;

  if (emailVerified) {
    redirect({ href: accountRoutes.home, locale });
  }

  return (
    <div className="app-container max-w-md py-16">
      <VerifyEmailContent
        email={session.user.email}
        createdAt={(u.createdAt as string) ?? new Date().toISOString()}
      />
    </div>
  );
}
