import { DEFAULT_LOCALE } from '@/lib/constants';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from '@/server/db/schema/auth';

// ─── sites ────────────────────────────────────────────────────────────────────

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    /** PostgreSQL schema name: site_{slug} */
    schemaName: varchar('schema_name', { length: 110 }).notNull(),
    /** Default locale for this site */
    defaultLocale: varchar('default_locale', { length: 5 }).notNull().default(DEFAULT_LOCALE),
    /** Supported locale codes (e.g. ["en", "de", "es"]) */
    locales: jsonb('locales').notNull().$type<string[]>().default([DEFAULT_LOCALE]),
    /** Per-site settings: branding, theme, API keys, etc. */
    settings: jsonb('settings').notNull().$type<SiteSettings>().default({}),
    /** Whether this is the network admin site */
    isNetworkAdmin: boolean('is_network_admin').notNull().default(false),
    /** 1=active, 2=suspended, 3=deleted */
    status: smallint('status').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('sites_slug_uniq').on(t.slug),
    uniqueIndex('sites_schema_name_uniq').on(t.schemaName),
    index('sites_status_idx').on(t.status),
  ]
);

// ─── site_domains ─────────────────────────────────────────────────────────────

export const siteDomains = pgTable(
  'site_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    domain: varchar('domain', { length: 255 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verified: boolean('verified').notNull().default(false),
    verificationToken: varchar('verification_token', { length: 64 }),
    verifiedAt: timestamp('verified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('site_domains_domain_uniq').on(t.domain),
    index('site_domains_site_id_idx').on(t.siteId),
  ]
);

// ─── site_members ─────────────────────────────────────────────────────────────

export const siteMembers = pgTable(
  'site_members',
  {
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** admin | editor | viewer */
    role: varchar('role', { length: 20 }).notNull().default('editor'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('site_members_pk').on(t.siteId, t.userId),
    index('site_members_user_id_idx').on(t.userId),
  ]
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SiteSettings {
  /** Brand hue for OKLCH palette (0-360) */
  brandHue?: number;
  /** Accent hue for OKLCH palette (0-360) */
  accentHue?: number;
  /** Gray hue for OKLCH palette (0-360) */
  grayHue?: number;
  /** Logo URL */
  logoUrl?: string;
  /** Favicon URL */
  faviconUrl?: string;
  /** Default OG image */
  defaultOgImage?: string;
  /** Twitter/X handle */
  twitterHandle?: string;
  /** Contact email */
  contactEmail?: string;
}

export const SiteStatus = {
  ACTIVE: 1,
  SUSPENDED: 2,
  DELETED: 3,
} as const;

/** Maximum custom domains allowed per site */
export const MAX_DOMAINS_PER_SITE = 20;
