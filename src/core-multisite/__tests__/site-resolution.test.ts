import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for site resolution logic — specifically that suspended sites
 * are resolvable for dashboard (admin) access but blocked for public access.
 */

// ---------------------------------------------------------------------------
// Mock DB before imports
// ---------------------------------------------------------------------------

const { mockSelectLimit, mockSelect } = vi.hoisted(() => {
  const mockSelectLimit = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  return { mockSelectLimit, mockSelectWhere, mockSelectFrom, mockSelect };
});

vi.mock('@/server/db', () => ({
  db: { select: mockSelect },
}));

import { resolveSiteById } from '../lib/site-resolver';
import { SiteStatus } from '../schema/sites';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUSPENDED_SITE = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  name: 'Suspended Store',
  slug: 'suspended-store',
  schemaName: 'site_suspended_store',
  defaultLocale: 'en',
  locales: ['en'],
  settings: {},
  status: SiteStatus.SUSPENDED,
  isNetworkAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const ACTIVE_SITE = {
  ...SUSPENDED_SITE,
  id: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6',
  name: 'Active Store',
  slug: 'active-store',
  status: SiteStatus.ACTIVE,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSiteById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default behavior
    mockSelectLimit.mockResolvedValue([]);
  });

  it('resolves active site by default', async () => {
    // First call: site query returns active site
    // Second call: primary domain query returns empty
    mockSelectLimit
      .mockResolvedValueOnce([ACTIVE_SITE])
      .mockResolvedValueOnce([]);

    const result = await resolveSiteById(ACTIVE_SITE.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(ACTIVE_SITE.id);
  });

  it('blocks suspended site by default (public resolution)', async () => {
    // The WHERE clause includes eq(status, ACTIVE), so suspended site won't match
    mockSelectLimit.mockResolvedValueOnce([]);

    const result = await resolveSiteById(SUSPENDED_SITE.id);

    expect(result).toBeNull();
  });

  it('resolves suspended site when allowSuspended=true (dashboard resolution)', async () => {
    // With allowSuspended, WHERE uses ne(status, DELETED) instead of eq(status, ACTIVE)
    // So suspended sites match
    mockSelectLimit
      .mockResolvedValueOnce([SUSPENDED_SITE])
      .mockResolvedValueOnce([]);

    const result = await resolveSiteById(SUSPENDED_SITE.id, undefined, true);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(SUSPENDED_SITE.id);
    expect(result!.slug).toBe('suspended-store');
  });

  it('still blocks deleted sites even with allowSuspended=true', async () => {
    // Deleted sites have deletedAt set AND status=DELETED
    // ne(status, DELETED) filters them out
    mockSelectLimit.mockResolvedValueOnce([]);

    const result = await resolveSiteById('c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7', undefined, true);

    expect(result).toBeNull();
  });

  it('resolves by slug with allowSuspended', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([SUSPENDED_SITE])
      .mockResolvedValueOnce([]);

    const result = await resolveSiteById(null, 'suspended-store', true);

    expect(result).not.toBeNull();
    expect(result!.slug).toBe('suspended-store');
  });
});
