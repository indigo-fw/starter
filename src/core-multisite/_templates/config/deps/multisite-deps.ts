/**
 * Wire core-multisite module dependencies.
 * Imported as a side-effect in server.ts.
 */
import { setMultisiteDeps } from '@/core-multisite/deps';

setMultisiteDeps({
  baseDomain: process.env.MULTISITE_BASE_DOMAIN ?? 'localhost',
});
