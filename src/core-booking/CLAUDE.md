# core-booking — CLAUDE.md

Booking/scheduling system — services, availability, appointments, classes, resource reservations.

## Module Boundary

**core-booking owns:** Service/availability/booking schema, all routers, availability/booking/reminder/ical services, background worker.

**Project owns:** Admin pages, public booking pages, `config/deps/booking-deps.ts`, webhook handler for paid bookings.

## DI (`setBookingDeps()`)

`sendNotification`, `enqueueTemplateEmail`, `createPaymentCheckout` (optional, via core-payments), `getOrganizationName` (optional, for iCal).

## Service Types

`appointment` (1-on-1), `class` (group, capacity>1), `resource` (room/equipment), `event` (one-time).

## Booking Flow

Browse → select date → pick slot → create booking. If `requiresApproval` → pending. If `priceCents > 0` → pending until paid. Free + no approval → confirmed. Reminders at 24h and 1h. Background worker expires pending bookings.

## Key Details

- **Availability:** recurring weekly schedules + date overrides, timezone-aware, min/max advance hours
- **Race protection:** `SELECT FOR UPDATE` in transaction prevents double-booking. Booking number retry loop (up to 5)
- **Calendar:** iCal (.ics) with VALARM + Google Calendar URL
- **Worker:** runs every 60s — process reminders (batch JOIN, no N+1) + auto-cancel expired
- **Dependencies:** core (required), core-payments (optional for paid bookings)
