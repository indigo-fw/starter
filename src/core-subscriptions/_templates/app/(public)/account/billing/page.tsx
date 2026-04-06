'use client';

import { trpc } from '@/lib/trpc/client';
import { contentRoutes } from '@/config/routes';
import { useBlankTranslations } from '@/lib/translations';

export default function AccountBillingPage() {
  const __ = useBlankTranslations();
  const { data: subscription } = trpc.billing.getSubscription.useQuery();
  const portal = trpc.billing.createPortalSession.useMutation();

  const handleManage = async () => {
    const result = await portal.mutateAsync({ providerId: 'stripe' });
    if (result.url) window.location.href = result.url;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('Billing')}</h1>

      <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
        <h2 className="font-semibold mb-2">{__('Current Plan')}</h2>
        <p className="text-xl font-bold capitalize">{subscription?.planId ?? 'free'}</p>
        <p className="text-sm text-(--text-secondary) mt-1">
          {__('Status:')} <span className="capitalize">{subscription?.status ?? 'active'}</span>
        </p>
      </div>

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
    </div>
  );
}
