import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-api',
  routers: [
    { name: 'apiKeysRouter', key: 'apiKeys', from: '@/core-api/routers/api-keys' },
  ],
  schema: [
    '@/core-api/schema/api-keys',
  ],
  serverInit: [
    '@/config/api-deps',
    '@/core-api/lib/api-init',
  ],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'settings', name: 'API Keys', href: '/dashboard/settings/api-keys', icon: 'KeyRound' },
  ],
  projectFiles: [
    'config/api-deps.ts',
    'app/dashboard/(panel)/settings/api-keys/page.tsx',
    'app/(public)/account/api/page.tsx',
    'app/api/v2/projects/route.ts',
    'app/api/v2/projects/[id]/route.ts',
  ],
};

export default config;
