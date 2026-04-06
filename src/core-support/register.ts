/**
 * core-support module registration entrypoint.
 *
 * Re-exports everything needed to wire this module into a project:
 * - Router: add to your _app.ts
 * - Schema: re-export from your schema/index.ts
 * - Jobs: start worker from server.ts
 * - Config: override defaults in your project config
 * - Components: use in your app layer
 */

// Routers
export { supportChatRouter } from './routers/support-chat';
export { supportRouter } from './routers/support';

// Schema
export { saasSupportChatSessions, saasSupportChatMessages } from './schema/support-chat';
export { saasTickets, saasTicketMessages } from './schema/support-tickets';

// Jobs
export { startSupportChatCleanupWorker, cleanupStaleSessions } from './jobs/support-chat';

// Config
export { supportChatConfig, setSupportConfig } from './config';
export type { SupportChatConfig } from './config';

// Dependencies (call setSupportDeps at startup)
export { setSupportDeps, getSupportDeps } from './deps';
export type { SupportDeps, EscalationResult, UserInfo } from './deps';

// Components
export { SupportChatWidget } from './components/SupportChatWidget';
