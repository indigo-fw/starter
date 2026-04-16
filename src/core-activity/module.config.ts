import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-activity',
  category: 'primitive',
  routers: [
    { name: 'activityRouter', key: 'activity', from: '@/core-activity/routers/activity' },
  ],
  schema: [
    '@/core-activity/schema/activity',
  ],
  serverInit: [
    '@/config/activity-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedActivity', from: '@/core-activity/seed', label: 'Demo activity events', hasDataCheck: 'hasActivityData' },
  ],
  layoutWidgets: [],
  pageWidgets: [
    { slot: 'dashboard', name: 'DashboardActivityWidget', from: '@/core-activity/components/DashboardActivityWidget' },
  ],
  navItems: [
    { groupId: 'dashboard', name: 'Activity', href: '/dashboard/activity', icon: 'Activity' },
  ],
  projectFiles: [
    'config/activity-deps.ts',
    'app/dashboard/(panel)/activity/page.tsx',
  ],
};

export default config;
