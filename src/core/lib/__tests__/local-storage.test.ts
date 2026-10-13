import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from '../storage/local-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Simulate Safari private mode / blocked site data: the accessor itself throws. */
function withThrowingAccessor<T>(fn: () => T): T {
  const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
  try {
    return fn();
  } finally {
    if (desc) Object.defineProperty(window, 'localStorage', desc);
  }
}

describe('guarded localStorage', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a value through the real storage', () => {
    setLocalStorageItem('k', 'v');
    expect(getLocalStorageItem('k')).toBe('v');
    removeLocalStorageItem('k');
    expect(getLocalStorageItem('k')).toBeNull();
  });

  it('returns null / no-ops when the localStorage accessor throws', () => {
    withThrowingAccessor(() => {
      expect(() => setLocalStorageItem('k', 'v')).not.toThrow();
      expect(getLocalStorageItem('k')).toBeNull();
      expect(() => removeLocalStorageItem('k')).not.toThrow();
    });
  });

  it('swallows quota errors on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => setLocalStorageItem('k', 'v')).not.toThrow();
  });
});
