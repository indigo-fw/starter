import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-payments',
  routers: [],
  schema: [
    '@/core-payments/schema/payments',
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
