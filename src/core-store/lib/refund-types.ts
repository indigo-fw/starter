/**
 * Optional refund handler. Projects wire this via StoreDeps extension
 * or handle refunds directly in their payment webhook handler.
 *
 * Usage:
 *   import { setRefundHandler } from '@/core-store/lib/refund-types';
 *   setRefundHandler({ refundPayment: async (params) => stripe.refunds.create(...) });
 */

export interface RefundHandler {
  refundPayment: (params: {
    orderId: string;
    transactionId: string;
    amountCents: number;
    currency: string;
    reason?: string;
  }) => Promise<{ refundId: string }>;
}

let _refundHandler: RefundHandler | null = null;

export function setRefundHandler(handler: RefundHandler): void {
  _refundHandler = handler;
}

export function getRefundHandler(): RefundHandler | null {
  return _refundHandler;
}
