import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-chat',
  routers: [
    { name: 'characterRouter', key: 'characters', from: '@/core-chat/routers/characters' },
    { name: 'conversationRouter', key: 'conversations', from: '@/core-chat/routers/conversations' },
    { name: 'messageRouter', key: 'messages', from: '@/core-chat/routers/messages' },
    { name: 'chatPublicRouter', key: 'chatPublic', from: '@/core-chat/routers/chat-public' },
    { name: 'providerRouter', key: 'chatProviders', from: '@/core-chat/routers/providers' },
    { name: 'chatAdminRouter', key: 'chatAdmin', from: '@/core-chat/routers/chat-admin' },
    { name: 'chatMediaRouter', key: 'chatMedia', from: '@/core-chat/routers/media' },
    { name: 'taskQueueRouter', key: 'chatTaskQueue', from: '@/core-chat/routers/task-queue' },
    { name: 'voiceRouter', key: 'chatVoice', from: '@/core-chat/routers/voice' },
  ],
  schema: [
    '@/core-chat/schema/characters',
    '@/core-chat/schema/conversations',
    '@/core-chat/schema/messages',
    '@/core-chat/schema/media',
    '@/core-chat/schema/providers',
    '@/core-chat/schema/provider-logs',
    '@/core-chat/schema/reports',
    '@/core-chat/schema/audit',
    '@/core-chat/schema/voice-calls',
  ],
  serverInit: [
    '@/config/chat-deps',
  ],
  jobs: [
    { name: 'startChatAiWorker', from: '@/core-chat/lib/engine' },
    { name: 'startChatSummarizeWorker', from: '@/core-chat/jobs/summarize' },
    { name: 'startChatCleanupWorker', from: '@/core-chat/jobs/cleanup' },
    { name: 'startVideoOptimizationWorker', from: '@/core-chat/jobs/optimize-video' },
  ],
  seed: [
    { name: 'seedChatCharacters', from: '@/core-chat/seed/characters', label: 'Chat demo characters' },
  ],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'settings', name: 'Chat', href: '/dashboard/settings/chat', icon: 'MessageCircle' },
  ],
  projectFiles: [
    'config/chat-deps.ts',
    'app/(public)/chat/layout.tsx',
    'app/(public)/chat/page.tsx',
    'app/(public)/chat/[conversationId]/page.tsx',
    'app/dashboard/(panel)/settings/chat/page.tsx',
    'app/dashboard/(panel)/settings/chat/characters/page.tsx',
    'app/dashboard/(panel)/settings/chat/characters/[id]/page.tsx',
    'app/dashboard/(panel)/settings/chat/conversations/page.tsx',
    'app/dashboard/(panel)/settings/chat/conversations/[id]/page.tsx',
    'app/dashboard/(panel)/settings/chat/flagged/page.tsx',
    'app/dashboard/(panel)/settings/chat/providers/page.tsx',
    'app/dashboard/(panel)/settings/chat/stats/page.tsx',
  ],
};

export default config;
