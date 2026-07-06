import { Metadata } from 'next';
import { PRICING_PLANS, PRICING_FAQ } from '@/config/pricing';
import { PricingToggle } from '@/core/components/pricing/PricingToggle';
import { FaqAccordion } from '@/core/components/pricing/FaqAccordion';
import { TokenPackCard } from '@/components/public/TokenPackCard';
import { Link } from '@/components/Link';
import { publicAuthRoutes } from '@/config/routes';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { getCmsOverride } from '@/lib/cms-override';
import { getLocale } from '@/lib/locale-server';
import { getBillingConfig } from '@/core-subscriptions/lib/billing-config';
// Side-effect: registers this install's billing mode + token packs
import '@/config/billing';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const cms = await getCmsOverride(db, 'pricing', locale).catch(() => null);
  return {
    title: cms?.seo.seoTitle || `${__('Pricing')} | ${siteConfig.name}`,
    description: cms?.seo.metaDescription || __('Simple, transparent pricing for teams of all sizes.'),
    ...(cms?.seo.noindex && { robots: { index: false, follow: false } }),
    openGraph: { locale },
  };
}

export default async function PricingPage() {
  const __ = await getServerTranslations();
  const cryptoEnabled = !!process.env.NOWPAYMENTS_API_KEY;
  const billing = getBillingConfig();
  const tokensOnly = billing.mode === 'tokens';
  const tokenPacks = billing.tokenPacks ?? [];

  return (
    <main className="app-container py-16 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{__('Simple, transparent pricing')}</h1>
        <p className="text-lg text-(--text-secondary) max-w-2xl mx-auto">
          {tokensOnly
            ? __('Pay as you go: buy tokens once, use them until they run out. No subscription required.')
            : __('Choose the plan that fits your team. All plans include a 14-day free trial.')}
        </p>
      </div>

      {tokensOnly ? (
        <div className="grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
          {tokenPacks.map((pack) => (
            <TokenPackCard
              key={pack.id}
              pack={pack}
              action={
                <Link
                  href={publicAuthRoutes.register}
                  className="py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                >
                  {__('Get Started')}
                </Link>
              }
            />
          ))}
        </div>
      ) : (
        <PricingToggle plans={PRICING_PLANS} cryptoEnabled={cryptoEnabled} registerHref={publicAuthRoutes.register} />
      )}

      <section className="mt-24">
        <h2 className="text-2xl font-bold text-center mb-8">
          {__('Frequently asked questions')}
        </h2>
        <FaqAccordion faqs={PRICING_FAQ} />
      </section>
    </main>
  );
}
