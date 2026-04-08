import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { accountRoutes, publicAuthRoutes } from '@/config/routes';
import { VerifyEmailContent } from './VerifyEmailContent';

export default async function VerifyEmailPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(publicAuthRoutes.login);
  }

  const u = session.user as Record<string, unknown>;
  const emailVerified = (u.emailVerified as boolean) ?? false;

  if (emailVerified) {
    redirect(accountRoutes.home);
  }

  return (
    <div className="content-container py-16 max-w-md">
      <VerifyEmailContent
        email={session.user.email}
        createdAt={(u.createdAt as string) ?? new Date().toISOString()}
      />
    </div>
  );
}
