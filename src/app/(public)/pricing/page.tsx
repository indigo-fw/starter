import { Metadata } from 'next';
import { PRICING_PLANS, PRICING_FAQ } from '@/config/pricing';
import { PricingToggle } from '@/core/components/pricing/PricingToggle';
import { FaqAccordion } from '@/core/components/pricing/FaqAccordion';
import { publicAuthRoutes } from '@/config/routes';
import { getServerTranslations } from '@/lib/translations-server';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: __('Pricing'),
    description: __('Simple, transparent pricing for teams of all sizes.'),
  };
}

export default async function PricingPage() {
  const __ = await getServerTranslations();
  const cryptoEnabled = !!process.env.NOWPAYMENTS_API_KEY;

  return (
    <main className="app-container py-16 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{__('Simple, transparent pricing')}</h1>
        <p className="text-lg text-(--text-secondary) max-w-2xl mx-auto">
          {__('Choose the plan that fits your team. All plans include a 14-day free trial.')}
        </p>
      </div>

      <PricingToggle plans={PRICING_PLANS} cryptoEnabled={cryptoEnabled} registerHref={publicAuthRoutes.register} />

      <section className="mt-24">
        <h2 className="text-2xl font-bold text-center mb-8">
          {__('Frequently asked questions')}
        </h2>
        <FaqAccordion faqs={PRICING_FAQ} />
      </section>
    </main>
  );
}
