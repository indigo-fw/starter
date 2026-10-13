import { SYSTEM_ACTOR, logAudit } from '../infra/audit';
import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '@/server/db';

function fakeDb() {
  const values = vi.fn(() => Promise.resolve());
  const insert = vi.fn(() => ({ values }));
  return { db: { insert } as unknown as DbClient, values };
}

describe('logAudit', () => {
  it('stores a real user id as the actor', async () => {
    const { db, values } = fakeDb();
    logAudit({
      db,
      userId: 'user-1',
      action: 'a',
      entityType: 'post',
      entityId: 'p1',
    });
    await Promise.resolve();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', metadata: null })
    );
  });

  it('maps the system actor to a NULL user_id (FK) and records it in metadata', async () => {
    const { db, values } = fakeDb();
    logAudit({
      db,
      userId: SYSTEM_ACTOR,
      action: 'dunning.expired',
      entityType: 'subscription',
      entityId: 's1',
      metadata: { orgId: 'o1' },
    });
    await Promise.resolve();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        metadata: { orgId: 'o1', actor: 'system' },
      })
    );
  });
});
