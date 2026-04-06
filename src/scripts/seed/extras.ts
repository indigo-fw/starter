/**
 * Seed Extras: Menus, Forms, Audit Log, Notifications
 *
 * Creates demo data for menus (header + footer), forms (contact + newsletter)
 * with submissions, audit log entries, and in-app notifications.
 *
 * Uses faker seed(99) for deterministic output (different from billing's 42).
 * Safe to run multiple times — skips if cms_menus already has records.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { log } from './helpers';

// ─── Configuration ──────────────────────────────────────────────────────────

const SEED = 99;
const NUM_CONTACT_SUBMISSIONS = 10;
const NUM_NEWSLETTER_SUBMISSIONS = 5;
const NUM_AUDIT_ENTRIES = 30;
const NUM_NOTIFICATIONS = 20;
const SUBMISSION_SPREAD_DAYS = 30;
const AUDIT_SPREAD_DAYS = 30;
const NOTIFICATION_SPREAD_DAYS = 14;

// ─── Input type ─────────────────────────────────────────────────────────────

export interface ExtrasInput {
  superadminUserId: string;
  postIds: string[];
  categoryIds: string[];
  userIds: string[];
  orgIds: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ─── Seed function ──────────────────────────────────────────────────────────

export async function seedExtras(
  db: PostgresJsDatabase,
  input: ExtrasInput,
): Promise<void> {
  faker.seed(SEED);

  // Dynamic imports for schemas
  const { cmsMenus, cmsMenuItems } = await import(
    '../../server/db/schema/menu'
  );
  const { cmsForms, cmsFormSubmissions } = await import(
    '../../server/db/schema/forms'
  );
  const { cmsAuditLog } = await import('../../server/db/schema/audit');
  const { saasNotifications } = await import(
    '../../server/db/schema/notifications'
  );

  // ─── Idempotency check ──────────────────────────────────────────────────

  const [menuCount] = await db.select({ n: count() }).from(cmsMenus);
  if (menuCount && menuCount.n > 0) {
    log('⏭️', 'Extras already seeded — skipping');
    return;
  }

  // ─── Menus ──────────────────────────────────────────────────────────────

  log('📋', 'Seeding menus...');

  const [headerMenu] = await db
    .insert(cmsMenus)
    .values({ name: 'Header', slug: 'header' })
    .returning();

  const [footerMenu] = await db
    .insert(cmsMenus)
    .values({ name: 'Footer', slug: 'footer' })
    .returning();

  if (!headerMenu || !footerMenu) {
    throw new Error('Failed to create menus');
  }

  const headerItems = [
    { label: 'Home', url: '/', order: 0 },
    { label: 'Blog', url: '/blog', order: 1 },
    { label: 'Portfolio', url: '/portfolio', order: 2 },
    { label: 'Showcase', url: '/showcase', order: 3 },
    { label: 'About', url: '/about', order: 4 },
    { label: 'Contact', url: '/contact', order: 5 },
  ];

  const footerItems = [
    { label: 'Privacy Policy', url: '/privacy-policy', order: 0 },
    { label: 'Terms of Service', url: '/terms-of-service', order: 1 },
    { label: 'Cookie Policy', url: '/cookie-policy', order: 2 },
    { label: 'Impressum', url: '/impressum', order: 3 },
    { label: 'Contact', url: '/contact', order: 4 },
  ];

  await db.insert(cmsMenuItems).values(
    headerItems.map((item) => ({ ...item, menuId: headerMenu.id })),
  );

  await db.insert(cmsMenuItems).values(
    footerItems.map((item) => ({ ...item, menuId: footerMenu.id })),
  );

  log('✅', `Created 2 menus (${headerItems.length + footerItems.length} items)`);

  // ─── Forms ──────────────────────────────────────────────────────────────

  log('📝', 'Seeding forms...');

  const [contactForm] = await db
    .insert(cmsForms)
    .values({
      name: 'Contact Form',
      slug: 'contact-form',
      fields: [
        { name: 'name', label: 'Your Name', type: 'text', required: true },
        {
          name: 'email',
          label: 'Email Address',
          type: 'email',
          required: true,
        },
        { name: 'subject', label: 'Subject', type: 'text', required: true },
        {
          name: 'message',
          label: 'Message',
          type: 'textarea',
          required: true,
        },
      ],
      recipientEmail: 'admin@example.com',
      honeypotField: 'website',
    })
    .returning();

  const [newsletterForm] = await db
    .insert(cmsForms)
    .values({
      name: 'Newsletter Signup',
      slug: 'newsletter',
      fields: [
        {
          name: 'email',
          label: 'Email Address',
          type: 'email',
          required: true,
        },
        {
          name: 'consent',
          label: 'I agree to receive newsletters',
          type: 'checkbox',
          required: true,
        },
      ],
      successMessage: 'Thank you for subscribing!',
    })
    .returning();

  if (!contactForm || !newsletterForm) {
    throw new Error('Failed to create forms');
  }

  // Contact form submissions
  const contactSubmissions = Array.from(
    { length: NUM_CONTACT_SUBMISSIONS },
    (_, i) => ({
      formId: contactForm.id,
      data: {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        subject: faker.lorem.sentence({ min: 3, max: 8 }),
        message: faker.lorem.paragraph(),
      },
      ip: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      createdAt: daysAgo(
        Math.floor((SUBMISSION_SPREAD_DAYS / NUM_CONTACT_SUBMISSIONS) * (NUM_CONTACT_SUBMISSIONS - i)),
      ),
    }),
  );

  await db.insert(cmsFormSubmissions).values(contactSubmissions);

  // Newsletter submissions
  const newsletterSubmissions = Array.from(
    { length: NUM_NEWSLETTER_SUBMISSIONS },
    (_, i) => ({
      formId: newsletterForm.id,
      data: {
        email: faker.internet.email(),
        consent: true,
      },
      ip: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      createdAt: daysAgo(
        Math.floor((SUBMISSION_SPREAD_DAYS / NUM_NEWSLETTER_SUBMISSIONS) * (NUM_NEWSLETTER_SUBMISSIONS - i)),
      ),
    }),
  );

  await db.insert(cmsFormSubmissions).values(newsletterSubmissions);

  log(
    '✅',
    `Created 2 forms (${NUM_CONTACT_SUBMISSIONS + NUM_NEWSLETTER_SUBMISSIONS} submissions)`,
  );

  // ─── Audit Log ──────────────────────────────────────────────────────────

  log('📊', 'Seeding audit log...');

  const AUDIT_ACTIONS = ['create', 'update', 'publish', 'unpublish', 'delete'];
  const AUDIT_ENTITY_TYPES = ['post', 'page', 'category', 'media', 'user'];

  const allUserIds = [
    input.superadminUserId,
    ...input.userIds,
  ].filter(Boolean);

  const auditEntries = Array.from({ length: NUM_AUDIT_ENTRIES }, (_, i) => {
    const entityType = AUDIT_ENTITY_TYPES[i % AUDIT_ENTITY_TYPES.length]!;

    // Pick entityId based on type — use real IDs where available
    let entityId: string;
    if (
      (entityType === 'post' || entityType === 'page') &&
      input.postIds.length > 0
    ) {
      entityId = input.postIds[i % input.postIds.length]!;
    } else if (entityType === 'category' && input.categoryIds.length > 0) {
      entityId = input.categoryIds[i % input.categoryIds.length]!;
    } else {
      entityId = crypto.randomUUID();
    }

    return {
      userId: allUserIds[i % allUserIds.length]!,
      action: AUDIT_ACTIONS[i % AUDIT_ACTIONS.length]!,
      entityType,
      entityId,
      entityTitle: faker.lorem.words({ min: 2, max: 5 }),
      metadata: { ip: faker.internet.ip() },
      createdAt: daysAgo(
        Math.floor((AUDIT_SPREAD_DAYS / NUM_AUDIT_ENTRIES) * (NUM_AUDIT_ENTRIES - i)),
      ),
    };
  });

  await db.insert(cmsAuditLog).values(auditEntries);

  log('✅', `Created ${NUM_AUDIT_ENTRIES} audit log entries`);

  // ─── Notifications ──────────────────────────────────────────────────────

  log('🔔', 'Seeding notifications...');

  const NOTIFICATION_TEMPLATES = [
    {
      title: 'Welcome to Indigo',
      body: 'Your CMS is set up and ready to use.',
      category: 'system',
      type: 'success',
      actionUrl: '/dashboard',
    },
    {
      title: 'New user registered',
      body: '{name} has created an account.',
      category: 'system',
      type: 'info',
      actionUrl: '/dashboard/users',
    },
    {
      title: 'Post published',
      body: '"{postTitle}" has been published successfully.',
      category: 'content',
      type: 'success',
      actionUrl: '/dashboard/cms/blog',
    },
    {
      title: 'Subscription renewed',
      body: 'Subscription for {orgName} has been renewed.',
      category: 'billing',
      type: 'success',
      actionUrl: '/dashboard/settings/billing',
    },
    {
      title: 'Payment failed',
      body: 'Payment for {orgName} failed. Please update payment method.',
      category: 'billing',
      type: 'warning',
      actionUrl: '/dashboard/settings/billing',
    },
    {
      title: 'Storage limit approaching',
      body: 'You are using 80% of your storage quota.',
      category: 'system',
      type: 'warning',
      actionUrl: '/dashboard/settings',
    },
    {
      title: 'Content scheduled',
      body: '"{postTitle}" is scheduled for publication.',
      category: 'content',
      type: 'info',
      actionUrl: '/dashboard/cms/blog',
    },
    {
      title: 'New form submission',
      body: 'New contact form submission from {name}.',
      category: 'content',
      type: 'info',
      actionUrl: '/dashboard/forms',
    },
    {
      title: 'System update available',
      body: 'A new version of Indigo is available.',
      category: 'system',
      type: 'info',
      actionUrl: null,
    },
    {
      title: 'Security alert',
      body: 'Unusual login activity detected on your account.',
      category: 'system',
      type: 'warning',
      actionUrl: '/dashboard/notifications',
    },
  ];

  const notifications = Array.from({ length: NUM_NOTIFICATIONS }, (_, i) => {
    const template = NOTIFICATION_TEMPLATES[i % NOTIFICATION_TEMPLATES.length]!;

    // Fill in placeholders with faker data
    const filledBody = template.body
      .replace('{name}', faker.person.fullName())
      .replace('{postTitle}', faker.lorem.words({ min: 3, max: 6 }))
      .replace('{orgName}', faker.company.name());

    // 60% unread, 40% read
    const isRead = i % 5 < 2; // indices 0,1 read; 2,3,4 unread → 40/60
    const createdAt = daysAgo(
      Math.floor(
        (NOTIFICATION_SPREAD_DAYS / NUM_NOTIFICATIONS) * (NUM_NOTIFICATIONS - i),
      ),
    );

    return {
      id: crypto.randomUUID(),
      userId: input.superadminUserId,
      orgId: input.orgIds.length > 0 ? input.orgIds[i % input.orgIds.length]! : null,
      type: template.type,
      category: template.category,
      title: template.title,
      body: filledBody,
      actionUrl: template.actionUrl,
      read: isRead,
      readAt: isRead ? new Date(createdAt.getTime() + 3600_000) : null,
      createdAt,
    };
  });

  await db.insert(saasNotifications).values(notifications);

  log('✅', `Created ${NUM_NOTIFICATIONS} notifications`);
}
