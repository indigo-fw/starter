import {
  type TranslationFn,
  createTranslationFunction,
  fillFallback,
  getMessageFallback,
  wrapWithFallback,
} from '../i18n/translation-shared';
import { describe, expect, it } from 'vitest';

/** A next-intl-like `t` backed by a flat catalog, using the shared fallback. */
function fakeNextIntl(catalog: Record<string, string>, namespace: string) {
  return (key: string, values?: Record<string, string | number | Date>) => {
    const msg = catalog[key];
    if (msg === undefined) return getMessageFallback({ key, namespace });
    return msg.replace(/\{(\w+)\}/g, (m, name: string) =>
      values?.[name] === undefined ? m : String(values[name])
    );
  };
}

function build(
  catalog: Record<string, string>,
  namespace = 'General'
): TranslationFn {
  return wrapWithFallback(
    createTranslationFunction(fakeNextIntl(catalog, namespace)),
    namespace
  );
}

describe('fillFallback', () => {
  it('substitutes {name} placeholders from values', () => {
    expect(
      fillFallback('Page {page} of {totalPages}', { page: 2, totalPages: 5 })
    ).toBe('Page 2 of 5');
  });

  it('substitutes %d and %s from count', () => {
    expect(fillFallback('%d items', { count: 3 })).toBe('3 items');
    expect(fillFallback('%s business days', { count: 4 })).toBe(
      '4 business days'
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(fillFallback('Hello {name}, {missing}', { name: 'Ada' })).toBe(
      'Hello Ada, {missing}'
    );
  });

  it('returns text unchanged without values', () => {
    expect(fillFallback('Page {page}')).toBe('Page {page}');
  });
});

describe('getMessageFallback', () => {
  it('yields the same Namespace.key form regardless of NODE_ENV', () => {
    expect(
      getMessageFallback({ key: 'Hello@@@ world', namespace: 'General' })
    ).toBe('General.Hello@@@ world');
    expect(getMessageFallback({ key: 'Hello' })).toBe('Hello');
  });
});

describe('wrapWithFallback', () => {
  it('fills values on a missing key instead of rendering the template', () => {
    const __ = build({});
    expect(__('Page {page} of {totalPages}', { page: 2, totalPages: 5 })).toBe(
      'Page 2 of 5'
    );
  });

  it('returns the translated message unchanged when the key exists', () => {
    const __ = build({
      'Page {page} of {totalPages}': 'Seite {page} von {totalPages}',
    });
    expect(__('Page {page} of {totalPages}', { page: 2, totalPages: 5 })).toBe(
      'Seite 2 von 5'
    );
  });

  it('restores dots in a missing key (the @@@ transform is lookup-only)', () => {
    const __ = build({});
    expect(__('Saved. Reload to continue.')).toBe('Saved. Reload to continue.');
  });

  it('does not treat a real translation starting with the namespace as missing', () => {
    const __ = build({ About: 'General.About us' });
    expect(__('About')).toBe('General.About us');
  });

  it('_n picks singular/plural and fills count on a missing key', () => {
    const __ = build({});
    expect(__._n('1 item', '%d items', 1)).toBe('1 item');
    expect(__._n('1 item', '%d items', 4)).toBe('4 items');
    expect(__._n('{count} file', '{count} files', 3)).toBe('3 files');
  });

  it('_x drops the context and fills values on a missing key', () => {
    const __ = build({});
    expect(__._x('Post {n}', 'verb', { n: 1 })).toBe('Post 1');
  });

  it('_x returns the context-specific translation when present', () => {
    const __ = build({ 'Post::verb': 'Veröffentlichen' });
    expect(__._x('Post', 'verb')).toBe('Veröffentlichen');
  });

  it('falls back to filled English when the wrapped function throws', () => {
    const throwing = createTranslationFunction(() => {
      throw new Error('ICU parse error');
    });
    const __ = wrapWithFallback(throwing, 'General');
    expect(__('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
    expect(__._n('1 item', '%d items', 2)).toBe('2 items');
    expect(__._x('Hi {name}', 'greeting', { name: 'Ada' })).toBe('Hi Ada');
  });
});
