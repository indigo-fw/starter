import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-multisite',
  routers: [
    { name: 'sitesRouter', key: 'sites', from: '@/core-multisite/routers/sites' },
  ],
  schema: [
    '@/core-multisite/schema/sites',
  ],
  serverInit: [
    '@/config/multisite-deps',
  ],
  jobs: [
    { name: 'startDnsVerificationWorker', from: '@/core-multisite/jobs/dns-verification' },
  ],
  seed: [
    {
      name: 'seedNetworkAdmin',
      from: '@/core-multisite/seed/network-admin',
      label: 'Network admin site',
      hasDataCheck: 'hasNetworkAdmin',
    },
  ],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'settings', name: 'Sites', href: '/dashboard/settings/sites', icon: 'Globe' },
  ],
  projectFiles: [
    'config/multisite-deps.ts',
    'scripts/site-create.ts',
    'scripts/site-delete.ts',
    'scripts/site-list.ts',
    'scripts/migrate-sites.ts',
    'scripts/site-suspend.ts',
    'scripts/site-unsuspend.ts',
    'scripts/site-restore.ts',
    'app/dashboard/(panel)/settings/sites/page.tsx',
    'app/dashboard/(panel)/settings/sites/[id]/page.tsx',
    'app/dashboard/(panel)/settings/sites/create/page.tsx',
  ],
};

export default config;
