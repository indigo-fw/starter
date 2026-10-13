import { dataTranslations, useBlankTranslations } from '../i18n/translations';
import { describe, expect, it } from 'vitest';

describe('useBlankTranslations', () => {
  // Plain function (no React state), so calling it outside a component is fine.
  const __ = useBlankTranslations();

  it('fills {values} instead of returning the raw template', () => {
    expect(__('Page {page} of {totalPages}', { page: 2, totalPages: 5 })).toBe(
      'Page 2 of 5'
    );
  });

  it('returns plain keys unchanged', () => {
    expect(__('Add to cart')).toBe('Add to cart');
  });

  it('_n fills count', () => {
    expect(__._n('1 item', '{count} items', 3)).toBe('3 items');
    expect(__._n('1 item', '{count} items', 1)).toBe('1 item');
  });

  it('_x ignores context and fills values', () => {
    expect(__._x('Hello {name}', 'greeting', { name: 'Ada' })).toBe(
      'Hello Ada'
    );
  });

  it('dataTranslations shares the same behaviour', () => {
    expect(dataTranslations('General')('Hi {name}', { name: 'Bo' })).toBe(
      'Hi Bo'
    );
  });
});
