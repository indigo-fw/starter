import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { organization } from '@/server/db/schema/organization';
import { getPaymentsDeps } from '@/core-payments/deps';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    });
  }
  return stripeClient;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  return stripe;
}

interface BillingAddress {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  legalName?: string;
}

function toStripeAddress(addr: BillingAddress): Stripe.AddressParam | undefined {
  if (!addr.address1) return undefined;
  return {
    line1: addr.address1 ?? '',
    line2: addr.address2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postal_code: addr.postalCode ?? undefined,
    country: addr.country ?? undefined,
  };
}

export async function getOrCreateStripeCustomer(
  orgId: string,
  billingProfile?: BillingAddress,
): Promise<string> {
  const stripe = requireStripe();

  // Check existing subscription record (via DI — subscriptions module optional)
  const deps = getPaymentsDeps();
  if (deps.getActiveSubscriptionForOrg) {
    const existing = await deps.getActiveSubscriptionForOrg(orgId);
    if (existing?.providerCustomerId) return existing.providerCustomerId;
  }

  // Get org details
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  // Create Stripe customer with billing address
  const customer = await stripe.customers.create({
    name: billingProfile?.legalName ?? org?.name ?? 'Unknown',
    address: billingProfile ? toStripeAddress(billingProfile) : undefined,
    phone: billingProfile?.phone ?? undefined,
    metadata: { orgId },
  });

  return customer.id;
}

/**
 * Sync billing address to an existing Stripe customer.
 * Fire-and-forget — caller should catch errors.
 */
export async function syncStripeCustomerAddress(
  orgId: string,
  billingProfile: BillingAddress,
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  // Find Stripe customer ID for this org
  const deps = getPaymentsDeps();
  if (!deps.getActiveSubscriptionForOrg) return;

  const sub = await deps.getActiveSubscriptionForOrg(orgId);
  if (!sub?.providerCustomerId) return;

  await stripe.customers.update(sub.providerCustomerId, {
    name: billingProfile.legalName ?? undefined,
    address: toStripeAddress(billingProfile),
    phone: billingProfile.phone ?? undefined,
  });
}
