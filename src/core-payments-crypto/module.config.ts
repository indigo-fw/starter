import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-payments-crypto',
  routers: [],
  schema: [],
  serverInit: [
    '@/core-payments-crypto/register',
  ],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [
    'app/api/webhooks/nowpayments/route.ts',
    'app/api/webhooks/nowpayments/__tests__/route.test.ts',
  ],
};

export default config;
