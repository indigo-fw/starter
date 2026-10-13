/**
 * Email-list sync (Mailchimp, Brevo, …) — queued, retried, PII-light logs.
 *
 * Provider calls used to run inline with `.catch(log)`: one 429 or 5xx and a
 * lifecycle tag was lost for good, and the failure log carried the raw address.
 * Jobs now ride BullMQ with the email retry policy, or the DB task queue when
 * Redis is absent, and logs carry a hash of the address instead.
 */
import { UnrecoverableError } from 'bullmq';
import { createHash } from 'node:crypto';

import { createLogger, markLogged } from '@/core/lib/infra/logger';
import { createWorker, getOrCreateQueue } from '@/core/lib/infra/queue';

const log = createLogger('email-list');

export const EMAIL_LIST_QUEUE = 'email-list';

// Same envelope as the email worker's default: provider rate limits and
// outages clear well within six attempts spread from 5 min upward.
const RETRY_POLICY = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 5 * 60_000 },
};
const DB_POLL_INTERVAL_MS = 10_000;

export interface EmailListProvider {
  /** Add or update a subscriber. Throw `EmailListProviderError` on failure so the job retries. */
  subscribe(email: string, fields?: Record<string, unknown>): Promise<void>;
  /** Tag a subscriber (e.g., plan name, lifecycle stage). Throw on failure so the job retries. */
  tag(email: string, tags: string[]): Promise<void>;
}

/**
 * A provider call that came back non-2xx. Carries the status so the worker can
 * tell a retryable 429/5xx from a 4xx that will fail identically every time.
 */
export class EmailListProviderError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'EmailListProviderError';
  }
}

export type EmailListJob =
  | { op: 'subscribe'; email: string; fields?: Record<string, unknown> }
  | { op: 'tag'; email: string; tags: string[] };

type ProviderFactory = () => EmailListProvider;
const registry = new Map<string, ProviderFactory>();

/** Short, stable stand-in for an address in logs — never the address itself. */
export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 12);
}

/**
 * Register a lazy-loaded email list provider. The sync worker that consumes
 * the queued jobs is started explicitly by server.ts (`startEmailListWorker`)
 * alongside the other workers — never as a side effect of registration.
 */
export function registerEmailListProvider(
  id: string,
  factory: ProviderFactory
): void {
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

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

async function enqueueJob(job: EmailListJob): Promise<void> {
  const queue = getOrCreateQueue(EMAIL_LIST_QUEUE);
  if (queue) {
    await queue.add(job.op, job, RETRY_POLICY);
    return;
  }
  // No Redis: the DB task queue still retries (unlike the old inline call).
  const { enqueueTask } = await import('@/core/lib/infra/db-queue');
  await enqueueTask(EMAIL_LIST_QUEUE, job, {
    maxAttempts: RETRY_POLICY.attempts,
  });
}

/**
 * Sync a subscriber to the active email list provider.
 * Fire-and-forget — the provider call runs in the worker; logs errors, never throws.
 */
export function syncSubscriber(
  email: string,
  fields?: Record<string, unknown>
): void {
  if (!getActiveProvider()) return;
  enqueueJob({ op: 'subscribe', email, fields }).catch((err: unknown) => {
    log.error('Failed to enqueue subscriber sync', {
      emailHash: hashEmail(email),
      error: String(err),
    });
  });
}

/**
 * Tag a subscriber in the active email list provider.
 * Fire-and-forget — the provider call runs in the worker; logs errors, never throws.
 */
export function tagSubscriber(email: string, tags: string[]): void {
  if (!getActiveProvider()) return;
  enqueueJob({ op: 'tag', email, tags }).catch((err: unknown) => {
    log.error('Failed to enqueue subscriber tag', {
      emailHash: hashEmail(email),
      tags,
      error: String(err),
    });
  });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

function parseJob(payload: unknown): EmailListJob | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.email !== 'string') return null;
  if (p.op === 'subscribe') {
    const fields =
      p.fields && typeof p.fields === 'object'
        ? (p.fields as Record<string, unknown>)
        : undefined;
    return { op: 'subscribe', email: p.email, fields };
  }
  if (p.op === 'tag' && Array.isArray(p.tags)) {
    return { op: 'tag', email: p.email, tags: p.tags.map(String) };
  }
  return null;
}

/** Non-429 4xx fails identically on every retry; let the job die now. */
function isPermanentProviderError(err: unknown): boolean {
  return (
    err instanceof EmailListProviderError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 429
  );
}

/** Process one job. Exported for the worker and for tests. */
export async function processEmailListJob(payload: unknown): Promise<void> {
  const job = parseJob(payload);
  if (!job) {
    log.warn('Dropping malformed email-list job', { payload: typeof payload });
    return;
  }
  const provider = getActiveProvider();
  if (!provider) return;
  try {
    if (job.op === 'subscribe') await provider.subscribe(job.email, job.fields);
    else await provider.tag(job.email, job.tags);
  } catch (err) {
    log.error('Email-list provider call failed', {
      op: job.op,
      emailHash: hashEmail(job.email),
      error: String(err),
    });
    throw markLogged(
      isPermanentProviderError(err) ? new UnrecoverableError(String(err)) : err
    );
  }
}

let workerStarted = false;

/**
 * Start the sync worker: BullMQ when Redis is configured, else the DB task
 * queue poller. Idempotent; normally triggered by registerEmailListProvider.
 */
export function startEmailListWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  const worker = createWorker(
    EMAIL_LIST_QUEUE,
    (job) => processEmailListJob(job.data),
    2
  );
  if (worker) return;
  import('@/core/lib/infra/db-queue')
    .then(({ startDbQueueWorker }) => {
      startDbQueueWorker(
        EMAIL_LIST_QUEUE,
        processEmailListJob,
        DB_POLL_INTERVAL_MS
      );
    })
    .catch((err: unknown) => {
      workerStarted = false;
      log.error('Failed to start email-list DB queue worker', {
        error: String(err),
      });
    });
}
