import {
  boolean,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── user ──────────────────────────────────────────────────────────────────────
// Extends Better Auth's default user table with CMS-specific fields.
// Better Auth manages: id, name, email, emailVerified, image, createdAt, updatedAt

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: varchar('role', { length: 20 }).notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  lang: varchar('lang', { length: 2 }),
  country: varchar('country', { length: 2 }),
  state: varchar('state', { length: 50 }),
  timezone: varchar('timezone', { length: 50 }),
  preferredCurrency: varchar('preferred_currency', { length: 3 }),
  lastIp: varchar('last_ip', { length: 45 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

// ─── session ───────────────────────────────────────────────────────────────────

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
});

// ─── account ───────────────────────────────────────────────────────────────────

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── verification ──────────────────────────────────────────────────────────────

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
