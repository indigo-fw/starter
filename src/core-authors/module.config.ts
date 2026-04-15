import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-authors',
  category: 'primitive',
  routers: [
    { name: 'authorsRouter', key: 'authors', from: '@/core-authors/routers/authors' },
  ],
  schema: [
    '@/core-authors/schema/authors',
  ],
  serverInit: [],
  jobs: [],
  seed: [
    { name: 'seedAuthors', from: '@/core-authors/seed', label: 'Demo authors linked to blog posts', hasDataCheck: 'hasAuthorData' },
  ],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'content', name: 'Authors', href: '/dashboard/authors', icon: 'Users' },
  ],
  projectFiles: [
    'app/(public)/author/[slug]/page.tsx',
    'app/dashboard/(panel)/authors/page.tsx',
    'app/dashboard/(panel)/authors/[id]/page.tsx',
    'app/news-sitemap.xml/route.ts',
    'app/api/feed/author/[slug]/route.ts',
  ],
};

export default config;
