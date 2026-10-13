import crypto from 'crypto';

import { getPaymentsDeps } from '@/core-payments/deps';
import {
  type TransactionRow,
  createTransaction,
  getNowPaymentsApiBase,
  getTransaction,
  updateTransactionProvider,
  updateTransactionStatus,
} from '@/core-payments/lib/transaction-service';
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentProvider,
  WebhookEvent,
} from '@/core-payments/types/payment';
import { TransactionStatus } from '@/core-payments/types/payment';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('nowpayments');

function getApiBase(): string {
  return getNowPaymentsApiBase();
}

function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error('NOWPAYMENTS_API_KEY is not configured');
  return key;
}

function getIpnSecret(): string {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) throw new Error('NOWPAYMENTS_IPN_SECRET is not configured');
  return secret;
}

/**
 * Sort object keys recursively for HMAC verification.
 */
function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      sorted[key] = sortObject(val as Record<string, unknown>);
    } else {
      sorted[key] = val;
    }
  }
  return sorted;
}

/**
 * Verify NOWPayments IPN HMAC-SHA512 signature.
 */
async function verifySignature(
  body: Record<string, unknown>,
  signatureHeader: string
): Promise<boolean> {
  const secret = getIpnSecret();
  const sorted = sortObject(body);
  const payload = JSON.stringify(sorted);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class NowPaymentsProvider implements PaymentProvider {
  config = {
    id: 'nowpayments',
    name: 'NOWPayments',
    description: 'Cryptocurrency payments via NOWPayments',
    supportsRecurring: false,
    enabled: !!process.env.NOWPAYMENTS_API_KEY,
    allowedIntervals: ['yearly'] as ('monthly' | 'yearly')[],
  };

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    if (params.mode === 'payment') {
      throw new Error('NOWPayments does not support one-time payments');
    }

    if (params.interval !== 'yearly') {
      throw new Error('NOWPayments only supports yearly interval');
    }

    const plan = getPaymentsDeps().getPlan(params.planId);
    if (!plan) throw new Error(`Plan not found: ${params.planId}`);

    const originalPriceCents = plan.priceYearly;
    if (originalPriceCents <= 0)
      throw new Error('Cannot checkout free plan with crypto');

    // Use discounted price if available
    const priceCents = params.finalPriceCents ?? originalPriceCents;
    if (priceCents <= 0)
      throw new Error('Discounted price cannot be zero for crypto payments');

    const discountAmountCents = originalPriceCents - priceCents;

    // Create local transaction record
    const orderId = await createTransaction({
      organizationId: params.organizationId,
      providerId: 'nowpayments',
      amountCents: priceCents,
      currency: 'usd',
      planId: params.planId,
      interval: params.interval,
      discountCodeId: (params.metadata?.discountCodeId as string) ?? null,
      discountAmountCents: discountAmountCents > 0 ? discountAmountCents : 0,
      metadata: (params.metadata as Record<string, unknown>) ?? null,
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    // Create NOWPayments invoice
    const response = await fetch(`${getApiBase()}/v1/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: priceCents / 100,
        price_currency: 'usd',
        order_id: orderId,
        order_description: `${plan.name} plan (yearly)`,
        ipn_callback_url: `${appUrl}/api/webhooks/nowpayments`,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('NOWPayments invoice creation failed', { error, orderId });
      // Clean up orphaned transaction
      await updateTransactionStatus(orderId, TransactionStatus.FAILED);
      throw new Error(`NOWPayments API error: ${response.status}`);
    }

    const data = (await response.json()) as { id: string; invoice_url: string };

    // Update transaction with provider reference
    await updateTransactionProvider(
      orderId,
      String(data.id),
      data as unknown as Record<string, unknown>
    );

    return {
      url: data.invoice_url,
      transactionId: orderId,
      providerId: 'nowpayments',
    };
  }

  async handleWebhook(request: Request): Promise<WebhookEvent> {
    const body = (await request.json()) as Record<string, unknown>;
    const signature = request.headers.get('x-nowpayments-sig');

    if (!signature) {
      throw new Error('Missing NOWPayments IPN signature');
    }

    const valid = await verifySignature(body, signature);
    if (!valid) {
      throw new Error('Invalid NOWPayments IPN signature');
    }

    const paymentStatus = body.payment_status as string;
    const orderId = body.order_id as string;

    // Look up our transaction
    const tx = await getTransaction(orderId);

    if (!tx) {
      logger.warn('NOWPayments IPN for unknown order', { orderId });
      throw new Error(`Unknown order: ${orderId}`);
    }

    // Map NOWPayments status to our event types. IPNs arrive out of order and
    // are redelivered, so every status write is a compare-and-set on the
    // transaction row — the row is the state machine, the route's per-event
    // dedupe only stops exact replays. See the transition table in
    // `__tests__/nowpayments-provider.test.ts`.
    switch (paymentStatus) {
      case 'finished': {
        // Only `finished` means the full amount settled. `confirmed` is an
        // on-chain confirmation that can still be partial, so it must not
        // activate (it used to, and both IPNs activated the plan twice).
        // Resurrect from FAILED too: a signed `finished` after a slow
        // confirmation is real money. Never override REFUNDED.
        const won = await updateTransactionStatus(
          orderId,
          TransactionStatus.SUCCESSFUL,
          body,
          [TransactionStatus.PENDING, TransactionStatus.FAILED]
        );

        if (!won) {
          if (tx.status === TransactionStatus.REFUNDED) {
            logger.error(
              'NOWPayments finished IPN for a refunded transaction — manual review needed',
              {
                orderId,
                paymentId: body.payment_id,
              }
            );
          }
          // Already SUCCESSFUL (a concurrent IPN won the CAS) — safe no-op.
          return noopEvent(tx, body);
        }

        // Merge checkout metadata (contains discountUsageId etc.) into providerData
        const checkoutMetadata = tx.rawRequest as Record<
          string,
          unknown
        > | null;
        return {
          type: 'subscription.activated',
          organizationId: tx.organizationId,
          planId: tx.planId ?? undefined,
          status: 'active',
          providerCustomerId: `np_org_${tx.organizationId}`,
          providerData: { ...body, ...checkoutMetadata },
          // Crypto = one-time. Set period end to 365 days from now.
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        };
      }

      case 'partially_paid': {
        // Store the payload for support, keep waiting for the remainder.
        await updateTransactionStatus(
          orderId,
          TransactionStatus.PENDING,
          body,
          [TransactionStatus.PENDING]
        );
        logger.warn('NOWPayments partial payment received', {
          orderId,
          actuallyPaid: body.actually_paid,
          expectedAmount: body.price_amount,
        });
        return noopEvent(tx, body);
      }

      case 'failed':
      case 'expired': {
        // Only a still-pending payment can fail; a late failure must not
        // overwrite a SUCCESSFUL/REFUNDED row or notify a paying customer.
        const won = await updateTransactionStatus(
          orderId,
          TransactionStatus.FAILED,
          body,
          [TransactionStatus.PENDING]
        );
        if (!won) {
          logger.warn(
            'NOWPayments failed/expired IPN did not match a pending transaction (ignored)',
            {
              orderId,
              paymentStatus,
              currentStatus: tx.status,
            }
          );
          return noopEvent(tx, body);
        }

        return {
          type: 'payment.failed',
          organizationId: tx.organizationId,
          planId: tx.planId ?? undefined,
          providerData: body,
        };
      }

      case 'refunded': {
        // Refund only a real charge (PENDING covers a refund issued before our
        // `finished` arrived); never resurrect a FAILED row or re-refund.
        const won = await updateTransactionStatus(
          orderId,
          TransactionStatus.REFUNDED,
          body,
          [TransactionStatus.PENDING, TransactionStatus.SUCCESSFUL]
        );
        if (!won) {
          logger.warn(
            'NOWPayments refunded IPN did not match a pending/successful transaction (ignored)',
            {
              orderId,
              currentStatus: tx.status,
            }
          );
          return noopEvent(tx, body);
        }

        return {
          type: 'payment.refunded',
          organizationId: tx.organizationId,
          planId: tx.planId ?? undefined,
          providerData: body,
        };
      }

      default:
        // waiting / confirming / confirmed / sending: progress only. Record
        // the latest payload while pending so support can see where a stuck
        // payment is.
        await updateTransactionStatus(
          orderId,
          TransactionStatus.PENDING,
          body,
          [TransactionStatus.PENDING]
        );
        logger.info('NOWPayments IPN progress status', {
          paymentStatus,
          orderId,
        });
        return noopEvent(tx, body);
    }
  }
}

/**
 * An event the subscription handler treats as a no-op: `subscription.updated`
 * without a `providerSubscriptionId` bails before touching anything. Used for
 * progress IPNs and for transitions the CAS rejected, so the route still
 * records the delivery and answers 200 without activating or notifying.
 */
function noopEvent(
  tx: TransactionRow,
  body: Record<string, unknown>
): WebhookEvent {
  return {
    type: 'subscription.updated',
    organizationId: tx.organizationId,
    providerData: body,
  };
}
