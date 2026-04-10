import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock external dependencies BEFORE imports ─────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));

vi.mock('@/core/lib/infra/redis', () => ({ getRedis: vi.fn().mockReturnValue(null) }));
vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));
vi.mock('@/core/lib/api/trpc-rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/core/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({ canAccessAdmin: vi.fn().mockReturnValue(true), can: vi.fn().mockReturnValue(true) }),
  },
  Role: { USER: 'user', EDITOR: 'editor', ADMIN: 'admin', SUPERADMIN: 'superadmin' },
}));

vi.mock('@/core/crud/admin-crud', () => ({
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }),
  paginatedResult: vi.fn().mockImplementation(
    (items: unknown[], total: number, page: number, pageSize: number) => ({
      results: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    })
  ),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: vi.fn().mockImplementation((text: string) => text.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('@/server/lib/resolve-org', () => ({
  resolveOrgId: vi.fn().mockResolvedValue('cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa'),
}));

// ─── Mock schemas ──────────────────────────────────────────────────────────

vi.mock('@/core-booking/schema/services', () => ({
  bookingServices: {
    id: 'booking_services.id', organizationId: 'booking_services.organization_id',
    name: 'booking_services.name', slug: 'booking_services.slug',
    type: 'booking_services.type', status: 'booking_services.status',
    durationMinutes: 'booking_services.duration_minutes',
    bufferMinutes: 'booking_services.buffer_minutes',
    priceCents: 'booking_services.price_cents', currency: 'booking_services.currency',
    maxCapacity: 'booking_services.max_capacity',
    requiresApproval: 'booking_services.requires_approval',
    cancellationDeadlineHours: 'booking_services.cancellation_deadline_hours',
    location: 'booking_services.location', timezone: 'booking_services.timezone',
    featuredImage: 'booking_services.featured_image',
    shortDescription: 'booking_services.short_description',
    description: 'booking_services.description',
    sortOrder: 'booking_services.sort_order',
    deletedAt: 'booking_services.deleted_at',
    createdAt: 'booking_services.created_at',
    updatedAt: 'booking_services.updated_at',
    metadata: 'booking_services.metadata',
    minAdvanceHours: 'booking_services.min_advance_hours',
    maxAdvanceHours: 'booking_services.max_advance_hours',
  },
  bookingServiceColumns: {},
}));

vi.mock('@/core-booking/schema/availability', () => ({
  bookingSchedules: { id: 'id', serviceId: 'service_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time', isActive: 'is_active' },
  bookingOverrides: { id: 'id', serviceId: 'service_id', date: 'date', isUnavailable: 'is_unavailable', startTime: 'start_time', endTime: 'end_time', reason: 'reason' },
}));

vi.mock('@/core-booking/schema/bookings', () => ({
  bookings: { id: 'bookings.id', organizationId: 'bookings.organization_id', serviceId: 'bookings.service_id', bookingNumber: 'bookings.booking_number', userId: 'bookings.user_id', guestName: 'bookings.guest_name', guestEmail: 'bookings.guest_email', status: 'bookings.status', startTime: 'bookings.start_time', endTime: 'bookings.end_time', attendees: 'bookings.attendees', priceCents: 'bookings.price_cents', currency: 'bookings.currency', serviceSnapshot: 'bookings.service_snapshot', customerNote: 'bookings.customer_note', adminNote: 'bookings.admin_note', createdAt: 'bookings.created_at' },
  bookingEvents: { id: 'id', bookingId: 'booking_id', createdAt: 'created_at' },
  bookingReminders: { id: 'id', bookingId: 'booking_id', status: 'status', scheduledAt: 'scheduled_at' },
}));

// ─── Mock services ─────────────────────────────────────────────────────────

const BOOKING_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SERVICE_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ORG_ID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';

const mockCreateBooking = vi.fn().mockResolvedValue({ bookingId: BOOKING_ID, bookingNumber: 'BOOK-20260410-0001' });
const mockCancelBooking = vi.fn().mockResolvedValue(undefined);
const mockUpdateBookingStatus = vi.fn().mockResolvedValue(undefined);

vi.mock('@/core-booking/lib/booking-service', () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
  cancelBooking: (...args: unknown[]) => mockCancelBooking(...args),
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
}));

const mockIsSlotAvailable = vi.fn().mockResolvedValue(true);
vi.mock('@/core-booking/lib/availability-service', () => ({
  getAvailableSlots: vi.fn().mockResolvedValue([
    { startTime: new Date('2026-04-10T08:00:00Z'), endTime: new Date('2026-04-10T09:00:00Z'), availableCapacity: 1 },
  ]),
  getAvailableDatesInRange: vi.fn().mockResolvedValue(['2026-04-10', '2026-04-11']),
  isSlotAvailable: (...args: unknown[]) => mockIsSlotAvailable(...args),
}));

vi.mock('@/core-booking/lib/ical-service', () => ({
  generateIcal: vi.fn().mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
  generateGoogleCalendarUrl: vi.fn().mockReturnValue('https://calendar.google.com/calendar/render?action=TEMPLATE'),
}));

const mockBookingDeps = {
  sendNotification: vi.fn(),
  enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/core-booking/deps', () => ({
  getBookingDeps: () => mockBookingDeps,
  setBookingDeps: vi.fn(),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import { bookingServicesRouter } from '@/core-booking/routers/services';
import { bookingAvailabilityRouter } from '@/core-booking/routers/availability';
import { bookingBookingsRouter } from '@/core-booking/routers/bookings';

// ─── Helpers ───────────────────────────────────────────────────────────────

function thenable(data: unknown, extra: Record<string, unknown> = {}) {
  return { then: (r: (v: unknown) => void, e?: (v: unknown) => void) => Promise.resolve(data).then(r, e), ...extra };
}

function createSelectChain(data: unknown) {
  const forMock = vi.fn().mockReturnValue(thenable(data, { limit: vi.fn().mockResolvedValue(data) }));
  const limitMock = vi.fn().mockReturnValue(thenable(data, { for: forMock }));
  const offsetMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock }));
  const orderByMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock, offset: offsetMock }));
  const whereMock = vi.fn().mockReturnValue(thenable(data, { orderBy: orderByMock, limit: limitMock, offset: offsetMock, for: forMock }));
  const innerJoinMock = vi.fn().mockReturnValue(thenable(data, { where: whereMock, orderBy: orderByMock, limit: limitMock, innerJoin: vi.fn() }));
  const fromMock = vi.fn().mockReturnValue(thenable(data, { where: whereMock, orderBy: orderByMock, limit: limitMock, offset: offsetMock, innerJoin: innerJoinMock }));
  return { from: fromMock, where: whereMock, orderBy: orderByMock, limit: limitMock, offset: offsetMock };
}

function createCtx(overrides: Record<string, unknown> = {}) {
  const selectChain = createSelectChain([]);
  return {
    session: { user: { id: 'user-1', email: 'test@test.com', role: 'admin' }, session: { id: 'session-1' } },
    activeOrganizationId: ORG_ID,
    headers: new Headers(),
    db: {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    },
    ...overrides,
  };
}

function createPublicCtx(overrides: Record<string, unknown> = {}) {
  return createCtx({ session: null, ...overrides });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('bookingServicesRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('adminList', () => {
    it('returns paginated services', async () => {
      const ctx = createCtx();
      const caller = bookingServicesRouter.createCaller(ctx as never);
      const result = await caller.adminList({});
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
    });
  });

  describe('create', () => {
    it('creates a service and returns id + slug', async () => {
      const ctx = createCtx();
      const caller = bookingServicesRouter.createCaller(ctx as never);
      const result = await caller.create({ name: 'Consultation' });
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('slug');
      expect(ctx.db.insert).toHaveBeenCalled();
    });
  });

  describe('adminGet', () => {
    it('throws NOT_FOUND when service does not exist', async () => {
      const ctx = createCtx();
      const caller = bookingServicesRouter.createCaller(ctx as never);
      await expect(caller.adminGet({ id: SERVICE_ID })).rejects.toThrow(/not found/i);
    });
  });

  describe('delete', () => {
    it('throws NOT_FOUND when service does not exist', async () => {
      const ctx = createCtx();
      const caller = bookingServicesRouter.createCaller(ctx as never);
      await expect(caller.delete({ id: SERVICE_ID })).rejects.toThrow(/not found/i);
    });
  });
});

describe('bookingAvailabilityRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getSlots', () => {
    it('returns available slots for a date', async () => {
      const ctx = createPublicCtx();
      const caller = bookingAvailabilityRouter.createCaller(ctx as never);
      const result = await caller.getSlots({ serviceId: SERVICE_ID, date: '2026-04-10' });
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('startTime');
      expect(result[0]).toHaveProperty('availableCapacity');
    });
  });

  describe('getAvailableDates', () => {
    it('returns dates with available slots', async () => {
      const ctx = createPublicCtx();
      const caller = bookingAvailabilityRouter.createCaller(ctx as never);
      const result = await caller.getAvailableDates({ serviceId: SERVICE_ID, from: '2026-04-01', to: '2026-04-30' });
      expect(result).toEqual(['2026-04-10', '2026-04-11']);
    });
  });

  describe('setSchedule', () => {
    it('rejects end time before start time', async () => {
      const ctx = createCtx();
      // Need a service to exist
      const selectChain = createSelectChain([{ id: SERVICE_ID }]);
      ctx.db.select = vi.fn().mockReturnValue(selectChain);
      const caller = bookingAvailabilityRouter.createCaller(ctx as never);
      await expect(caller.setSchedule({
        serviceId: SERVICE_ID,
        schedules: [{ dayOfWeek: 1, startTime: '17:00', endTime: '09:00' }],
      })).rejects.toThrow('Start time must be before end time');
    });
  });
});

describe('bookingBookingsRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('creates a booking for logged-in user', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      const result = await caller.create({
        serviceId: SERVICE_ID,
        startTime: '2026-04-10T08:00:00Z',
        endTime: '2026-04-10T09:00:00Z',
      });
      expect(result).toEqual({ bookingId: BOOKING_ID, bookingNumber: 'BOOK-20260410-0001' });
      expect(mockCreateBooking).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        userEmail: 'test@test.com',
        serviceId: SERVICE_ID,
      }));
    });

    it('passes userEmail from session to createBooking', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      await caller.create({
        serviceId: SERVICE_ID,
        startTime: '2026-04-10T08:00:00Z',
        endTime: '2026-04-10T09:00:00Z',
      });
      expect(mockCreateBooking).toHaveBeenCalledWith(
        expect.objectContaining({ userEmail: 'test@test.com' }),
      );
    });
  });

  describe('createGuest', () => {
    it('creates a guest booking', async () => {
      const ctx = createPublicCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      const result = await caller.createGuest({
        serviceId: SERVICE_ID,
        organizationId: ORG_ID,
        startTime: '2026-04-10T08:00:00Z',
        endTime: '2026-04-10T09:00:00Z',
        guestName: 'Jane Doe',
        guestEmail: 'jane@example.com',
      });
      expect(result.bookingNumber).toBe('BOOK-20260410-0001');
      expect(mockCreateBooking).toHaveBeenCalledWith(expect.objectContaining({
        guestName: 'Jane Doe',
        guestEmail: 'jane@example.com',
      }));
    });
  });

  describe('myBookings', () => {
    it('returns paginated bookings for current user', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      const result = await caller.myBookings({});
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
    });
  });

  describe('cancel', () => {
    it('throws NOT_FOUND when booking does not belong to user', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      await expect(caller.cancel({ id: BOOKING_ID })).rejects.toThrow(/not found/i);
    });
  });

  describe('reschedule', () => {
    it('throws NOT_FOUND when booking does not belong to user', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      await expect(caller.reschedule({
        id: BOOKING_ID,
        newStartTime: '2026-04-11T08:00:00Z',
        newEndTime: '2026-04-11T09:00:00Z',
      })).rejects.toThrow(/not found/i);
    });
  });

  describe('getIcal', () => {
    it('throws NOT_FOUND when booking does not belong to user', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      await expect(caller.getIcal({ id: BOOKING_ID })).rejects.toThrow(/not found/i);
    });
  });

  describe('adminStats', () => {
    it('returns stats object', async () => {
      const ctx = createCtx();
      // Mock to return count rows
      const countChain = createSelectChain([{ count: 5 }]);
      ctx.db.select = vi.fn().mockReturnValue(countChain);
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      const result = await caller.adminStats();
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('today');
      expect(result).toHaveProperty('thisWeek');
    });
  });

  describe('adminUpdateStatus', () => {
    it('throws NOT_FOUND for non-existent booking', async () => {
      const ctx = createCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      await expect(caller.adminUpdateStatus({
        id: BOOKING_ID,
        status: 'confirmed',
      })).rejects.toThrow(/not found/i);
    });
  });

  describe('listServices (public)', () => {
    it('returns paginated published services', async () => {
      const ctx = createPublicCtx();
      const caller = bookingBookingsRouter.createCaller(ctx as never);
      const result = await caller.listServices({ organizationId: ORG_ID });
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('totalPages');
    });
  });
});
