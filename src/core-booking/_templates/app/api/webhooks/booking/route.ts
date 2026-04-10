/**
 * Webhook handler for booking payment confirmation.
 *
 * This route receives payment success callbacks (from Stripe or other providers)
 * and confirms the booking by updating its status to 'confirmed'.
 *
 * Wire this up based on your payment provider. The example below shows Stripe
 * checkout.session.completed handling. Adapt to your provider's webhook format.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookings } from '@/core-booking/schema/bookings';
import { updateBookingStatus } from '@/core-booking/lib/booking-service';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('booking-webhook');

export async function POST(request: Request) {
  // ─── 1. Verify webhook signature ──────────────────────────────────────
  // Replace with your provider's signature verification.
  // For Stripe: use stripe.webhooks.constructEvent(body, sig, secret)

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ─── 2. Extract booking ID from payment metadata ──────────────────────
  // Stripe example: event.data.object.metadata.bookingId
  // Adjust based on how you pass metadata in createPaymentCheckout

  const type = payload.type as string | undefined;
  if (type !== 'checkout.session.completed') {
    // Ignore events we don't care about
    return NextResponse.json({ received: true });
  }

  const session = (payload.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  const metadata = session?.metadata as Record<string, string> | undefined;
  const bookingId = metadata?.bookingId;

  if (!bookingId) {
    logger.warn('Booking webhook: no bookingId in metadata', { type });
    return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
  }

  // ─── 3. Verify booking exists and is pending ──────────────────────────

  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    logger.warn('Booking webhook: booking not found', { bookingId });
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.status !== 'pending') {
    // Already confirmed or in another state — idempotent
    logger.info('Booking webhook: already processed', { bookingId, status: booking.status });
    return NextResponse.json({ received: true, status: booking.status });
  }

  // ─── 4. Confirm the booking ───────────────────────────────────────────

  try {
    const transactionId = session?.payment_intent as string | undefined;

    // Update payment reference
    if (transactionId) {
      await db.update(bookings)
        .set({ paymentTransactionId: transactionId, paidAt: new Date() })
        .where(eq(bookings.id, bookingId));
    }

    // Confirm the booking (triggers notification + audit event)
    await updateBookingStatus(bookingId, 'confirmed', 'system', 'Payment confirmed');

    logger.info('Booking confirmed via webhook', { bookingId, transactionId });
    return NextResponse.json({ received: true, confirmed: true });
  } catch (err) {
    logger.error('Booking webhook: failed to confirm', { bookingId, error: String(err) });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
