import type { WsChannel } from '@/core/types/realtime';

export const WS_CHANNELS: WsChannel[] = [
  {
    name: 'User notifications',
    pattern: 'user:*',
    requiresAuth: true,
  },
  {
    name: 'Organization events',
    pattern: 'org:*',
    requiresAuth: true,
  },
  {
    name: 'Content updates',
    pattern: 'content:*',
    requiresAuth: false,
  },
  {
    name: 'Admin broadcast',
    pattern: 'admin',
    requiresAuth: true,
  },
  {
    name: 'Support ticket',
    pattern: 'support:*',
    requiresAuth: true,
  },
  {
    name: 'Support chat',
    pattern: 'supportChat:*',
    requiresAuth: false,
  },
];
