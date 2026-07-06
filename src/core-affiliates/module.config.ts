import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-affiliates',
  category: 'primitive',
  routers: [
    { name: 'affiliatesRouter', key: 'affiliates', from: '@/core-affiliates/routers/affiliates' },
    { name: 'attributionsRouter', key: 'attributions', from: '@/core-affiliates/routers/attributions' },
  ],
  schema: [
    '@/core-affiliates/schema/affiliates',
    '@/core-affiliates/schema/attributions',
  ],
  serverInit: [
    '@/config/deps/affiliates-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedAffiliates', from: '@/core-affiliates/seed', label: 'Affiliate demo data (referrals, commissions)' },
  ],
  layoutWidgets: [
    // AttributionCapture is consent-aware internally (uses useConsentSafe).
    // We intentionally do NOT set consentCategory here: the framework would
    // wrap it in <ConsentGate>, which unmounts the component on withdrawal —
    // and that prevents its cookie-cleanup effect from running. By staying
    // mounted, the component can react to both grant and revoke transitions.
    { name: 'AttributionCapture', from: '@/core-affiliates/components/AttributionCapture' },
  ],
  pageWidgets: [
    { slot: 'billing', name: 'AffiliateOverview', from: '@/core-affiliates/components/AffiliateOverview' },
  ],
  navItems: [
    { groupId: 'billing', name: 'Affiliates', href: '/dashboard/settings/affiliates', icon: 'Link2' },
  ],
  projectFiles: [
    'config/deps/affiliates-deps.ts',
    'app/dashboard/(panel)/settings/affiliates/page.tsx',
    'app/(public)/account/affiliates/page.tsx',
  ],
};

export default config;
