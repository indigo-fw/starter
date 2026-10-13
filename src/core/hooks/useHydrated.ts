import { useSyncExternalStore } from 'react';

// Stable no-op subscription: the value never changes after hydration.
const emptySubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true after mount. Gate anything
 * that reads browser-only state (localStorage, `navigator`, media queries) so
 * the first client render matches the server HTML.
 *
 * useSyncExternalStore's server/client snapshot split is the render-safe way
 * to detect hydration — no setState-in-effect, no extra render on mount.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
