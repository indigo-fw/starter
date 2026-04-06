'use client';

import { useCallback, useState } from 'react';

export function useBulkSelection(resetKey: string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when filters/page/tab change (adjust state during render — React docs pattern)
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    if (selectedIds.size > 0) setSelectedIds(new Set());
  }

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    toggle,
    selectAll,
    deselectAll,
    selectedCount: selectedIds.size,
  };
}
