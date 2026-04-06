# core-payments-crypto -- CLAUDE.md

Paid module. NOWPayments cryptocurrency payment provider for the core-payments system.

## Module Boundary

**core-payments-crypto owns:** NOWPayments provider implementation.

**Project owns:** Webhook route (`app/api/webhooks/nowpayments/`), NOWPayments entry in `config/payment-providers.ts`.

## Import Rules

- Imports from `@/core-payments/*` (types, schema, factory)
- Imports framework conventions: `@/server/db`, `@/core/lib/logger`
- Project imports from `@/core-payments-crypto/*`
- Depends on core-payments being installed

## Wiring Into a Project

1. **Register:** Import `@/core-payments-crypto/register` as side-effect in `server.ts`
2. **Provider config:** Add NOWPayments entry to `config/payment-providers.ts`
3. **Webhook:** Keep `app/api/webhooks/nowpayments/route.ts` in place (Next.js routing)
4. **Env vars:** Set `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`

The module auto-registers the provider via `registerPaymentProvider('nowpayments', ...)` when imported.
