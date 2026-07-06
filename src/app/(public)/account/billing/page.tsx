'use client';

import { trpc } from '@/lib/trpc/client';
import { contentRoutes } from '@/config/routes';
import { TokenPackCard } from '@/components/public/TokenPackCard';
import { useBlankTranslations } from '@/lib/translations';

export default function AccountBillingPage() {
  const __ = useBlankTranslations();
  const { data: billingConfig } = trpc.billing.getBillingConfig.useQuery();
  const { data: subscription } = trpc.billing.getSubscription.useQuery();
  // Unconditional so all three queries batch into one request (harmless in
  // subscription mode — the card below just doesn't render)
  const { data: tokenBalance } = trpc.billing.getTokenBalance.useQuery();
  const portal = trpc.billing.createPortalSession.useMutation();
  const purchasePack = trpc.billing.purchaseTokenPack.useMutation();

  const mode = billingConfig?.mode ?? 'subscription';
  const showSubscription = mode !== 'tokens';
  const showTokens = mode !== 'subscription';
  const tokenPacks = billingConfig?.tokenPacks ?? [];

  const handleManage = async () => {
    const result = await portal.mutateAsync({ providerId: 'stripe' });
    if (result.url) window.location.href = result.url;
  };

  const handleBuyPack = async (packId: string) => {
    const result = await purchasePack.mutateAsync({ packId });
    if (result.url) window.location.assign(result.url);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('Billing')}</h1>

      {showSubscription && (
        <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
          <h2 className="font-semibold mb-2">{__('Current Plan')}</h2>
          <p className="text-xl font-bold capitalize">{subscription?.planId ?? 'free'}</p>
          <p className="text-sm text-(--text-secondary) mt-1">
            {__('Status:')} <span className="capitalize">{subscription?.status ?? 'active'}</span>
          </p>
        </div>
      )}

      {showTokens && (
        <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
          <h2 className="font-semibold mb-2">{__('Token Balance')}</h2>
          <p className="text-xl font-bold">{(tokenBalance?.balance ?? 0).toLocaleString()}</p>
          {(tokenBalance?.planBalance ?? 0) > 0 && (tokenBalance?.purchasedBalance ?? 0) > 0 && (
            <p className="text-sm text-(--text-secondary) mt-1">
              {__('Plan:')} {(tokenBalance?.planBalance ?? 0).toLocaleString()}
              {' · '}
              {__('Purchased:')} {(tokenBalance?.purchasedBalance ?? 0).toLocaleString()}
            </p>
          )}
          <p className="text-sm text-(--text-secondary) mt-1">
            {__('Lifetime used:')} {(tokenBalance?.lifetimeUsed ?? 0).toLocaleString()}
          </p>
        </div>
      )}

      {showTokens && tokenPacks.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">{__('Buy Tokens')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {tokenPacks.map((pack) => (
              <TokenPackCard
                key={pack.id}
                pack={pack}
                action={
                  <button
                    onClick={() => handleBuyPack(pack.id)}
                    disabled={purchasePack.isPending}
                    className="py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                  >
                    {__('Buy now')}
                  </button>
                }
              />
            ))}
          </div>
        </div>
      )}

      {showSubscription && (
        <div className="flex gap-3">
          <a href={contentRoutes.pricing} className="py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">
            {__('View Plans')}
          </a>
          {subscription?.planId !== 'free' && (
            <button onClick={handleManage} disabled={portal.isPending} className="py-2 px-4 rounded-lg text-sm border border-(--border-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-50">
              {portal.isPending ? __('Loading...') : __('Manage Billing')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
