/**
 * Guarded localStorage access.
 *
 * Every access is wrapped, not just guarded on `window`: in Safari private
 * browsing and with "block site data" set, the `localStorage` ACCESSOR ITSELF
 * throws (SecurityError) rather than returning null, so a bare
 * `localStorage.getItem` takes the render down with it — and inside an error
 * boundary that means an unrecoverable blank page. Quota errors on write are
 * swallowed for the same reason. Everything stored through here is a
 * per-viewer convenience (theme, dismissed banners, editor layout), so falling
 * back to the default is always the right answer.
 *
 * Client-safe; returns null / no-ops during SSR.
 */

export function getLocalStorageItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLocalStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Unavailable or over quota — per-viewer convenience only.
  }
}

export function removeLocalStorageItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Unavailable — nothing to remove.
  }
}
