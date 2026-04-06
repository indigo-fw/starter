'use client';

import { useCallback, useMemo } from 'react';

import { usePreferencesStore } from '@/core/store/preferences-store';
import type { PreferenceKey } from '@/core/types/preferences';

const STORAGE_PREFIX = 'cms-col-vis:';
const DEFAULT_VISIBLE = ['title', 'status', 'lang', 'date'];

/** Read from localStorage as fallback */
function readLocalStorage(fullKey: string): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(fullKey);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

export function useColumnVisibility(storageKey: string) {
  const localKey = `${STORAGE_PREFIX}${storageKey}`;
  const prefKey: PreferenceKey = `listView.columns.${storageKey}`;
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const prefValue = usePreferencesStore((s) => s.data[prefKey]);
  const setPreference = usePreferencesStore((s) => s.set);

  // Resolve: DB (if hydrated + exists) → localStorage fallback → defaults
  const columns = useMemo(() => {
    if (hydrated && Array.isArray(prefValue)) return prefValue as string[];
    return readLocalStorage(localKey) ?? DEFAULT_VISIBLE;
  }, [hydrated, prefValue, localKey]);

  const visible = useMemo(() => new Set(columns), [columns]);

  const toggle = useCallback(
    (col: string) => {
      const next = new Set(visible);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      const arr = [...next];

      // Write to preferences store (persists to DB)
      setPreference(prefKey, arr);

      // Also write to localStorage as backup
      try {
        localStorage.setItem(localKey, JSON.stringify(arr));
      } catch {}
    },
    [visible, setPreference, prefKey, localKey]
  );

  const isVisible = useCallback((col: string) => visible.has(col), [visible]);

  return { visible, toggle, isVisible };
}
