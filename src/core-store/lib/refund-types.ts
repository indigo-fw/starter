/**
 * Optional refund handler. Projects wire this via StoreDeps extension
 * or handle refunds directly in their payment webhook handler.
 *
 * Usage:
 *   import { setRefundHandler } from '@/core-store/lib/refund-types';
 *   setRefundHandler({ refundPayment: async (params) => stripe.refunds.create(...) });
 */

/**
 * Outcome contract the return-refund flow relies on:
 * - resolve with `status: 'succeeded'` (or omit `status`) → money moved, books are updated
 * - resolve with `status: 'failed'` → definitive decline, nothing moved; the
 *   return is released so it can be retried
 * - **throw** → outcome unknown (timeout, network). The return stays claimed
 *   in `refunding` and is never auto-retried — a human verifies at the
 *   provider first. Only throw when you genuinely don't know.
 */
export interface RefundResult {
  refundId?: string;
  status?: 'succeeded' | 'failed';
  failureReason?: string;
}

export interface RefundHandler {
  refundPayment: (params: {
    orderId: string;
    transactionId: string;
    amountCents: number;
    currency: string;
    reason?: string;
  }) => Promise<RefundResult>;
}

let _refundHandler: RefundHandler | null = null;

export function setRefundHandler(handler: RefundHandler): void {
  _refundHandler = handler;
}

export function getRefundHandler(): RefundHandler | null {
  return _refundHandler;
}
