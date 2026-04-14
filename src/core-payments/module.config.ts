import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-payments',
  routers: [
    { name: 'billingProfileRouter', key: 'billingProfile', from: '@/core-payments/routers/billing-profile' },
  ],
  schema: [
    '@/core-payments/schema/payments',
    '@/core-payments/schema/billing-profile',
  ],
  serverInit: [
    '@/config/payments-deps',
  ],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [
    'config/payments-deps.ts',
    'config/payment-providers.ts',
  ],
};

export default config;
