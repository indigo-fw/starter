import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-support',
  routers: [
    { name: 'supportChatRouter', key: 'supportChat', from: '@/core-support/routers/support-chat' },
    { name: 'supportRouter', key: 'support', from: '@/core-support/routers/support' },
  ],
  schema: [
    '@/core-support/schema/support-chat',
    '@/core-support/schema/support-tickets',
  ],
  serverInit: [
    '@/config/support-deps',
  ],
  jobs: [
    { name: 'startSupportChatCleanupWorker', from: '@/core-support/jobs/support-chat' },
  ],
  seed: [],
  layoutWidgets: [
    { name: 'SupportChatWidgetWrapper', from: '@/components/public/SupportChatWidgetWrapper' },
  ],
  pageWidgets: [],
  navItems: [
    { groupId: 'settings', name: 'Support', href: '/dashboard/settings/support', icon: 'LifeBuoy' },
  ],
  projectFiles: [
    'config/support-deps.ts',
    'components/public/SupportChatWidgetWrapper.tsx',
    'app/dashboard/(panel)/settings/support/page.tsx',
    'app/dashboard/(panel)/settings/support/[id]/page.tsx',
    'app/dashboard/(panel)/settings/support/chat/[id]/page.tsx',
    'app/(public)/account/support/page.tsx',
    'app/(public)/account/support/new/page.tsx',
    'app/(public)/account/support/[id]/page.tsx',
  ],
};

export default config;
