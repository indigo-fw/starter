import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-payments',
  category: 'primitive',
  routers: [
    { name: 'billingProfileRouter', key: 'billingProfile', from: '@/core-payments/routers/billing-profile' },
  ],
  schema: [
    '@/core-payments/schema/payments',
    '@/core-payments/schema/billing-profile',
  ],
  serverInit: [
    '@/config/deps/payments-deps',
  ],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [
    'config/deps/payments-deps.ts',
    'config/payment-providers.ts',
  ],
};

export default config;
