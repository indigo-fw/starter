'use client';

import { Link } from '@/components/Link';
import { Sparkles } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { TokenBalance } from '@/core/components/TokenBalance';
import { useTranslations } from '@/lib/translations';

/**
 * Shows a "Subscribe" button if the user has no active subscription,
 * or the live token balance if they do. Hidden when not logged in.
 * In tokens-only billing mode there is no subscription concept — the
 * balance is always shown instead (it links to the buy-tokens page).
 *
 * Styles: .app-subscribe-btn (frontend.css)
 */
export function SubscribeOrTokens() {
  const __ = useTranslations();
  const { data: session } = useSession();
  const { data: billingConfig } = trpc.billing.getBillingConfig.useQuery(
    undefined,
    { enabled: !!session },
  );
  const tokensOnly = billingConfig?.mode === 'tokens';
  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery(
    undefined,
    { enabled: !!session && !tokensOnly },
  );

  if (!session) return null;

  if (tokensOnly) {
    return <TokenBalance href="/account/billing" />;
  }

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
