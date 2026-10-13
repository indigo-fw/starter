import { headers } from 'next/headers';
// eslint-disable-next-line no-restricted-imports -- target is the non-localized /dashboard/login; the i18n redirect would prefix it
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

/**
 * Chat layout — full-screen, no header/footer.
 * Requires authentication.
 */
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/dashboard/login?callbackUrl=/chat');
  }

  return (
    <div className="h-screen overflow-hidden" data-page="chat">
      {children}
    </div>
  );
}
