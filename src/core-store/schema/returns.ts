import { storeOrderItems, storeOrders } from './orders';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { organization } from '@/server/db/schema/organization';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const returnStatusEnum = pgEnum('store_return_status', [
  'requested',
  'approved',
  'received',
  'refunded',
  'rejected',
  // Claim state held while the gateway refund is in flight. Appended last so
  // the migration is a plain ADD VALUE. A return stuck here means the gateway
  // call threw with an unknown outcome — verify at the provider before retrying.
  'refunding',
]);

export const returnConditionEnum = pgEnum('store_return_condition', [
  'unopened',
  'damaged',
  'defective',
  'wrong_item',
  'other',
]);

// ─── Returns ──────────────────────────────────────────────────────────────

export const storeReturns = pgTable(
  'store_returns',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id')
      .notNull()
      .references(() => storeOrders.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    requestedByUserId: text('requested_by_user_id').notNull(),
    status: returnStatusEnum('status').notNull().default('requested'),
    reason: text('reason'),
    adminNote: text('admin_note'),
    refundAmountCents: integer('refund_amount_cents'),
    refundedAt: timestamp('refunded_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_store_returns_order').on(table.orderId),
    index('idx_store_returns_org').on(table.organizationId),
    index('idx_store_returns_status').on(table.status),
  ]
);

// ─── Return Items ─────────────────────────────────────────────────────────

export const storeReturnItems = pgTable(
  'store_return_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    returnId: text('return_id')
      .notNull()
      .references(() => storeReturns.id, { onDelete: 'cascade' }),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => storeOrderItems.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    reason: text('reason'),
    condition: returnConditionEnum('condition').notNull().default('other'),
  },
  (table) => [
    index('idx_store_return_items_return').on(table.returnId),
    index('idx_store_return_items_order_item').on(table.orderItemId),
  ]
);
