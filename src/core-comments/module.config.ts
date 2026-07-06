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
    '@/config/deps/comments-deps',
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
  contentSlots: [
    { slot: 'post-footer', name: 'CommentSection', from: '@/core-comments/components/CommentSection' },
    { slot: 'showcase-comments', name: 'useShowcaseComments', from: '@/components/public/useShowcaseComments' },
  ],
  projectFiles: [
    'config/deps/comments-deps.ts',
    'app/dashboard/(panel)/comments/page.tsx',
    'components/public/CommentPanel.tsx',
    'components/public/useShowcaseComments.tsx',
  ],
};

export default config;
