'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { TokenBalance } from '@/core/components/TokenBalance';
import { useTranslations } from '@/lib/translations';

/**
 * Shows a "Subscribe" button if the user has no active subscription,
 * or the live token balance if they do. Hidden when not logged in.
 *
 * Styles: .app-subscribe-btn (frontend.css)
 */
export function SubscribeOrTokens() {
  const __ = useTranslations();
  const { data: session } = useSession();
  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery(
    undefined,
    { enabled: !!session },
  );

  if (!session) return null;
  if (isLoading) return null;

  if (subscription?.status === 'active' || subscription?.status === 'trialing') {
    return <TokenBalance href="/account/billing" />;
  }

  return (
    <Link href="/pricing" className="app-subscribe-btn">
      <Sparkles className="h-3.5 w-3.5" />
      {__('Subscribe')}
    </Link>
  );
}
