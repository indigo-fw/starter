import {
  getCmsOverride,
  getPageCmsOverride,
  initCmsOverrideSync,
  invalidateCmsOverrideCache,
} from '../cms-override';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/server/db';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { limit, publisher, subscriber, redis } = vi.hoisted(() => {
  const limit = vi.fn();
  const publisher = { publish: vi.fn().mockResolvedValue(1) };
  const handlers: Array<(channel: string) => void> = [];
  const subscriber = {
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event: string, handler: (channel: string) => void) => {
      handlers.push(handler);
    }),
    /** Simulate a message arriving from another instance */
    emit: (channel: string) => handlers.forEach((h) => h(channel)),
  };
  const redis = { enabled: true };
  return { limit, publisher, subscriber, redis };
});

vi.mock('@/server/db', () => {
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } };
});

vi.mock('@/server/db/schema/cms', () => ({
  cmsPosts: {
    seoTitle: 'seo_title',
    metaDescription: 'meta_description',
    noindex: 'noindex',
    jsonLd: 'json_ld',
    content: 'content',
  },
}));

vi.mock('@/core/crud/page-seo', () => ({
  publishedPageWhere: vi.fn(() => 'WHERE'),
}));

vi.mock('@/core/lib/i18n/locale-server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
}));

vi.mock('@/core/lib/infra/redis', () => ({
  getPublisher: () => (redis.enabled ? publisher : null),
  getSubscriber: () => (redis.enabled ? subscriber : null),
}));

const ROW = {
  seoTitle: 'Blog',
  metaDescription: 'All posts',
  noindex: false,
  jsonLd: null,
  content: '<p>Hi</p>',
};

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
  limit.mockReset();
  publisher.publish.mockClear();
  // Start every test from an empty cache — the module keeps it across tests
  invalidateCmsOverrideCache();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCmsOverride cache', () => {
  it('queries once, then serves the override from memory', async () => {
    limit.mockResolvedValue([ROW]);

    const first = await getCmsOverride(db, 'blog', 'en');
    const second = await getCmsOverride(db, 'blog', 'en');

    expect(first).toEqual({
      seo: {
        seoTitle: 'Blog',
        metaDescription: 'All posts',
        noindex: false,
        jsonLd: null,
      },
      content: '<p>Hi</p>',
    });
    expect(second).toBe(first);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('caches "no override" so the common case costs zero DB calls', async () => {
    limit.mockResolvedValue([]);

    expect(await getCmsOverride(db, 'pricing', 'en')).toBeNull();
    expect(await getCmsOverride(db, 'pricing', 'en')).toBeNull();
    expect(await getPageCmsOverride('pricing')).toBeNull();

    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('keys by slug and lang', async () => {
    limit.mockResolvedValue([]);

    await getCmsOverride(db, 'blog', 'en');
    await getCmsOverride(db, 'blog', 'de');
    await getCmsOverride(db, 'store', 'en');

    expect(limit).toHaveBeenCalledTimes(3);
  });

  it('expires a hit after 1 h but keeps a miss for 24 h', async () => {
    limit.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);
    await getCmsOverride(db, 'blog', 'en'); // hit
    await getCmsOverride(db, 'pricing', 'en'); // miss
    expect(limit).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(HOUR + 1);
    limit.mockResolvedValue([ROW]);
    await getCmsOverride(db, 'blog', 'en');
    await getCmsOverride(db, 'pricing', 'en');
    expect(limit).toHaveBeenCalledTimes(3); // only the hit was refetched

    vi.advanceTimersByTime(23 * HOUR);
    await getCmsOverride(db, 'pricing', 'en');
    expect(limit).toHaveBeenCalledTimes(4);
  });

  it('does not cache a failed lookup', async () => {
    limit.mockRejectedValueOnce(new Error('db down')).mockResolvedValue([ROW]);

    expect(await getPageCmsOverride('blog')).toBeNull();
    expect(await getPageCmsOverride('blog')).not.toBeNull();
    expect(limit).toHaveBeenCalledTimes(2);
  });
});

describe('invalidation', () => {
  it('clears the local cache and broadcasts to other instances', async () => {
    limit.mockResolvedValue([]);
    await getCmsOverride(db, 'blog', 'en');

    invalidateCmsOverrideCache();
    // The publish rides on the memoized init promise
    await initCmsOverrideSync();
    await Promise.resolve();

    expect(publisher.publish).toHaveBeenCalledWith(
      'cms-override:invalidate',
      '1'
    );

    await getCmsOverride(db, 'blog', 'en');
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it('drops the cache when another instance broadcasts', async () => {
    limit.mockResolvedValue([]);
    await getCmsOverride(db, 'blog', 'en');
    await initCmsOverrideSync();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      'cms-override:invalidate'
    );

    subscriber.emit('some-other-channel');
    await getCmsOverride(db, 'blog', 'en');
    expect(limit).toHaveBeenCalledTimes(1);

    subscriber.emit('cms-override:invalidate');
    await getCmsOverride(db, 'blog', 'en');
    expect(limit).toHaveBeenCalledTimes(2);
  });
});
