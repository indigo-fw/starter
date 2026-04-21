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
    '@/config/deps/activity-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedActivity', from: '@/core-activity/seed', label: 'Demo activity events', hasDataCheck: 'hasActivityData' },
  ],
  layoutWidgets: [],
  pageWidgets: [
    { slot: 'dashboard', name: 'DashboardActivityWidget', from: '@/core-activity/components/DashboardActivityWidget' },
  ],
  dashboardWidgets: [
    {
      id: 'activity-feed',
      name: 'ActivityFeedDashboardWidget',
      from: '@/core-activity/components/ActivityFeedDashboardWidget',
      label: 'Activity Feed',
      colSpan: 12,
      minSpan: 6,
      maxSpan: 12,
      defaultVisible: true,
    },
  ],
  navItems: [
    { groupId: 'dashboard', name: 'Activity', href: '/dashboard/activity', icon: 'Activity' },
  ],
  projectFiles: [
    'config/deps/activity-deps.ts',
    'app/dashboard/(panel)/activity/page.tsx',
  ],
};

export default config;
