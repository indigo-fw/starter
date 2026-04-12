import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-multisite',
  routers: [
    { name: 'sitesRouter', key: 'sites', from: '@/core-multisite/routers/sites' },
  ],
  schema: [
    '@/core-multisite/schema/sites',
  ],
  serverInit: [],
  jobs: [
    { name: 'startDnsVerificationWorker', from: '@/core-multisite/jobs/dns-verification' },
  ],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'settings', name: 'Sites', href: '/dashboard/settings/sites', icon: 'Globe' },
  ],
  projectFiles: [
    'config/multisite-deps.ts',
    'app/dashboard/(panel)/settings/sites/page.tsx',
    'app/dashboard/(panel)/settings/sites/[id]/page.tsx',
    'app/dashboard/(panel)/settings/sites/create/page.tsx',
  ],
};

export default config;
