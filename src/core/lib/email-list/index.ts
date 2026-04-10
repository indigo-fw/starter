import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('email-list');

export interface EmailListProvider {
  /** Add or update a subscriber */
  subscribe(email: string, fields?: Record<string, unknown>): Promise<void>;
  /** Tag a subscriber (e.g., plan name, lifecycle stage) */
  tag(email: string, tags: string[]): Promise<void>;
}

type ProviderFactory = () => EmailListProvider;
const registry = new Map<string, ProviderFactory>();

/** Register a lazy-loaded email list provider */
export function registerEmailListProvider(id: string, factory: ProviderFactory): void {
  registry.set(id, factory);
}

function getActiveProvider(): EmailListProvider | null {
  const id = process.env.EMAIL_LIST_PROVIDER;
  if (!id) return null;
  const factory = registry.get(id);
  if (!factory) {
    log.warn('Email list provider not registered', { id });
    return null;
  }
  return factory();
}

/**
 * Sync a subscriber to the active email list provider.
 * Fire-and-forget — logs errors, never throws.
 */
export function syncSubscriber(
  email: string,
  fields?: Record<string, unknown>,
): void {
  const provider = getActiveProvider();
  if (!provider) return;
  provider.subscribe(email, fields).catch((err) => {
    log.error('Failed to sync subscriber', { email, error: String(err) });
  });
}

/**
 * Tag a subscriber in the active email list provider.
 * Fire-and-forget — logs errors, never throws.
 */
export function tagSubscriber(email: string, tags: string[]): void {
  const provider = getActiveProvider();
  if (!provider) return;
  provider.tag(email, tags).catch((err) => {
    log.error('Failed to tag subscriber', { email, tags, error: String(err) });
  });
}
