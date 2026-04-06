import { create } from 'zustand';

import type { PreferenceData, PreferenceKey, PreferenceValueMap } from '@/core/types/preferences';

type PersistFn = (key: string, value: unknown) => void;

interface PreferencesState {
  data: PreferenceData;
  hydrated: boolean;
  _persist: PersistFn | null;

  /** Called once by hydrator component */
  hydrate: (data: PreferenceData, persistFn: PersistFn) => void;

  /** Typed get with fallback */
  get: <K extends PreferenceKey>(key: K, fallback: PreferenceValueMap[K]) => PreferenceValueMap[K];

  /** Optimistic set + fire-and-forget persist */
  set: (key: PreferenceKey, value: unknown) => void;

  /** Batch set multiple keys */
  setBatch: (entries: Record<string, unknown>) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  data: {},
  hydrated: false,
  _persist: null,

  hydrate: (data, persistFn) => {
    set({ data, hydrated: true, _persist: persistFn });
  },

  get: (key, fallback) => {
    const val = get().data[key];
    if (val === undefined || val === null) return fallback;
    return val as typeof fallback;
  },

  set: (key, value) => {
    set((s) => ({ data: { ...s.data, [key]: value } }));
    get()._persist?.(key, value);
  },

  setBatch: (entries) => {
    set((s) => ({ data: { ...s.data, ...entries } }));
    const persist = get()._persist;
    if (persist) {
      for (const [k, v] of Object.entries(entries)) {
        persist(k, v);
      }
    }
  },
}));
