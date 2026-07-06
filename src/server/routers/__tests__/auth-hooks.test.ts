/**
 * Tests the per-signup wiring: that calling `handleUserCreated` runs the
 * `user.created` hook with the right shape. This is the bridge between
 * Better Auth's `databaseHooks.user.create.after` (which `auth.ts` registers
 * as a one-liner) and the module-side hook handlers (chat-linking,
 * reverse-trial grant, etc.). Without this test, the wiring was
 * typecheck-clean but never exercised — the unit tests for the handlers
 * proved each side works in isolation, not that the bridge fires at all.
 *
 * We import from `@/lib/auth-hooks` (not `@/lib/auth`) so we don't have to
 * mock the `better-auth` package — the hook lives in its own module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture DB writes by table so we can assert org/member were created — and
// so the function returns the right orgId on success. (The billing profile is
// no longer inserted here: it seeds via the `org.created` hook, whose handler
// lives in payments-deps.ts. We assert the hook fires with the right args.)
const { insertCalls, selectExistingRef } = vi.hoisted(() => {
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];
  const selectExistingRef = { current: 0 };
  return { insertCalls, selectExistingRef };
});

vi.mock('@/server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ count: selectExistingRef.current }])),
      })),
    })),
    insert: (table: unknown) => ({
      values: (values: unknown) => { insertCalls.push({ table, values }); return Promise.resolve(); },
    }),
  },
}));

// Tag each schema mock with a recognizable token so we can identify which
// table each insert hit, without depending on Drizzle's internal symbols.
vi.mock('@/server/db/schema/organization', () => ({
  organization: { __tag: 'organization' },
  member: { __tag: 'member' },
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
}));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/core/lib/email-list/index', () => ({ syncSubscriber: vi.fn() }));

import { registerHook, clearHooks, type HookMap } from '@/core/lib/module/module-hooks';
import { handleUserCreated } from '@/lib/auth-hooks';

function findTable(tag: string) {
  return insertCalls.find((c) => (c.table as { __tag?: string })?.__tag === tag);
}

beforeEach(() => {
  insertCalls.length = 0;
  selectExistingRef.current = 0;
  // Critical: clear the process-global hook registry so handlers registered
  // by previous test cases don't fire (and pollute call counts) in this one.
  clearHooks('user.created');
  clearHooks('org.created');
});

describe('handleUserCreated — happy path', () => {
  it('creates org + member, fires org.created and user.created hooks with the right shape', async () => {
    const hookSpy = vi.fn<(...args: HookMap['user.created']) => void | Promise<void>>();
    const orgHookSpy = vi.fn<(...args: HookMap['org.created']) => void | Promise<void>>();
    registerHook('user.created', hookSpy);
    registerHook('org.created', orgHookSpy);

    const result = await handleUserCreated({ id: 'user-1', email: 'a@b.com', name: 'Alice' });

    // org/member inserts both happened
    const orgInsert = findTable('organization');
    const memberInsert = findTable('member');
    expect(orgInsert).toBeDefined();
    expect(memberInsert).toBeDefined();

    const orgValues = orgInsert!.values as { id: string; name: string; slug: string; createdAt: Date };
    expect(orgValues.name).toBe("Alice's workspace");
    expect(orgValues.slug).toBe('alice-s-workspace');
    expect(orgValues.id).toBe(result.orgId);
    expect(orgValues.createdAt).toBeInstanceOf(Date);

    const memberValues = memberInsert!.values as { userId: string; organizationId: string; role: string };
    expect(memberValues.userId).toBe('user-1');
    expect(memberValues.organizationId).toBe(result.orgId);
    expect(memberValues.role).toBe('owner');

    // billing-profile seeding moved behind the org.created hook — assert the
    // hook carried the new orgId + the legal name the handler will insert
    expect(orgHookSpy).toHaveBeenCalledTimes(1);
    expect(orgHookSpy).toHaveBeenCalledWith(result.orgId, 'Alice');

    // hook fired exactly once with the right shape + the same orgId we returned
    expect(hookSpy).toHaveBeenCalledTimes(1);
    const [hookUser, hookOrgId] = hookSpy.mock.calls[0];
    expect(hookUser).toEqual({ id: 'user-1', email: 'a@b.com', name: 'Alice' });
    expect(hookOrgId).toBe(result.orgId);
  });

  it('falls back org.created name to email when user has no name; passes null name to hook', async () => {
    const hookSpy = vi.fn<(...args: HookMap['user.created']) => void | Promise<void>>();
    const orgHookSpy = vi.fn<(...args: HookMap['org.created']) => void | Promise<void>>();
    registerHook('user.created', hookSpy);
    registerHook('org.created', orgHookSpy);

    await handleUserCreated({ id: 'user-2', email: 'noname@x.com', name: null });

    expect(orgHookSpy).toHaveBeenCalledWith(expect.any(String), 'noname@x.com');

    const [hookUser] = hookSpy.mock.calls[0];
    expect(hookUser).toEqual({ id: 'user-2', email: 'noname@x.com', name: null });
  });

  it('appends user-id suffix to slug when base slug already exists', async () => {
    selectExistingRef.current = 1; // simulate a colliding slug
    registerHook('user.created', vi.fn());

    await handleUserCreated({ id: 'abcdef1234567890', email: 'c@d.com', name: 'Alice' });

    const orgValues = findTable('organization')!.values as { slug: string };
    expect(orgValues.slug).toBe('alice-s-workspace-abcdef12');
  });
});

describe('handleUserCreated — failure modes', () => {
  it('passes orgId=null to hook when org creation throws', async () => {
    const hookSpy = vi.fn<(...args: HookMap['user.created']) => void | Promise<void>>();
    registerHook('user.created', hookSpy);

    // Make the slug-collision SELECT throw so the try-block aborts before any insert.
    const dbModule = await import('@/server/db');
    const original = dbModule.db.select;
    (dbModule.db as { select: unknown }).select = vi.fn(() => {
      throw new Error('boom');
    });
    try {
      const result = await handleUserCreated({ id: 'user-3', email: 'e@f.com', name: 'Bob' });
      expect(result.orgId).toBeNull();
      const [, hookOrgId] = hookSpy.mock.calls[0];
      expect(hookOrgId).toBeNull();
    } finally {
      (dbModule.db as { select: unknown }).select = original;
    }
  });

  it('a throwing handler does not break signup AND other handlers still fire (Promise.allSettled)', async () => {
    // Real test of the resilience guarantee: register one handler that
    // throws AND one tracking spy. The spy must still be called — proves
    // we use Promise.allSettled, not a fail-fast loop.
    const throwingHandler = vi.fn(() => { throw new Error('handler exploded'); });
    const trackingSpy = vi.fn<(...args: HookMap['user.created']) => void>();
    registerHook('user.created', throwingHandler);
    registerHook('user.created', trackingSpy);

    const result = await handleUserCreated({ id: 'user-4', email: 'g@h.com', name: 'Carol' });

    expect(result.orgId).toEqual(expect.any(String));   // signup succeeded
    expect(throwingHandler).toHaveBeenCalledTimes(1);   // the throwing handler ran
    expect(trackingSpy).toHaveBeenCalledTimes(1);       // ...and the other one too
    expect(trackingSpy.mock.calls[0][1]).toBe(result.orgId);
  });

  it('handler-registration order does not matter — both fire regardless of position', async () => {
    // Same as above but registered in the opposite order. Guards against
    // accidental "first handler crashes the loop" regressions.
    const trackingSpy = vi.fn<(...args: HookMap['user.created']) => void>();
    const throwingHandler = vi.fn(() => { throw new Error('handler exploded'); });
    registerHook('user.created', trackingSpy);
    registerHook('user.created', throwingHandler);

    await handleUserCreated({ id: 'user-5', email: 'i@j.com', name: 'Dave' });

    expect(trackingSpy).toHaveBeenCalledTimes(1);
    expect(throwingHandler).toHaveBeenCalledTimes(1);
  });
});
