import type { AttributionData } from '@/core-affiliates/lib/attribution';

declare module '@/core/lib/module/module-hooks' {
  interface HookMap {
    'payment.conversion': [userId: string, referenceId: string, amountCents: number];
    'attribution.capture': [userId: string, data: AttributionData];
  }
}
export {};
