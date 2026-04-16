import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-comments',
  category: 'primitive',
  routers: [
    { name: 'commentsRouter', key: 'comments', from: '@/core-comments/routers/comments' },
  ],
  schema: [
    '@/core-comments/schema/comments',
  ],
  serverInit: [
    '@/config/comments-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedComments', from: '@/core-comments/seed', label: 'Demo comments', hasDataCheck: 'hasCommentsData' },
  ],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'content', name: 'Comments', href: '/dashboard/comments', icon: 'MessageSquare' },
  ],
  projectFiles: [
    'config/comments-deps.ts',
    'app/dashboard/(panel)/comments/page.tsx',
  ],
};

export default config;
