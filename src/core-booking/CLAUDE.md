# core-booking — CLAUDE.md

Paid module. Booking/scheduling system — services, availability, appointments, classes, resource reservations.

## Module Boundary

**core-booking owns:** Service schema, availability (schedules + overrides), booking schema + events + reminders, all booking routers, availability/booking/reminder services, background worker.

**Project owns:** Admin pages (`/dashboard/settings/bookings/`), public booking pages, dependency wiring (`config/booking-deps.ts`), webhook handler for payment completion (if using paid bookings).

## Import Rules

- Imports from `@/core/*` (core utilities — slug, admin-crud, logger, queue)
- Framework conventions: `@/server/trpc`, `@/server/db`, `@/server/lib/resolve-org`
- Notifications and email injected via `setBookingDeps()`
- Project imports from `@/core-booking/*`

## Dependency Injection

`deps.ts` defines `BookingDeps`. Injected deps:

- **sendNotification** — notify customer on booking status changes, reminders
- **enqueueTemplateEmail** — booking confirmation, reminder, cancellation emails
- **createPaymentCheckout** — optional: create payment session for paid bookings (via core-payments)

## Service Types

| Type | Description |
|------|-------------|
| `appointment` | 1-on-1 appointment (consultant, doctor, salon), capacity=1 |
| `class` | Group class (yoga, workshop, webinar), capacity>1 |
| `resource` | Resource reservation (room, equipment, court), capacity=1 |
| `event` | One-time event with limited capacity |

## Booking Flow

1. Customer browses published services → selects date → sees available slots
2. Customer picks slot → creates booking (logged-in or guest)
3. If `requiresApproval` → status=pending, admin confirms
4. If `priceCents > 0` → status=pending until payment confirmed
5. If free + no approval → status=confirmed immediately
6. Reminders sent 24h and 1h before start time
7. Expired pending bookings auto-cancelled by background worker

## Availability System

- **Recurring schedules:** Weekly pattern (day_of_week + start/end time)
- **Date overrides:** Holiday closures, special hours for specific dates
- **Slot generation:** Duration + buffer minutes, respects capacity limits
- **Advance booking:** Min/max advance hours configurable per service

## Background Worker

`startBookingWorker()` runs every 60s:
- Process due reminders (email + in-app notification)
- Auto-cancel expired pending bookings

## Wiring Into a Project

1. **Deps:** Copy `_templates/config/booking-deps.ts` → `src/config/booking-deps.ts`, import in server.ts
2. **Config:** Add to `indigo.config.ts`, run `bun run indigo:sync`
3. **Migrate:** `bun run db:generate && bun run db:migrate`
4. **Seed:** Run `bun run init` to create demo services
5. **Pages:** Build booking pages (service list, calendar/slot picker, booking form, my bookings)

## Optional: Paid Bookings

Uncomment `createPaymentCheckout` in `config/booking-deps.ts` to enable payment processing via core-payments. Then handle the webhook to confirm booking on successful payment.

## Dependencies

- **core (required)** — admin-crud, slug, logger, queue, notifications
- **core-payments (optional)** — for paid booking checkout
