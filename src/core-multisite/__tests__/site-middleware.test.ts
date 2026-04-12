import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for site-middleware.ts — request → site context resolution.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — runs before vi.mock factories and module imports
// ---------------------------------------------------------------------------

const { mockResolveSiteByDomain, mockResolveSiteBySlug, mockResolveSiteById } = vi.hoisted(() => {
  // Set env BEFORE site-middleware.ts is imported (it reads at module scope)
  process.env.MULTISITE_BASE_DOMAIN = 'example.com';

  return {
    mockResolveSiteByDomain: vi.fn().mockResolvedValue(null),
    mockResolveSiteBySlug: vi.fn().mockResolvedValue(null),
    mockResolveSiteById: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../lib/site-resolver', () => ({
  resolveSiteByDomain: mockResolveSiteByDomain,
  resolveSiteBySlug: mockResolveSiteBySlug,
  resolveSiteById: mockResolveSiteById,
}));

import { resolveSiteFromRequest, resolveDashboardSite } from '../lib/site-middleware';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(host: string, cookies: Record<string, string> = {}): unknown {
  return {
    headers: {
      get: (key: string) => {
        if (key === 'host') return host;
        return null;
      },
    },
    cookies: {
      get: (name: string) => {
        const val = cookies[name];
        return val ? { value: val } : undefined;
      },
    },
  };
}

const RESOLVED_SITE = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  slug: 'cool-sneakers',
  schemaName: 'site_cool_sneakers',
  name: 'Cool Sneakers',
  defaultLocale: 'en',
  locales: ['en'],
  settings: {},
  isNetworkAdmin: false,
  primaryDomain: 'cool-sneakers.com',
};

const NETWORK_SITE = {
  ...RESOLVED_SITE,
  id: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6',
  slug: '__network__',
  schemaName: 'site___network__',
  name: 'Network Admin',
  isNetworkAdmin: true,
  primaryDomain: null,
};

const SUSPENDED_SITE = {
  ...RESOLVED_SITE,
  id: 'c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7',
  slug: 'suspended-store',
  name: 'Suspended Store',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSiteFromRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves network admin subdomain', async () => {
    mockResolveSiteBySlug.mockResolvedValueOnce(NETWORK_SITE);

    const req = mockRequest('admin.example.com');
    const result = await resolveSiteFromRequest(req as never);

    expect(mockResolveSiteBySlug).toHaveBeenCalledWith('__network__');
    expect(result).not.toBeNull();
    expect(result!.isNetworkAdmin).toBe(true);
  });

  it('resolves temporary subdomain', async () => {
    mockResolveSiteBySlug.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('cool-sneakers.example.com');
    const result = await resolveSiteFromRequest(req as never);

    expect(mockResolveSiteBySlug).toHaveBeenCalledWith('cool-sneakers');
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('cool-sneakers');
  });

  it('resolves custom domain', async () => {
    mockResolveSiteByDomain.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('cool-sneakers.com');
    const result = await resolveSiteFromRequest(req as never);

    expect(mockResolveSiteByDomain).toHaveBeenCalledWith('cool-sneakers.com');
    expect(result).not.toBeNull();
  });

  it('strips www prefix from custom domain', async () => {
    mockResolveSiteByDomain.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('www.cool-sneakers.com');
    const result = await resolveSiteFromRequest(req as never);

    expect(mockResolveSiteByDomain).toHaveBeenCalledWith('cool-sneakers.com');
    expect(result).not.toBeNull();
  });

  it('returns null for unrecognized domain', async () => {
    const req = mockRequest('unknown-domain.org');
    const result = await resolveSiteFromRequest(req as never);

    expect(result).toBeNull();
  });

  it('strips port from host header', async () => {
    mockResolveSiteBySlug.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('cool-sneakers.example.com:3000');
    const result = await resolveSiteFromRequest(req as never);

    expect(mockResolveSiteBySlug).toHaveBeenCalledWith('cool-sneakers');
    expect(result).not.toBeNull();
  });

  it('returns null when no host header', async () => {
    const req = {
      headers: { get: () => null },
      cookies: { get: () => undefined },
    };
    const result = await resolveSiteFromRequest(req as never);
    expect(result).toBeNull();
  });

  it('ignores multi-level subdomains', async () => {
    // "a.b.example.com" — the extracted slug would be "a.b" which contains a dot
    const req = mockRequest('a.b.example.com');
    const result = await resolveSiteFromRequest(req as never);

    // Should not call resolveSiteBySlug because slug contains a dot
    expect(mockResolveSiteBySlug).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe('resolveDashboardSite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves from active-site cookie', async () => {
    mockResolveSiteById.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('admin.example.com', { 'active-site': RESOLVED_SITE.id });
    const result = await resolveDashboardSite(req as never);

    // Must pass allowSuspended=true for dashboard access
    expect(mockResolveSiteById).toHaveBeenCalledWith(RESOLVED_SITE.id, undefined, true);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(RESOLVED_SITE.id);
  });

  it('resolves suspended site from cookie (critical: admin access to suspended sites)', async () => {
    mockResolveSiteById.mockResolvedValueOnce(SUSPENDED_SITE);

    const req = mockRequest('admin.example.com', { 'active-site': SUSPENDED_SITE.id });
    const result = await resolveDashboardSite(req as never);

    // THE critical test: allowSuspended=true must be passed so admins can manage suspended sites
    expect(mockResolveSiteById).toHaveBeenCalledWith(SUSPENDED_SITE.id, undefined, true);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Suspended Store');
  });

  it('falls back to domain resolution when no cookie', async () => {
    mockResolveSiteBySlug.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('cool-sneakers.example.com');
    const result = await resolveDashboardSite(req as never);

    expect(mockResolveSiteBySlug).toHaveBeenCalledWith('cool-sneakers');
    expect(result).not.toBeNull();
  });

  it('falls back when cookie site not found', async () => {
    mockResolveSiteById.mockResolvedValueOnce(null);
    mockResolveSiteBySlug.mockResolvedValueOnce(RESOLVED_SITE);

    const req = mockRequest('cool-sneakers.example.com', { 'active-site': 'deleted-id' });
    const result = await resolveDashboardSite(req as never);

    expect(mockResolveSiteById).toHaveBeenCalledWith('deleted-id', undefined, true);
    expect(mockResolveSiteBySlug).toHaveBeenCalledWith('cool-sneakers');
    expect(result).not.toBeNull();
  });
});
