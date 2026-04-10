import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-booking',
  routers: [
    { name: 'bookingServicesRouter', key: 'bookingServices', from: '@/core-booking/routers/services' },
    { name: 'bookingAvailabilityRouter', key: 'bookingAvailability', from: '@/core-booking/routers/availability' },
    { name: 'bookingBookingsRouter', key: 'bookings', from: '@/core-booking/routers/bookings' },
  ],
  schema: [
    '@/core-booking/schema/services',
    '@/core-booking/schema/availability',
    '@/core-booking/schema/bookings',
  ],
  overridableSchema: [
    { name: 'booking-services', modulePath: '@/core-booking/schema/services' },
  ],
  serverInit: [
    '@/config/booking-deps',
  ],
  jobs: [
    { name: 'startBookingWorker', from: '@/core-booking/jobs/booking-worker' },
  ],
  seed: [
    {
      name: 'seedBooking',
      from: '@/core-booking/seed',
      label: 'Booking demo data (services + schedules)',
      hasDataCheck: 'hasBookingData',
    },
  ],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    {
      groupId: 'settings',
      name: 'Bookings',
      href: '/dashboard/settings/bookings',
      icon: 'CalendarCheck',
    },
  ],
  projectFiles: [
    'config/booking-deps.ts',
    'app/api/webhooks/booking/route.ts',
  ],
};

export default config;
