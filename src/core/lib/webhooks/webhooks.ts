import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import type { DbClient } from '@/server/db';
import { cmsWebhooks } from '@/server/db/schema/webhooks';
import { createLogger } from '@/core/lib/infra/logger';
import { createQueue, createWorker } from '@/core/lib/infra/queue';

const log = createLogger('webhooks');

// ---------------------------------------------------------------------------
// Delivery logger — set by server.ts to log deliveries to the DB
// ---------------------------------------------------------------------------

type DeliveryLoggerFn = (entry: {
  webhookId: string;
  event: string;
  status: 'success' | 'failed';
  statusCode?: number;
  error?: string;
  durationMs?: number;
}) => void;

let deliveryLogger: DeliveryLoggerFn | null = null;

/** Register a delivery logger (called from server.ts after DB is available). */
export function setWebhookDeliveryLogger(fn: DeliveryLoggerFn): void {
  deliveryLogger = fn;
}

/** Get the registered delivery logger (if any). */
export function getDeliveryLogger(): DeliveryLoggerFn | null {
  return deliveryLogger;
}

const WEBHOOK_QUEUE = 'webhook-delivery';

// Lazy-initialised queue — null when Redis is not available.
let _queue: ReturnType<typeof createQueue> | undefined;

function getWebhookQueue() {
  if (_queue === undefined) {
    _queue = createQueue(WEBHOOK_QUEUE);
  }
  return _queue;
}

// ---------------------------------------------------------------------------
// Internal delivery — shared between worker and direct fallback
// ---------------------------------------------------------------------------

interface DeliverArgs {
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

async function deliverWebhook(args: DeliverArgs): Promise<void> {
  const { webhookId, url, secret, event, payload } = args;
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  const logDelivery = getDeliveryLogger();
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body,
      // Fail a stalling endpoint instead of blocking the concurrency-1 queue.
      signal: AbortSignal.timeout(10_000),
      // Don't follow redirects — an attacker-controlled 3xx could point the
      // signed request at an internal service (SSRF).
      redirect: 'manual',
    });
  } catch (err: unknown) {
    logDelivery?.({
      webhookId,
      event,
      status: 'failed',
      error: String(err),
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }

  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    logDelivery?.({
      webhookId,
      event,
      status: 'failed',
      statusCode: res.status,
      error: `HTTP ${res.status}`,
      durationMs,
    });
    throw new Error(`Webhook delivery failed: HTTP ${res.status} from ${url}`);
  }

  logDelivery?.({
    webhookId,
    event,
    status: 'success',
    statusCode: res.status,
    durationMs,
  });
}

// ---------------------------------------------------------------------------
// BullMQ worker
// ---------------------------------------------------------------------------

/** Start the webhook delivery worker. Call once from server.ts. */
export function startWebhookWorker() {
  return createWorker(WEBHOOK_QUEUE, async (job) => {
    const { webhookId, url, secret, event, payload } = job.data as DeliverArgs;
    await deliverWebhook({ webhookId, url, secret, event, payload });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Dispatch webhook to all active hooks matching the event. Fire-and-forget. */
export function dispatchWebhook(
  db: DbClient,
  event: string,
  payload: Record<string, unknown>
): void {
  db.select()
    .from(cmsWebhooks)
    .where(eq(cmsWebhooks.active, true))
    .then(async (hooks) => {
      const queue = getWebhookQueue();

      for (const hook of hooks) {
        const events = hook.events as string[];
        if (!events.includes(event)) continue;

        const deliverArgs: DeliverArgs = {
          webhookId: hook.id,
          url: hook.url,
          secret: hook.secret,
          event,
          payload,
        };

        if (queue) {
          // Enqueue with retry via BullMQ
          await queue
            .add('deliver', deliverArgs, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            })
            .catch((err: unknown) => {
              log.error('Failed to enqueue webhook job, attempting direct delivery', {
                url: hook.url,
                event,
                error: String(err),
              });
              // Fallback to fire-and-forget direct delivery
              deliverWebhook(deliverArgs).catch((deliveryErr: unknown) => {
                log.warn('Direct webhook delivery also failed', { url: hook.url, event, error: String(deliveryErr) });
              });
            });
        } else {
          // No Redis — deliver directly (fire-and-forget)
          deliverWebhook(deliverArgs).catch((err: unknown) => {
            log.warn('Webhook delivery failed', { url: hook.url, event, error: String(err) });
          });
        }
      }
    })
    .catch((err: unknown) => {
      log.error('Failed to query webhooks', { event, error: String(err) });
    });
}
