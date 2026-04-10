import type { ModuleConfig } from '@/core/lib/module/module-config';

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
  pageWidgets: [
    { slot: 'billing', name: 'AffiliateOverview', from: '@/core-affiliates/components/AffiliateOverview' },
  ],
  navItems: [
    { groupId: 'billing', name: 'Affiliates', href: '/dashboard/settings/affiliates', icon: 'Link2' },
  ],
  projectFiles: [
    'config/affiliates-deps.ts',
    'app/dashboard/(panel)/settings/affiliates/page.tsx',
    'app/(public)/account/affiliates/page.tsx',
  ],
};

export default config;
