import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Chat layout — full-screen, no header/footer.
 * Requires authentication.
 */
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
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
