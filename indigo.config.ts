/**
 * Indigo module configuration.
 *
 * Each installed module exports its own config via module.config.ts.
 * Add/remove modules with: bun run indigo add/remove <module>
 * After editing manually: bun run indigo:sync
 */

import type { ModuleConfig } from '@/core/lib/module/module-config';

// ─── Primitives (horizontal building blocks) ────────────────────────────────
import corePayments from './src/core-payments/module.config';
import coreSubscriptions from './src/core-subscriptions/module.config';
import corePaymentsCrypto from './src/core-payments-crypto/module.config';
import coreDocs from './src/core-docs/module.config';
import coreComments from './src/core-comments/module.config';
import coreActivity from './src/core-activity/module.config';
import coreSupport from './src/core-support/module.config';
import coreAffiliates from './src/core-affiliates/module.config';
import coreAiWriter from './src/core-ai-writer/module.config';
import coreImport from './src/core-import/module.config';
import coreAuthors from './src/core-authors/module.config';
import coreApi from './src/core-api/module.config';

// ─── Products (vertical domain apps) ────────────────────────────────────────
import coreStore from './src/core-store/module.config';
import coreChat from './src/core-chat/module.config';
import coreBooking from './src/core-booking/module.config';

const modules: ModuleConfig[] = [
  // Primitives
  corePayments,
  coreSubscriptions,
  corePaymentsCrypto,
  coreDocs,
  coreComments,
  coreActivity,
  coreSupport,
  coreAffiliates,
  coreAiWriter,
  coreImport,
  coreAuthors,
  coreApi,
  // Products
  coreStore,
  coreChat,
  coreBooking,
];

export default modules;
