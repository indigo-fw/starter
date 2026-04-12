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

export async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
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

  // Create Stripe customer
  const customer = await stripe.customers.create({
    name: org?.name ?? 'Unknown',
    metadata: { orgId },
  });

  return customer.id;
}
