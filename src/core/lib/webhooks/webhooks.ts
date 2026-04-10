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

async function deliverWebhook(url: string, secret: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Webhook delivery failed: HTTP ${res.status} from ${url}`);
  }
}

// ---------------------------------------------------------------------------
// BullMQ worker
// ---------------------------------------------------------------------------

/** Start the webhook delivery worker. Call once from server.ts. */
export function startWebhookWorker() {
  return createWorker(WEBHOOK_QUEUE, async (job) => {
    const { url, secret, event, payload } = job.data as {
      url: string;
      secret: string;
      event: string;
      payload: Record<string, unknown>;
    };
    await deliverWebhook(url, secret, event, payload);
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

        if (queue) {
          // Enqueue with retry via BullMQ
          await queue
            .add(
              'deliver',
              { url: hook.url, secret: hook.secret, event, payload },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
              }
            )
            .catch((err: unknown) => {
              log.error('Failed to enqueue webhook job, attempting direct delivery', {
                url: hook.url,
                event,
                error: String(err),
              });
              // Fallback to fire-and-forget direct delivery
              deliverWebhook(hook.url, hook.secret, event, payload).catch((deliveryErr: unknown) => {
                log.warn('Direct webhook delivery also failed', { url: hook.url, event, error: String(deliveryErr) });
              });
            });
        } else {
          // No Redis — deliver directly (fire-and-forget)
          deliverWebhook(hook.url, hook.secret, event, payload).catch((err: unknown) => {
            log.warn('Webhook delivery failed', { url: hook.url, event, error: String(err) });
          });
        }
      }
    })
    .catch((err: unknown) => {
      log.error('Failed to query webhooks', { event, error: String(err) });
    });
}
