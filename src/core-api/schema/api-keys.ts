import { index, integer, jsonb, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { organization } from '@/server/db/schema/organization';

// ─── saas_api_keys ──────────────────────────────────────────────────────────
// Per-organization API keys for v2 REST API access.

export const saasApiKeys = pgTable(
  'saas_api_keys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    /** SHA-256 hash of the full key — the plaintext is never stored. */
    keyHash: text('key_hash').notNull(),
    /** First 16 chars of the key for display (e.g. "sk_live_a1b2c3d4"). */
    prefix: varchar('prefix', { length: 20 }).notNull(),
    /** Granted scopes. Empty array = no access. Null = all scopes (superkey). */
    scopes: jsonb('scopes').$type<string[]>(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('saas_api_keys_org_idx').on(t.organizationId),
    index('saas_api_keys_hash_idx').on(t.keyHash),
    unique('saas_api_keys_prefix_uniq').on(t.prefix),
  ],
);

// ─── saas_api_request_logs ──────────────────────────────────────────────────
// Audit trail of API v2 requests per organization.

export const saasApiRequestLogs = pgTable(
  'saas_api_request_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    apiKeyId: text('api_key_id')
      .notNull()
      .references(() => saasApiKeys.id, { onDelete: 'cascade' }),
    method: varchar('method', { length: 10 }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    statusCode: integer('status_code').notNull(),
    responseTimeMs: integer('response_time_ms'),
    ipAddress: varchar('ip_address', { length: 50 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('saas_api_req_logs_org_idx').on(t.organizationId, t.createdAt),
    index('saas_api_req_logs_key_idx').on(t.apiKeyId),
  ],
);
