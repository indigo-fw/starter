import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-ai-writer',
  routers: [
    { name: 'aiWriterRouter', key: 'aiWriter', from: '@/core-ai-writer/routers/ai-writer' },
  ],
  schema: [],
  serverInit: [],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [],
};

export default config;
