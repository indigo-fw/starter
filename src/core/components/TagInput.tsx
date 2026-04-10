'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';

interface Props {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  lang?: string;
}

interface TagOption {
  id: string;
  name: string;
  slug: string;
}

export function TagInput({ selectedTagIds, onChange, lang = 'en' }: Props) {
  const __ = useAdminTranslations();
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track selected tags with full info
  const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);

  // Debounce search input
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (inputValue.length < 1) {
      // Synchronous reset handled via adjust-state-during-render below
      return;
    }
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(inputValue), 250);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [inputValue]);

  // Immediately clear debounced query when input is too short (adjust state during render)
  if (inputValue.length < 1 && debouncedQuery !== '') {
    setDebouncedQuery('');
  }

  // Search for autocomplete (now returns count)
  const searchQuery = trpc.tags.search.useQuery(
    { query: debouncedQuery, lang, limit: 10 },
    { enabled: debouncedQuery.length >= 1 }
  );

  // Get or create mutation
  const getOrCreate = trpc.tags.getOrCreate.useMutation();

  // Resolve selected tag IDs to full info
  const resolvedTags = trpc.tags.getByIds.useQuery(
    { ids: selectedTagIds },
    { enabled: selectedTagIds.length > 0 }
  );

  // Sync selected tags when resolved data loads or selectedTagIds change (adjust state during render)
  const [prevResolvedData, setPrevResolvedData] = useState(resolvedTags.data);
  const [prevSelectedTagIds, setPrevSelectedTagIds] = useState(selectedTagIds);
  if (resolvedTags.data && (resolvedTags.data !== prevResolvedData || selectedTagIds !== prevSelectedTagIds)) {
    setPrevResolvedData(resolvedTags.data);
    setPrevSelectedTagIds(selectedTagIds);
    // Preserve order of selectedTagIds
    const tagMap = new Map(resolvedTags.data.map((t) => [t.id, t]));
    const ordered = selectedTagIds
      .map((id) => tagMap.get(id))
      .filter((t): t is TagOption => !!t);
    setSelectedTags(ordered);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const suggestions = (searchQuery.data ?? []).filter(
    (t) => !selectedTagIds.includes(t.id)
  );

  // Reset highlighted index when suggestions change (adjust state during render)
  const [prevSuggestionsLength, setPrevSuggestionsLength] = useState(suggestions.length);
  if (suggestions.length !== prevSuggestionsLength) {
    setPrevSuggestionsLength(suggestions.length);
    setHighlightedIndex(-1);
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-suggestion]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const addTag = useCallback(
    async (tag: TagOption) => {
      if (!selectedTagIds.includes(tag.id)) {
        onChange([...selectedTagIds, tag.id]);
        setSelectedTags((prev) => [...prev, tag]);
      }
      setInputValue('');
      setShowDropdown(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [selectedTagIds, onChange]
  );

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        const tag = suggestions[highlightedIndex]!;
        addTag({ id: tag.id, name: tag.name, slug: tag.slug });
      } else if (inputValue.trim()) {
        const result = await getOrCreate.mutateAsync({
          name: inputValue.trim(),
          lang,
        });
        addTag({ id: result.id, name: result.name, slug: result.slug });
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  }

  function removeTag(tagId: string) {
    onChange(selectedTagIds.filter((id) => id !== tagId));
    setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="tag-input-chips mb-2 flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="tag-input-chip inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)] px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-400"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-brand-200 dark:hover:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.25)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="tag-input-wrapper relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => inputValue.length >= 1 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={__('Type to add tags...')}
          className="input py-1.5"
        />
        {getOrCreate.isPending && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-(--text-muted)" />
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && inputValue.length >= 1 && (
        <div
          ref={dropdownRef}
          className="tag-input-dropdown absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-(--border-primary) bg-(--surface-primary) shadow-lg"
        >
          {searchQuery.isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-(--text-muted)" />
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((tag, index) => (
              <button
                key={tag.id}
                type="button"
                data-suggestion
                onClick={() =>
                  addTag({ id: tag.id, name: tag.name, slug: tag.slug })
                }
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                  index === highlightedIndex
                    ? 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)] text-brand-700 dark:text-brand-400'
                    : 'hover:bg-(--surface-secondary)'
                }`}
              >
                <span>{tag.name}</span>
                <span className="tag-input-count ml-2 rounded-full bg-(--surface-secondary) px-1.5 py-0.5 text-xs text-(--text-muted)">
                  {Number(tag.count)}
                </span>
              </button>
            ))
          ) : (
            <div className="tag-input-hint px-3 py-2 text-xs text-(--text-muted)">
              {__('Press Enter to create "')}
              {inputValue}
              {__('"')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
