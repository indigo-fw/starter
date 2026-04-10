import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import type { PaymentProvider, CheckoutParams, CheckoutResult, WebhookEvent } from '@/core-payments/types/payment';
import { TransactionStatus } from '@/core-payments/types/payment';
import { db } from '@/server/db';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';
import { getPaymentsDeps } from '@/core-payments/deps';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('nowpayments');

function getApiBase(): string {
  const sandbox = process.env.NOWPAYMENTS_SANDBOX !== 'false';
  return sandbox ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
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
async function verifySignature(body: Record<string, unknown>, signatureHeader: string): Promise<boolean> {
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
    if (params.interval !== 'yearly') {
      throw new Error('NOWPayments only supports yearly interval');
    }

    const plan = getPaymentsDeps().getPlan(params.planId);
    if (!plan) throw new Error(`Plan not found: ${params.planId}`);

    const originalPriceCents = plan.priceYearly;
    if (originalPriceCents <= 0) throw new Error('Cannot checkout free plan with crypto');

    // Use discounted price if available
    const priceCents = params.finalPriceCents ?? originalPriceCents;
    if (priceCents <= 0) throw new Error('Discounted price cannot be zero for crypto payments');

    const discountAmountCents = originalPriceCents - priceCents;

    // Create local transaction record
    const [tx] = await db
      .insert(saasPaymentTransactions)
      .values({
        organizationId: params.organizationId,
        providerId: 'nowpayments',
        amountCents: priceCents,
        currency: 'usd',
        status: TransactionStatus.PENDING,
        planId: params.planId,
        interval: params.interval,
        discountCodeId: params.metadata?.discountCodeId ?? null,
        discountAmountCents: discountAmountCents > 0 ? discountAmountCents : 0,
        rawRequest: params.metadata as Record<string, unknown> ?? null,
      })
      .returning({ id: saasPaymentTransactions.id });

    const orderId = tx!.id;
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
      await db
        .update(saasPaymentTransactions)
        .set({ status: TransactionStatus.FAILED, updatedAt: new Date() })
        .where(eq(saasPaymentTransactions.id, orderId));
      throw new Error(`NOWPayments API error: ${response.status}`);
    }

    const data = (await response.json()) as { id: string; invoice_url: string };

    // Update transaction with provider reference
    await db
      .update(saasPaymentTransactions)
      .set({
        providerTxId: String(data.id),
        rawResponse: data as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(saasPaymentTransactions.id, orderId));

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
    const [tx] = await db
      .select()
      .from(saasPaymentTransactions)
      .where(eq(saasPaymentTransactions.id, orderId))
      .limit(1);

    if (!tx) {
      logger.warn('NOWPayments IPN for unknown order', { orderId });
      throw new Error(`Unknown order: ${orderId}`);
    }

    // Map NOWPayments status to our event types
    switch (paymentStatus) {
      case 'finished':
      case 'confirmed': {
        // Update transaction as successful
        await db
          .update(saasPaymentTransactions)
          .set({
            status: TransactionStatus.SUCCESSFUL,
            rawResponse: body,
            updatedAt: new Date(),
          })
          .where(eq(saasPaymentTransactions.id, orderId));

        // Merge checkout metadata (contains discountUsageId etc.) into providerData
        const checkoutMetadata = tx.rawRequest as Record<string, unknown> | null;
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

      case 'failed':
      case 'expired': {
        await db
          .update(saasPaymentTransactions)
          .set({
            status: TransactionStatus.FAILED,
            rawResponse: body,
            updatedAt: new Date(),
          })
          .where(eq(saasPaymentTransactions.id, orderId));

        return {
          type: 'payment.failed',
          organizationId: tx.organizationId,
          planId: tx.planId ?? undefined,
          providerData: body,
        };
      }

      case 'refunded': {
        await db
          .update(saasPaymentTransactions)
          .set({
            status: TransactionStatus.REFUNDED,
            rawResponse: body,
            updatedAt: new Date(),
          })
          .where(eq(saasPaymentTransactions.id, orderId));

        return {
          type: 'payment.refunded',
          organizationId: tx.organizationId,
          planId: tx.planId ?? undefined,
          providerData: body,
        };
      }

      default:
        logger.info('NOWPayments IPN unhandled status', { paymentStatus, orderId });
        return {
          type: 'subscription.updated',
          organizationId: tx.organizationId,
          providerData: body,
        };
    }
  }
}
