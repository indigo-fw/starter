/**
 * core-booking dependency injection.
 *
 * Injects notifications, email, and optional payment checkout.
 * Framework conventions (trpc, db, user/org tables) imported directly.
 */

export interface BookingDeps {
  /**
   * Send a notification to a specific user.
   */
  sendNotification: (params: {
    userId: string;
    title: string;
    body: string;
    actionUrl?: string;
  }) => void;

  /**
   * Send a template email. Fire-and-forget.
   */
  enqueueTemplateEmail: (to: string, template: string, data: Record<string, unknown>) => Promise<void>;

  /**
   * Optional: create a one-time payment checkout session for a booking.
   * Returns the checkout URL to redirect the customer to.
   * If not provided, bookings are free or handled externally.
   */
  createPaymentCheckout?: (params: {
    bookingId: string;
    bookingNumber: string;
    totalCents: number;
    currency: string;
    customerEmail?: string;
    metadata: Record<string, string>;
  }) => Promise<string>;
}

let _deps: BookingDeps | null = null;

export function setBookingDeps(deps: BookingDeps): void {
  _deps = deps;
}

export function getBookingDeps(): BookingDeps {
  if (!_deps) {
    throw new Error(
      'Booking dependencies not configured. Call setBookingDeps() at startup — see src/core-booking/deps.ts',
    );
  }
  return _deps;
}
