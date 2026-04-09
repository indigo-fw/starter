import { count } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { bookingServices } from '@/core-booking/schema/services';
import { bookingSchedules } from '@/core-booking/schema/availability';

/**
 * Seed demo booking services with schedules.
 */
export async function seedBooking(
  db: PostgresJsDatabase,
  superadminUserId: string,
  context?: { userIds: string[]; orgIds: string[] },
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  const orgId = context?.orgIds?.[0];
  if (!orgId) {
    console.log('  No organization ID provided. Skipping booking seed.');
    return {};
  }

  // Idempotency check
  const [existing] = await db.select({ count: count() }).from(bookingServices);
  if ((existing?.count ?? 0) > 0) {
    console.log('  Booking services already exist. Skipping.');
    return {};
  }

  // Create demo services
  const services = [
    {
      id: crypto.randomUUID(),
      name: '30-Minute Consultation',
      slug: '30-minute-consultation',
      type: 'appointment' as const,
      status: 'published' as const,
      description: 'A quick 30-minute one-on-one consultation session.',
      shortDescription: 'Quick consultation call',
      durationMinutes: 30,
      bufferMinutes: 10,
      priceCents: 4900,
      currency: 'EUR',
      maxCapacity: 1,
      requiresApproval: false,
      cancellationDeadlineHours: 24,
      timezone: 'Europe/Berlin',
      sortOrder: 0,
    },
    {
      id: crypto.randomUUID(),
      name: '1-Hour Strategy Session',
      slug: '1-hour-strategy-session',
      type: 'appointment' as const,
      status: 'published' as const,
      description: 'An in-depth strategy session to discuss your project goals and roadmap.',
      shortDescription: 'Deep-dive strategy call',
      durationMinutes: 60,
      bufferMinutes: 15,
      priceCents: 14900,
      currency: 'EUR',
      maxCapacity: 1,
      requiresApproval: false,
      cancellationDeadlineHours: 48,
      timezone: 'Europe/Berlin',
      sortOrder: 1,
    },
    {
      id: crypto.randomUUID(),
      name: 'Group Workshop',
      slug: 'group-workshop',
      type: 'class' as const,
      status: 'published' as const,
      description: 'Interactive group workshop covering best practices and hands-on exercises.',
      shortDescription: 'Interactive group session (max 20)',
      durationMinutes: 120,
      bufferMinutes: 30,
      priceCents: 2900,
      currency: 'EUR',
      maxCapacity: 20,
      requiresApproval: false,
      cancellationDeadlineHours: 72,
      timezone: 'Europe/Berlin',
      sortOrder: 2,
    },
    {
      id: crypto.randomUUID(),
      name: 'Meeting Room A',
      slug: 'meeting-room-a',
      type: 'resource' as const,
      status: 'published' as const,
      description: 'Large meeting room with projector and whiteboard. Seats up to 12.',
      shortDescription: 'Large meeting room (12 seats)',
      durationMinutes: 60,
      bufferMinutes: 0,
      priceCents: 0,
      currency: 'EUR',
      maxCapacity: 1,
      location: 'Building A, Floor 2, Room 201',
      requiresApproval: true,
      timezone: 'Europe/Berlin',
      sortOrder: 3,
    },
  ];

  for (const service of services) {
    await db.insert(bookingServices).values({
      ...service,
      organizationId: orgId,
    });
  }

  // Create default schedules (Mon-Fri 9:00-17:00)
  const weekdaySchedules = [];
  for (const service of services) {
    for (let day = 1; day <= 5; day++) {
      weekdaySchedules.push({
        serviceId: service.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
        isActive: true,
      });
    }
  }

  await db.insert(bookingSchedules).values(weekdaySchedules);

  console.log(`  Created ${services.length} demo booking services with weekday schedules.`);

  return {};
}

/**
 * Check if booking seed data exists.
 */
export async function hasBookingData(db: PostgresJsDatabase): Promise<boolean> {
  const [result] = await db.select({ count: count() }).from(bookingServices);
  return (result?.count ?? 0) > 0;
}
