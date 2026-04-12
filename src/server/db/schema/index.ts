// ─── Core schema (always present) ───────────────────────────────────────────
export * from './auth';
export * from './cms';
export * from './categories';
export * from './media';
export * from './terms';
export * from './term-relationships';
export * from './menu';
export * from './audit';
export * from './webhooks';
export * from './custom-fields';
export * from './forms';
export * from './portfolio';
export * from './showcase';
export * from './reactions';
export * from './translations';
export * from './user-preferences';
export * from './organization';
export * from './notifications';
export * from './projects';
export * from './task-queue';
export * from './webhook-deliveries';
export * from './push-subscriptions';

// ─── Module schema (from indigo.config.ts via `bun run indigo:sync`) ────────
export * from '@/generated/module-schema';
