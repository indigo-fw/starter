import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-affiliates',
  routers: [
    { name: 'affiliatesRouter', key: 'affiliates', from: '@/core-affiliates/routers/affiliates' },
    { name: 'attributionsRouter', key: 'attributions', from: '@/core-affiliates/routers/attributions' },
  ],
  schema: [
    '@/core-affiliates/schema/affiliates',
    '@/core-affiliates/schema/attributions',
  ],
  serverInit: [
    '@/config/affiliates-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedAffiliates', from: '@/core-affiliates/seed', label: 'Affiliate demo data (referrals, commissions)' },
  ],
  layoutWidgets: [
    { name: 'AttributionCapture', from: '@/core-affiliates/components/AttributionCapture' },
  ],
  projectFiles: [
    'config/affiliates-deps.ts',
    'app/dashboard/(panel)/settings/affiliates/page.tsx',
    'app/dashboard/(panel)/settings/billing/components/AffiliateOverview.tsx',
    'app/(public)/account/affiliates/page.tsx',
  ],
};

export default config;
