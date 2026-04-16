import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockImpl = (fn: unknown, impl: (...args: any[]) => any) =>
  (fn as ReturnType<typeof vi.fn>).mockImplementation(impl);

// ─── parseFrontmatter (pure function — no mocks needed) ─────────────────────

import { parseFrontmatter } from '../content/frontmatter';

describe('parseFrontmatter', () => {
  it('parses title, date, and tags from YAML frontmatter', () => {
    const raw = `---
title: Hello World
date: 2024-01-15
tags: [javascript, typescript]
---
Body content here.`;

    const { frontmatter, content } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({
      title: 'Hello World',
      date: '2024-01-15',
      tags: ['javascript', 'typescript'],
    });
    expect(content).toBe('Body content here.');
  });

  it('extracts content body after frontmatter', () => {
    const raw = `---
title: Test
---
Line one.

Line two.`;

    const { content } = parseFrontmatter(raw);
    expect(content).toBe('Line one.\n\nLine two.');
  });

  it('returns empty frontmatter when no --- delimiters', () => {
    const raw = 'Just some plain text without frontmatter.';
    const { frontmatter, content } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(content).toBe(raw);
  });

  it('handles boolean values (true/false)', () => {
    const raw = `---
noindex: true
hidden: false
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ noindex: boolean; hidden: boolean }>(raw);
    expect(frontmatter.noindex).toBe(true);
    expect(frontmatter.hidden).toBe(false);
  });

  it('handles number values (integers)', () => {
    const raw = `---
order: 42
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ order: number }>(raw);
    expect(frontmatter.order).toBe(42);
    expect(typeof frontmatter.order).toBe('number');
  });

  it('handles array values [a, b, c]', () => {
    const raw = `---
tags: [alpha, beta, gamma]
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ tags: string[] }>(raw);
    expect(frontmatter.tags).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('strips quotes from array items', () => {
    const raw = `---
tags: ["tag one", 'tag two', plain]
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ tags: string[] }>(raw);
    expect(frontmatter.tags).toEqual(['tag one', 'tag two', 'plain']);
  });

  it('strips double-quoted string values', () => {
    const raw = `---
title: "My Title"
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ title: string }>(raw);
    expect(frontmatter.title).toBe('My Title');
  });

  it('strips single-quoted string values', () => {
    const raw = `---
title: 'My Title'
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ title: string }>(raw);
    expect(frontmatter.title).toBe('My Title');
  });

  it('skips lines without a colon', () => {
    const raw = `---
title: Valid
this line has no colon
description: Also valid
---
Content.`;

    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({ title: 'Valid', description: 'Also valid' });
  });

  it('skips keys with empty values', () => {
    const raw = `---
title:
description: Has value
---
Content.`;

    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({ description: 'Has value' });
  });

  it('handles values that contain colons', () => {
    const raw = `---
title: Time is: 12:30
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ title: string }>(raw);
    expect(frontmatter.title).toBe('Time is: 12:30');
  });

  it('handles multiple frontmatter fields of mixed types', () => {
    const raw = `---
title: My Post
type: post
date: 2024-06-01
order: 5
hidden: true
noindex: false
tags: [seo, web]
category: blog
image: /img/hero.jpg
---
# Post body

Some markdown here.`;

    const { frontmatter, content } = parseFrontmatter<Record<string, unknown>>(raw);
    expect(frontmatter.title).toBe('My Post');
    expect(frontmatter.type).toBe('post');
    expect(frontmatter.date).toBe('2024-06-01');
    expect(frontmatter.order).toBe(5);
    expect(frontmatter.hidden).toBe(true);
    expect(frontmatter.noindex).toBe(false);
    expect(frontmatter.tags).toEqual(['seo', 'web']);
    expect(frontmatter.category).toBe('blog');
    expect(frontmatter.image).toBe('/img/hero.jpg');
    expect(content).toBe('# Post body\n\nSome markdown here.');
  });

  it('returns raw string as content when frontmatter is only opening delimiter', () => {
    const raw = `---
title: Incomplete
No closing delimiter`;

    const { frontmatter, content } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(content).toBe(raw);
  });

  it('handles empty frontmatter block', () => {
    const raw = `---

---
Body text.`;

    const { frontmatter, content } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(content).toBe('Body text.');
  });

  it('does not parse decimal numbers as numbers (integers only)', () => {
    const raw = `---
value: 3.14
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ value: string }>(raw);
    // 3.14 does not match /^\d+$/, so it stays a string
    expect(frontmatter.value).toBe('3.14');
    expect(typeof frontmatter.value).toBe('string');
  });

  it('treats zero as a number', () => {
    const raw = `---
order: 0
---
Content.`;

    const { frontmatter } = parseFrontmatter<{ order: number }>(raw);
    expect(frontmatter.order).toBe(0);
    expect(typeof frontmatter.order).toBe('number');
  });
});

// ─── Loader functions (require fs + logger mocks) ───────────────────────────

vi.mock('fs', () => {
  const existsSync = vi.fn();
  const readdirSync = vi.fn();
  const readFileSync = vi.fn();
  const statSync = vi.fn();
  return {
    default: { existsSync, readdirSync, readFileSync, statSync },
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
  };
});

vi.mock('@/lib/constants', () => ({
  DEFAULT_LOCALE: 'en',
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Dynamic import so mocks are established before the module loads
const {
  findFileContent,
  getMdxManagedSlugs,
  invalidateContentCache,
  loadAllFileContent,
} = await import('../content/loader');

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';

function asMock<T extends (...args: unknown[]) => unknown>(fn: T) {
  return fn as unknown as ReturnType<typeof vi.fn>;
}

// Helper: build a fake stat object
function fakeStat(isDir: boolean, mtime = new Date('2024-01-01')) {
  return {
    isDirectory: () => isDir,
    isFile: () => !isDir,
    mtime,
  };
}

describe('loadAllFileContent', () => {
  beforeEach(() => {
    invalidateContentCache();
    vi.clearAllMocks();
  });

  it('returns empty array when content directory does not exist', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = loadAllFileContent();
    expect(result).toEqual([]);
  });

  it('loads .mdx files from locale subdirectories', () => {
    // content/ exists
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    // content/ has one locale dir: 'en'
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      // en/ has one file
      return ['about.mdx'];
    });

    mockImpl(statSync, (p: string) => {
      if (p.includes('en') && !p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false, new Date('2024-03-15'));
    });

    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: About Us
---
About page content.`);

    const result = loadAllFileContent();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('about');
    expect(result[0].frontmatter.title).toBe('About Us');
    expect(result[0].content).toBe('About page content.');
    expect(result[0].locale).toBe('en');
  });

  it('skips ALL-CAPS filenames like CLAUDE.mdx or README.mdx', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['README.mdx', 'CLAUDE.mdx', 'real-page.mdx'];
    });

    mockImpl(statSync, (p: string) => {
      if (p.includes('en') && !p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });

    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Real
---
Content.`);

    const result = loadAllFileContent();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('real-page');
  });

  it('skips non-.mdx files', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['page.mdx', 'notes.txt', 'image.png'];
    });

    mockImpl(statSync, (p: string) => {
      if (p.includes('en') && !p.includes('.')) return fakeStat(true);
      return fakeStat(false);
    });

    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Page
---
Content.`);

    const result = loadAllFileContent();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('page');
  });

  it('derives title from filename when frontmatter has no title', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['my-cool-page.mdx'];
    });

    mockImpl(statSync, (p: string) => {
      if (p.includes('en') && !p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });

    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
description: No title here
---
Content.`);

    const result = loadAllFileContent();
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter.title).toBe('My Cool Page');
  });

  it('uses cache on subsequent calls within TTL', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['page.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (p.includes('en') && !p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Cached
---
Body.`);

    const first = loadAllFileContent();
    const second = loadAllFileContent();

    // existsSync called once for content dir + once for en dir on first call only
    // Second call should hit cache and not call existsSync again for content dir
    expect(first).toBe(second); // same reference = cached
  });
});

describe('findFileContent', () => {
  beforeEach(() => {
    invalidateContentCache();
    vi.clearAllMocks();
  });

  function setupTwoLocales() {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en', 'sk'];
      return ['about.mdx'];
    });

    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });

    mockImpl(readFileSync, (p: string) => {
      if (typeof p === 'string' && p.includes('sk')) {
        return `---
title: O Nas
---
Slovak content.`;
      }
      return `---
title: About Us
---
English content.`;
    });
  }

  it('finds content by exact slug and locale', () => {
    setupTwoLocales();
    const result = findFileContent('about', 'en');
    expect(result).not.toBeNull();
    expect(result!.frontmatter.title).toBe('About Us');
    expect(result!.locale).toBe('en');
  });

  it('falls back to default locale when locale-specific file is missing', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['about.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: About
---
Content.`);

    // Request 'sk' locale but only 'en' exists — should fall back
    const result = findFileContent('about', 'sk');
    expect(result).not.toBeNull();
    expect(result!.locale).toBe('en');
  });

  it('returns null when slug does not exist in any locale', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['about.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: About
---
Content.`);

    const result = findFileContent('nonexistent', 'en');
    expect(result).toBeNull();
  });

  it('returns null for default locale when slug not found', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['about.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: About
---
Content.`);

    const result = findFileContent('missing', 'en', 'en');
    expect(result).toBeNull();
  });
});

describe('getMdxManagedSlugs', () => {
  beforeEach(() => {
    invalidateContentCache();
    vi.clearAllMocks();
  });

  it('returns a Set of slugs for a given locale', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['about.mdx', 'contact.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Page
---
Content.`);

    const slugs = getMdxManagedSlugs('en');
    expect(slugs).toBeInstanceOf(Set);
    expect(slugs.has('about')).toBe(true);
    expect(slugs.has('contact')).toBe(true);
    expect(slugs.size).toBe(2);
  });

  it('returns empty Set for locale with no files', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['page.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Page
---
Content.`);

    const slugs = getMdxManagedSlugs('sk');
    expect(slugs.size).toBe(0);
  });
});

describe('invalidateContentCache', () => {
  beforeEach(() => {
    invalidateContentCache();
    vi.clearAllMocks();
  });

  it('forces a fresh load on next call after invalidation', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockImpl(readdirSync, (dir: string) => {
      if (dir.endsWith('content')) return ['en'];
      return ['page.mdx'];
    });
    mockImpl(statSync, (p: string) => {
      if (!p.includes('.mdx')) return fakeStat(true);
      return fakeStat(false);
    });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Version 1
---
Content.`);

    const first = loadAllFileContent();
    expect(first[0].frontmatter.title).toBe('Version 1');

    // Invalidate and change mock return
    invalidateContentCache();
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`---
title: Version 2
---
Updated.`);

    const second = loadAllFileContent();
    expect(second[0].frontmatter.title).toBe('Version 2');
    expect(first).not.toBe(second);
  });
});
