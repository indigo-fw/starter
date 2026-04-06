import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Chainable mock DB (vi.fn() names starting with "mock" are hoisted) ─────
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockSelectLimit = vi.fn().mockResolvedValue([]);
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

// ─── Module mocks ───────────────────────────────────────────────────────────
vi.mock('@/server/db/schema', () => ({
  cmsTermRelationships: {
    objectId: 'object_id',
    termId: 'term_id',
    taxonomyId: 'taxonomy_id',
  },
  cmsTerms: {
    id: 'id',
    name: 'name',
    slug: 'slug',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown) => ({ _type: 'inArray', col, vals }),
}));

// ─── Import module under test + schema (after mocks) ────────────────────────
import {
  syncTermRelationships,
  getTermRelationships,
  deleteAllTermRelationships,
  deleteTermRelationshipsByTerm,
  getObjectIdsForTerm,
  batchGetTermRelationships,
  resolveTagsForPosts,
} from '../taxonomy-helpers';
import { cmsTermRelationships } from '@/server/db/schema';
import type { DbClient } from '@/server/db';

// ─── Mock DB factory ────────────────────────────────────────────────────────
function createMockDb() {
  return {
    delete: mockDelete,
    insert: mockInsert,
    select: mockSelect,
  } as unknown;
}

describe('taxonomy-helpers', () => {
  let db: DbClient;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb() as DbClient;

    // Reset default chain behavior
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockResolvedValue(undefined);
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([]);
  });

  // ─── syncTermRelationships ──────────────────────────────────────────────
  describe('syncTermRelationships', () => {
    it('deletes existing relationships and inserts new ones', async () => {
      const termIds = ['term-1', 'term-2', 'term-3'];

      await syncTermRelationships(db, 'post-1', 'category', termIds);

      expect(mockDelete).toHaveBeenCalledWith(cmsTermRelationships);
      expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledWith(cmsTermRelationships);
      expect(mockInsertValues).toHaveBeenCalledWith([
        { objectId: 'post-1', termId: 'term-1', taxonomyId: 'category' },
        { objectId: 'post-1', termId: 'term-2', taxonomyId: 'category' },
        { objectId: 'post-1', termId: 'term-3', taxonomyId: 'category' },
      ]);
    });

    it('deletes only (no insert) when termIds is empty', async () => {
      await syncTermRelationships(db, 'post-1', 'tag', []);

      expect(mockDelete).toHaveBeenCalledWith(cmsTermRelationships);
      expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('handles a single termId', async () => {
      await syncTermRelationships(db, 'post-1', 'tag', ['term-99']);

      expect(mockInsertValues).toHaveBeenCalledWith([
        { objectId: 'post-1', termId: 'term-99', taxonomyId: 'tag' },
      ]);
    });

    it('always deletes before inserting', async () => {
      const callOrder: string[] = [];
      mockDeleteWhere.mockImplementation(() => {
        callOrder.push('delete');
        return Promise.resolve(undefined);
      });
      mockInsertValues.mockImplementation(() => {
        callOrder.push('insert');
        return Promise.resolve(undefined);
      });

      await syncTermRelationships(db, 'post-1', 'category', ['term-1']);

      expect(callOrder).toEqual(['delete', 'insert']);
    });
  });

  // ─── getTermRelationships ───────────────────────────────────────────────
  describe('getTermRelationships', () => {
    it('returns term relationships for an object', async () => {
      const mockRows = [
        { termId: 'term-1', taxonomyId: 'category' },
        { termId: 'term-2', taxonomyId: 'tag' },
      ];
      mockSelectWhere.mockResolvedValue(mockRows);

      const result = await getTermRelationships(db, 'post-1');

      expect(mockSelect).toHaveBeenCalled();
      expect(mockSelectFrom).toHaveBeenCalledWith(cmsTermRelationships);
      expect(result).toEqual(mockRows);
    });

    it('filters by taxonomyId when provided', async () => {
      const mockRows = [{ termId: 'term-1', taxonomyId: 'category' }];
      mockSelectWhere.mockResolvedValue(mockRows);

      const result = await getTermRelationships(db, 'post-1', 'category');

      expect(mockSelectWhere).toHaveBeenCalled();
      const whereArg = mockSelectWhere.mock.calls[0][0];
      expect(whereArg).toHaveProperty('_type', 'and');
      expect(whereArg.args).toHaveLength(2);
      expect(result).toEqual(mockRows);
    });

    it('returns all taxonomies when taxonomyId is omitted', async () => {
      const mockRows = [
        { termId: 'term-1', taxonomyId: 'category' },
        { termId: 'term-2', taxonomyId: 'tag' },
      ];
      mockSelectWhere.mockResolvedValue(mockRows);

      const result = await getTermRelationships(db, 'post-1');

      const whereArg = mockSelectWhere.mock.calls[0][0];
      expect(whereArg).toHaveProperty('_type', 'and');
      // Only one condition (objectId eq) when taxonomyId omitted
      expect(whereArg.args).toHaveLength(1);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no relationships exist', async () => {
      mockSelectWhere.mockResolvedValue([]);

      const result = await getTermRelationships(db, 'post-nonexistent');

      expect(result).toEqual([]);
    });
  });

  // ─── deleteAllTermRelationships ─────────────────────────────────────────
  describe('deleteAllTermRelationships', () => {
    it('deletes all relationships for the given objectId', async () => {
      await deleteAllTermRelationships(db, 'post-1');

      expect(mockDelete).toHaveBeenCalledWith(cmsTermRelationships);
      expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
      const whereArg = mockDeleteWhere.mock.calls[0][0];
      expect(whereArg).toHaveProperty('_type', 'eq');
      expect(whereArg.val).toBe('post-1');
    });

    it('does not call insert', async () => {
      await deleteAllTermRelationships(db, 'post-1');

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // ─── deleteTermRelationshipsByTerm ──────────────────────────────────────
  describe('deleteTermRelationshipsByTerm', () => {
    it('deletes relationships by termId and taxonomyId', async () => {
      await deleteTermRelationshipsByTerm(db, 'term-1', 'tag');

      expect(mockDelete).toHaveBeenCalledWith(cmsTermRelationships);
      expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
      const whereArg = mockDeleteWhere.mock.calls[0][0];
      expect(whereArg).toHaveProperty('_type', 'and');
      expect(whereArg.args).toHaveLength(2);
    });

    it('uses correct column references for termId and taxonomyId', async () => {
      await deleteTermRelationshipsByTerm(db, 'term-42', 'category');

      const whereArg = mockDeleteWhere.mock.calls[0][0];
      const [termEq, taxonomyEq] = whereArg.args;
      expect(termEq.col).toBe(cmsTermRelationships.termId);
      expect(termEq.val).toBe('term-42');
      expect(taxonomyEq.col).toBe(cmsTermRelationships.taxonomyId);
      expect(taxonomyEq.val).toBe('category');
    });
  });

  // ─── getObjectIdsForTerm ────────────────────────────────────────────────
  describe('getObjectIdsForTerm', () => {
    it('returns objectIds for the given term', async () => {
      mockSelectLimit.mockResolvedValue([
        { objectId: 'post-1' },
        { objectId: 'post-2' },
        { objectId: 'post-3' },
      ]);

      const result = await getObjectIdsForTerm(db, 'term-1', 'tag');

      expect(result).toEqual(['post-1', 'post-2', 'post-3']);
    });

    it('uses default limit of 100', async () => {
      mockSelectLimit.mockResolvedValue([]);

      await getObjectIdsForTerm(db, 'term-1', 'tag');

      expect(mockSelectLimit).toHaveBeenCalledWith(100);
    });

    it('respects custom limit param', async () => {
      mockSelectLimit.mockResolvedValue([]);

      await getObjectIdsForTerm(db, 'term-1', 'tag', 25);

      expect(mockSelectLimit).toHaveBeenCalledWith(25);
    });

    it('returns empty array when no matches found', async () => {
      mockSelectLimit.mockResolvedValue([]);

      const result = await getObjectIdsForTerm(db, 'term-nonexistent', 'tag');

      expect(result).toEqual([]);
    });
  });

  // ─── batchGetTermRelationships ──────────────────────────────────────────
  describe('batchGetTermRelationships', () => {
    it('returns empty Map for empty objectIds input', async () => {
      const result = await batchGetTermRelationships(db, [], 'tag');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      // Should short-circuit without querying the DB
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('returns Map grouped by objectId', async () => {
      mockSelectWhere.mockResolvedValue([
        { objectId: 'post-1', termId: 'term-a' },
        { objectId: 'post-1', termId: 'term-b' },
        { objectId: 'post-2', termId: 'term-a' },
      ]);

      const result = await batchGetTermRelationships(
        db,
        ['post-1', 'post-2'],
        'tag'
      );

      expect(result).toBeInstanceOf(Map);
      expect(result.get('post-1')).toEqual(['term-a', 'term-b']);
      expect(result.get('post-2')).toEqual(['term-a']);
    });

    it('handles multiple objects with no shared terms', async () => {
      mockSelectWhere.mockResolvedValue([
        { objectId: 'post-1', termId: 'term-x' },
        { objectId: 'post-2', termId: 'term-y' },
        { objectId: 'post-3', termId: 'term-z' },
      ]);

      const result = await batchGetTermRelationships(
        db,
        ['post-1', 'post-2', 'post-3'],
        'category'
      );

      expect(result.size).toBe(3);
      expect(result.get('post-1')).toEqual(['term-x']);
      expect(result.get('post-2')).toEqual(['term-y']);
      expect(result.get('post-3')).toEqual(['term-z']);
    });

    it('omits objects that have no relationships from the Map', async () => {
      mockSelectWhere.mockResolvedValue([
        { objectId: 'post-1', termId: 'term-a' },
      ]);

      const result = await batchGetTermRelationships(
        db,
        ['post-1', 'post-2'],
        'tag'
      );

      expect(result.has('post-1')).toBe(true);
      expect(result.has('post-2')).toBe(false);
    });

    it('uses inArray for objectIds and eq for taxonomyId', async () => {
      mockSelectWhere.mockResolvedValue([]);

      await batchGetTermRelationships(db, ['post-1', 'post-2'], 'tag');

      const whereArg = mockSelectWhere.mock.calls[0][0];
      expect(whereArg).toHaveProperty('_type', 'and');
      const [inArrayCond, eqCond] = whereArg.args;
      expect(inArrayCond).toHaveProperty('_type', 'inArray');
      expect(inArrayCond.vals).toEqual(['post-1', 'post-2']);
      expect(eqCond).toHaveProperty('_type', 'eq');
      expect(eqCond.val).toBe('tag');
    });
  });

  // ─── resolveTagsForPosts ────────────────────────────────────────────────
  describe('resolveTagsForPosts', () => {
    it('returns empty array for empty posts input', async () => {
      const result = await resolveTagsForPosts(db, []);

      expect(result).toEqual([]);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('returns posts with tags array attached', async () => {
      let selectCallCount = 0;
      mockSelectWhere.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([
            { objectId: 'post-1', termId: 'tag-1' },
            { objectId: 'post-1', termId: 'tag-2' },
          ]);
        }
        return {
          limit: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'JavaScript', slug: 'javascript' },
            { id: 'tag-2', name: 'TypeScript', slug: 'typescript' },
          ]),
        };
      });

      const posts = [{ id: 'post-1', title: 'Test Post' }];
      const result = await resolveTagsForPosts(db, posts);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Post');
      expect(result[0].tags).toEqual([
        { id: 'tag-1', name: 'JavaScript', slug: 'javascript' },
        { id: 'tag-2', name: 'TypeScript', slug: 'typescript' },
      ]);
    });

    it('handles posts with no tags', async () => {
      let selectCallCount = 0;
      mockSelectWhere.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([]);
        }
        return { limit: vi.fn().mockResolvedValue([]) };
      });

      const posts = [
        { id: 'post-1', title: 'No Tags' },
        { id: 'post-2', title: 'Also No Tags' },
      ];
      const result = await resolveTagsForPosts(db, posts);

      expect(result).toHaveLength(2);
      expect(result[0].tags).toEqual([]);
      expect(result[1].tags).toEqual([]);
    });

    it('handles mixed posts — some with tags, some without', async () => {
      let selectCallCount = 0;
      mockSelectWhere.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([
            { objectId: 'post-1', termId: 'tag-1' },
          ]);
        }
        return {
          limit: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'React', slug: 'react' },
          ]),
        };
      });

      const posts = [
        { id: 'post-1', title: 'Has Tags' },
        { id: 'post-2', title: 'No Tags' },
      ];
      const result = await resolveTagsForPosts(db, posts);

      expect(result[0].tags).toEqual([
        { id: 'tag-1', name: 'React', slug: 'react' },
      ]);
      expect(result[1].tags).toEqual([]);
    });

    it('preserves original post properties', async () => {
      mockSelectWhere.mockResolvedValue([]);

      const posts = [
        { id: 'post-1', title: 'My Post', slug: 'my-post', status: 'published' },
      ];
      const result = await resolveTagsForPosts(db, posts);

      expect(result[0].id).toBe('post-1');
      expect(result[0].title).toBe('My Post');
      expect(result[0].slug).toBe('my-post');
      expect(result[0].status).toBe('published');
      expect(result[0]).toHaveProperty('tags');
    });

    it('filters out tags not found in the database', async () => {
      let selectCallCount = 0;
      mockSelectWhere.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([
            { objectId: 'post-1', termId: 'tag-1' },
            { objectId: 'post-1', termId: 'tag-2' },
          ]);
        }
        // Only tag-1 exists in the DB; tag-2 is orphaned
        return {
          limit: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'Exists', slug: 'exists' },
          ]),
        };
      });

      const posts = [{ id: 'post-1', title: 'Test' }];
      const result = await resolveTagsForPosts(db, posts);

      expect(result[0].tags).toEqual([
        { id: 'tag-1', name: 'Exists', slug: 'exists' },
      ]);
    });

    it('batches tag info lookup with limit of 500', async () => {
      const limitMock = vi.fn().mockResolvedValue([
        { id: 'tag-1', name: 'JS', slug: 'js' },
      ]);
      let selectCallCount = 0;
      mockSelectWhere.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([
            { objectId: 'post-1', termId: 'tag-1' },
          ]);
        }
        return { limit: limitMock };
      });

      const posts = [{ id: 'post-1', title: 'Test' }];
      await resolveTagsForPosts(db, posts);

      expect(limitMock).toHaveBeenCalledWith(500);
    });

    it('deduplicates tag IDs across multiple posts', async () => {
      const limitMock = vi.fn().mockResolvedValue([
        { id: 'tag-shared', name: 'Shared', slug: 'shared' },
      ]);
      let selectCallCount = 0;
      mockSelectWhere.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([
            { objectId: 'post-1', termId: 'tag-shared' },
            { objectId: 'post-2', termId: 'tag-shared' },
          ]);
        }
        return { limit: limitMock };
      });

      const posts = [
        { id: 'post-1', title: 'Post 1' },
        { id: 'post-2', title: 'Post 2' },
      ];
      const result = await resolveTagsForPosts(db, posts);

      expect(result[0].tags).toEqual([
        { id: 'tag-shared', name: 'Shared', slug: 'shared' },
      ]);
      expect(result[1].tags).toEqual([
        { id: 'tag-shared', name: 'Shared', slug: 'shared' },
      ]);

      // The tag info query should use inArray with deduplicated IDs
      const tagQueryWhereArg = mockSelectWhere.mock.calls[1][0];
      expect(tagQueryWhereArg).toHaveProperty('_type', 'inArray');
    });

    it('skips tag info fetch when no tags found in relationships', async () => {
      mockSelectWhere.mockResolvedValue([]);

      const posts = [{ id: 'post-1', title: 'Test' }];
      await resolveTagsForPosts(db, posts);

      // Only 1 select call (batchGetTermRelationships), no second for tag info
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });
  });
});
