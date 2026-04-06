/**
 * Indigo module configuration.
 *
 * Each installed module exports its own config via module.config.ts.
 * Add/remove modules with: bun run indigo add/remove <module>
 * After editing manually: bun run indigo:sync
 */

import type { ModuleConfig } from '@/core/lib/module-config';

// ─── Installed modules (managed by `bun run indigo add/remove`) ─────────────
import corePayments from './src/core-payments/module.config';
import coreSubscriptions from './src/core-subscriptions/module.config';
import corePaymentsCrypto from './src/core-payments-crypto/module.config';
import coreSupport from './src/core-support/module.config';
import coreAffiliates from './src/core-affiliates/module.config';
import coreAiWriter from './src/core-ai-writer/module.config';
import coreImport from './src/core-import/module.config';
import coreDocs from './src/core-docs/module.config';
import coreStore from './src/core-store/module.config';
import coreChat from './src/core-chat/module.config';

const modules: ModuleConfig[] = [
  corePayments,
  coreSubscriptions,
  corePaymentsCrypto,
  coreSupport,
  coreAffiliates,
  coreAiWriter,
  coreImport,
  coreDocs,
  coreStore,
  coreChat,
];

export default modules;
