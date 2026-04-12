'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';

interface Props {
  /** Post ID (null for new posts — buffer state until onSave is called) */
  postId: string | null;
  contentType: string;
  /** Ref for parent form to call after post create/update */
  onSaveRef: React.MutableRefObject<((postId: string) => Promise<void>) | null>;
}

/**
 * Self-contained author picker panel for PostForm.
 * Manages its own state and saves via its own tRPC endpoints.
 */
export function AuthorPickerPanel({ postId, contentType, onSaveRef }: Props) {
  const __ = useAdminTranslations();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Accumulate author names across searches (survives re-fetches)
  const cacheMapRef = useRef(new Map<string, { id: string; name: string }>());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch candidates
  const candidates = trpc.authors.candidates.useQuery(
    { search: debouncedSearch || undefined },
    {
      placeholderData: (prev) => prev,
      select(data) {
        // Side-effect in select: populate cache as data arrives
        for (const a of data) {
          cacheMapRef.current.set(a.id, { id: a.id, name: a.name });
        }
        return data;
      },
    },
  );

  // Load existing relationships for edit mode
  const existingRels = trpc.authors.getRelationships.useQuery(
    { objectId: postId!, contentType },
    { enabled: !!postId },
  );

  // Sync selectedIds when existing relationships load (only on first load)
  const relsInitialized = useRef(false);
  if (existingRels.data && !relsInitialized.current) {
    relsInitialized.current = true;
    // Safe: this runs once before first paint with this data
    setSelectedIds(existingRels.data);
  }

  // Sync mutation
  const syncMutation = trpc.authors.syncRelationships.useMutation();

  // Save handler — parent form calls this after post create/update
  const save = useCallback(
    async (id: string) => {
      await syncMutation.mutateAsync({
        objectId: id,
        contentType,
        authorIds: selectedIds,
      });
    },
    [syncMutation, contentType, selectedIds],
  );

  // Expose save to parent
  useEffect(() => {
    onSaveRef.current = save;
    return () => { onSaveRef.current = null; };
  }, [save, onSaveRef]);

  function toggle(authorId: string) {
    setSelectedIds((prev) =>
      prev.includes(authorId)
        ? prev.filter((id) => id !== authorId)
        : [...prev, authorId],
    );
  }

  const allCandidates = candidates.data ?? [];
  const selectedSet = new Set(selectedIds);
  const selectedAuthors = useMemo(
    () => selectedIds
      .map((id) => cacheMapRef.current.get(id))
      .filter(Boolean) as { id: string; name: string }[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheMapRef.current is stable, re-derive when selectedIds or candidates change
    [selectedIds, candidates.data],
  );
  const unselectedAuthors = allCandidates.filter((a) => !selectedSet.has(a.id));

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={__('Search authors...')}
        className="input w-full text-sm"
      />
      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {candidates.isLoading && allCandidates.length === 0 && selectedAuthors.length === 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-(--text-muted)" />
        ) : selectedAuthors.length === 0 && unselectedAuthors.length === 0 ? (
          <p className="text-xs text-(--text-muted)">{__('No authors found. Create one first.')}</p>
        ) : (
          <>
            {selectedAuthors.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggle(a.id)}
                  className="rounded border-(--border-primary)"
                />
                {a.name}
              </label>
            ))}
            {selectedAuthors.length > 0 && unselectedAuthors.length > 0 && (
              <hr className="border-(--border-primary)" />
            )}
            {unselectedAuthors.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggle(a.id)}
                  className="rounded border-(--border-primary)"
                />
                {a.name}
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
