'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface CmsAutosaveConfig<T> {
  contentTypeId: string;
  contentId: string | null;
  formData: T;
  initialData: T;
  dbUpdatedAt: string | Date | null;
  saving: boolean;
  /** Pass true while the existing content is still loading — delays recovery. */
  loading?: boolean;
}

interface StoredAutosave<T> {
  formData: T;
  savedAt: number;
  dbUpdatedAt: string | null;
}

interface RecoveredData<T> {
  formData: T;
  savedAt: number;
}

function getStorageKey(
  contentTypeId: string,
  contentId: string | null
): string {
  return `cms-autosave:${contentTypeId}:${contentId ?? 'new'}`;
}

function normalizeDbUpdatedAt(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isFormDirty<T extends Record<string, unknown>>(
  current: T,
  baseline: T
): boolean {
  const keys = Object.keys(current) as (keyof T)[];
  for (const key of keys) {
    const a = current[key];
    const b = baseline[key];

    // Both nullish
    if (a == null && b == null) continue;

    // Primitives
    if (typeof a !== 'object' && typeof b !== 'object') {
      if (a !== b) return true;
      continue;
    }

    // Arrays/objects — JSON compare
    if (JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}

const DEBOUNCE_MS = 3000;

export function useCmsAutosave<T extends Record<string, unknown>>({
  contentTypeId,
  contentId,
  formData,
  initialData,
  dbUpdatedAt,
  saving,
  loading = false,
}: CmsAutosaveConfig<T>) {
  const storageKey = getStorageKey(contentTypeId, contentId);
  const [baseline, setBaseline] = useState<T>(initialData);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAttemptedRecovery = useRef(false);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null);
  const [recoveredData, setRecoveredData] = useState<RecoveredData<T> | null>(
    null
  );

  const isDirty = isFormDirty(formData, baseline);
  const normalizedDbUpdatedAt = normalizeDbUpdatedAt(dbUpdatedAt);

  // Sync baseline when initialData changes (e.g. query data loads, post-save refetch)
  useEffect(() => {
    setBaseline(initialData);
  }, [initialData]);

  // Recovery — waits for existing content to load before attempting
  useEffect(() => {
    if (loading || hasAttemptedRecovery.current) return;
    hasAttemptedRecovery.current = true;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const stored: StoredAutosave<T> = JSON.parse(raw);

      // Discard if dbUpdatedAt changed (stale after revision restore / another user's save)
      if (stored.dbUpdatedAt !== normalizedDbUpdatedAt) {
        localStorage.removeItem(storageKey);
        return;
      }

      // Discard if data matches initial
      if (!isFormDirty(stored.formData, initialData)) {
        localStorage.removeItem(storageKey);
        return;
      }

      setRecoveredData({ formData: stored.formData, savedAt: stored.savedAt });
    } catch {
      // Corrupted data — remove it
      localStorage.removeItem(storageKey);
    }
  }, [loading, storageKey, normalizedDbUpdatedAt, initialData]);

  // Autosave effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!isDirty || saving) return;

    debounceRef.current = setTimeout(() => {
      try {
        const payload: StoredAutosave<T> = {
          formData,
          savedAt: Date.now(),
          dbUpdatedAt: normalizedDbUpdatedAt,
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
        setLastAutosaveAt(payload.savedAt);
      } catch {
        // localStorage quota exceeded — silently degrade
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [formData, isDirty, saving, storageKey, normalizedDbUpdatedAt]);

  // beforeunload guard
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const acceptRecovery = useCallback(() => {
    setRecoveredData(null);
  }, []);

  const dismissRecovery = useCallback(() => {
    setRecoveredData(null);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const clearAutosave = useCallback(
    (currentFormData: T) => {
      localStorage.removeItem(storageKey);
      setLastAutosaveAt(null);
      // Reset baseline to current form data to prevent post-save sync from re-triggering dirty
      setBaseline(currentFormData);
    },
    [storageKey]
  );

  return {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  };
}
