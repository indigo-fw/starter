# core-subscriptions — CLAUDE.md

Subscription lifecycle — management, tokens, discounts, feature gates, dunning.

**Token functions live here:** `addTokens()`, `deductTokens()`, `expirePlanTokens()`,
`expireDueTokenLots()` — race-safe via per-org row lock (SELECT FOR UPDATE; lock order balance → lots).
Not in core. Balances have two buckets: `planBalance` (expiring, filled by subscription grants, spent
first) and `balance` (permanent: packs/bonuses/refunds). Totals everywhere = plan + purchased. Debits
record their `planUsed`/`purchasedUsed` split in the ledger. With `planTokenValidityMonths`, grants
become expiry lots (`saas_token_lots`), drained soonest-expiry-first, lazily expired on spend + daily
cron. Token ops accept `{ tx }` to compose into a caller's transaction (nested as savepoint).
`saas_subscriptions.interval` stores the billing interval at activation (period-length heuristic only
for legacy null rows).

## Billing modes

`config/billing.ts` (project) calls `setBillingConfig()` (`lib/billing-config.ts`) with one of:
`'subscription'` (plans only), `'subscription-tokens'` (plans + monthly grants via `plan.monthlyTokens`),
`'tokens'` (prepaid packs only — subscription checkout throws). Token packs, `signupBonusTokens`,
`resetBalanceOnGrant` (expire vs. rollover), and `yearlyTokenGrant` (`'monthly'` drip vs `'upfront'`
= monthlyTokens × 12 once per yearly period) live in the same config.

**Monthly grants** (`lib/token-grants.ts`): race-proof per `periodKey` (scheduled date anchored to
`currentPeriodStart`) via atomic compare-and-set on `saas_subscriptions.lastGrantPeriodKey` in the same
tx as the credit. Grants fill the plan bucket. Triggered by subscription webhooks (instant) + daily
`token-grants` cron in `server.ts` (keyset-paginated sweep: yearly-interval drip, missed webhooks).
**Token packs**: one-time Stripe checkout with `metadata.type='token_pack'`; the Stripe webhook route
branches to `handleTokenPackWebhookEvent()`.

**Project owns:** Plan definitions (`config/plans.ts`), billing mode + token packs (`config/billing.ts`), billing admin pages, `config/deps/subscriptions-deps.ts`.

## DI (`setSubscriptionsDeps()`)

`getPlans` / `getPlan` / `getPlanByProviderPriceId` / `getProviderPriceId`, `resolveOrgId`, `sendOrgNotification`, `enqueueTemplateEmail`, `broadcastEvent`.

## Cross-module

Only type imports from `@/core-payments/types/payment` (enums + interfaces). Payment provider/transaction access via DI.

## Wiring

1. Create `config/deps/subscriptions-deps.ts` → import in `server.ts`
2. Define plans in `config/plans.ts`, call `setPlanResolver()` for feature-gate
3. Routers/schema auto-registered via `indigo:sync`
4. Webhook routes stay in `app/api/webhooks/`
