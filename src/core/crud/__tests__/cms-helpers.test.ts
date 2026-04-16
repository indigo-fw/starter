import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/server/db/schema', () => ({
  cmsSlugRedirects: { oldSlug: 'oldSlug', contentType: 'contentType', contentId: 'contentId', urlPrefix: 'urlPrefix' },
}));

vi.mock('../content-revisions', () => ({
  createRevision: vi.fn().mockResolvedValue(undefined),
  pickSnapshot: vi.fn((record: Record<string, unknown>, keys: string[]) => {
    const snap: Record<string, unknown> = {};
    for (const k of keys) snap[k] = record[k];
    return snap;
  }),
}));

import { asMock } from '@/core/test-utils';
import { updateWithRevision } from '../cms-helpers';
import { createRevision, pickSnapshot } from '../content-revisions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb() {
  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return {
    insert: insertMock,
    _chains: { insert: { values: insertValuesMock } },
  };
}

// ---------------------------------------------------------------------------
// updateWithRevision
// ---------------------------------------------------------------------------

describe('updateWithRevision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const oldRecord = { title: 'Old Title', slug: 'old-slug', body: 'content' };
  const snapshotKeys: (keyof typeof oldRecord)[] = ['title', 'slug'];

  it('creates a revision snapshot before updating', async () => {
    const db = makeDb();
    const doUpdate = vi.fn().mockResolvedValue(undefined);

    await updateWithRevision({
      db: db as never,
      contentType: 'post',
      contentId: 'uuid-1',
      oldRecord,
      snapshotKeys,
      userId: 'user-1',
      doUpdate,
    });

    expect(pickSnapshot).toHaveBeenCalledWith(oldRecord, snapshotKeys);
    expect(createRevision).toHaveBeenCalledWith(
      db,
      'post',
      'uuid-1',
      { title: 'Old Title', slug: 'old-slug' },
      'user-1'
    );
  });

  it('calls doUpdate callback', async () => {
    const db = makeDb();
    const doUpdate = vi.fn().mockResolvedValue(undefined);

    await updateWithRevision({
      db: db as never,
      contentType: 'post',
      contentId: 'uuid-1',
      oldRecord,
      snapshotKeys,
      doUpdate,
    });

    expect(doUpdate).toHaveBeenCalledWith(db);
  });

  it('creates slug redirect when slug changes', async () => {
    const db = makeDb();
    const doUpdate = vi.fn().mockResolvedValue(undefined);

    await updateWithRevision({
      db: db as never,
      contentType: 'post',
      contentId: 'uuid-1',
      oldRecord,
      snapshotKeys,
      oldSlug: 'old-slug',
      newSlug: 'new-slug',
      urlPrefix: '/blog/',
      doUpdate,
    });

    expect(db.insert).toHaveBeenCalled();
    expect(db._chains.insert.values).toHaveBeenCalledWith({
      oldSlug: 'old-slug',
      contentType: 'post',
      contentId: 'uuid-1',
      urlPrefix: '/blog/',
    });
  });

  it('skips slug redirect when slug unchanged', async () => {
    const db = makeDb();
    const doUpdate = vi.fn().mockResolvedValue(undefined);

    await updateWithRevision({
      db: db as never,
      contentType: 'post',
      contentId: 'uuid-1',
      oldRecord,
      snapshotKeys,
      oldSlug: 'same-slug',
      newSlug: 'same-slug',
      urlPrefix: '/blog/',
      doUpdate,
    });

    // insert called once for createRevision mock internally, but NOT for slug redirect
    // The db.insert on the outer db should not be called for slug redirect
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('passes correct snapshot keys to pickSnapshot', async () => {
    const db = makeDb();
    const doUpdate = vi.fn().mockResolvedValue(undefined);
    const customKeys: (keyof typeof oldRecord)[] = ['title', 'slug', 'body'];

    await updateWithRevision({
      db: db as never,
      contentType: 'page',
      contentId: 'uuid-2',
      oldRecord,
      snapshotKeys: customKeys,
      doUpdate,
    });

    expect(pickSnapshot).toHaveBeenCalledWith(oldRecord, customKeys);
    // Verify the snapshot passed to createRevision includes all keys
    expect(asMock(createRevision).mock.calls[0][3]).toEqual({
      title: 'Old Title',
      slug: 'old-slug',
      body: 'content',
    });
  });
});
