import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-authors',
  routers: [
    { name: 'authorsRouter', key: 'authors', from: '@/core-authors/routers/authors' },
  ],
  schema: [
    '@/core-authors/schema/authors',
  ],
  serverInit: [],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'content', name: 'Authors', href: '/dashboard/authors', icon: 'Users' },
  ],
  projectFiles: [
    'app/(public)/author/[slug]/page.tsx',
    'app/dashboard/(panel)/authors/page.tsx',
    'app/dashboard/(panel)/authors/[id]/page.tsx',
  ],
};

export default config;
