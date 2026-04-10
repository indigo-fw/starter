'use client';

import { memo, useRef, useState, useEffect } from 'react';

import { FileText, Search } from 'lucide-react';

import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Dialog } from '@/core/components/Dialog';

export type TypeConfig = Record<string, { label: string; icon: typeof FileText; color: string }>;

const DEFAULT_TYPE_CONFIG = { label: 'Content', icon: FileText, color: 'bg-gray-600' };

interface InternalLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (title: string, url: string) => void;
  typeConfig?: TypeConfig;
}

interface DialogContentProps {
  onClose: () => void;
  onSelect: (title: string, url: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  typeConfig: TypeConfig;
}

function DialogContent({ onClose, onSelect, searchInputRef, typeConfig }: DialogContentProps) {
  const __ = useAdminTranslations();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Clear debounced query immediately when query is too short
  if (query.length < 2 && debouncedQuery !== '') {
    setDebouncedQuery('');
  }

  // Debounce query → debouncedQuery
  useEffect(() => {
    if (query.length < 2) return;
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading } = trpc.contentSearch.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  return (
    <>
      <Dialog.Header onClose={onClose}>{__('Insert Internal Link')}</Dialog.Header>
      <Dialog.Body>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={__('Search pages, blog posts, categories...')}
            className="input rounded-lg py-2 pl-10 pr-4"
          />
        </div>

        <div className="mt-4 max-h-80 min-h-[120px] overflow-y-auto">
          {isLoading && debouncedQuery.length >= 2 && (
            <div className="flex items-center justify-center py-8 text-(--text-muted)">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-brand-400" />
              <span className="ml-2">{__('Searching...')}</span>
            </div>
          )}

          {!isLoading && debouncedQuery.length >= 2 && results?.length === 0 && (
            <div className="py-8 text-center text-(--text-muted)">{__('No results found')}</div>
          )}

          {!isLoading && debouncedQuery.length < 2 && (
            <div className="py-8 text-center text-(--text-muted)">{__('Type at least 2 characters to search')}</div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, idx) => {
                const config = typeConfig[result.type] ?? DEFAULT_TYPE_CONFIG;
                const Icon = config.icon;
                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    type="button"
                    onClick={() => onSelect(result.title, result.url)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-(--surface-secondary)"
                  >
                    <Icon size={16} className="shrink-0 text-(--text-muted)" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-(--text-primary)">{result.title}</div>
                      <div className="truncate text-xs text-(--text-muted)">{result.url}</div>
                    </div>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs text-white', config.color)}>
                      {__(config.label)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Dialog.Body>
      <Dialog.Footer>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-secondary"
        >
          {__('Cancel')}
        </button>
      </Dialog.Footer>
    </>
  );
}

function InternalLinkDialog({ isOpen, onClose, onSelect, typeConfig = {} }: InternalLinkDialogProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg" initialFocusRef={searchInputRef}>
      {isOpen && (
        <DialogContent
          onClose={onClose}
          onSelect={onSelect}
          searchInputRef={searchInputRef}
          typeConfig={typeConfig}
        />
      )}
    </Dialog>
  );
}

export default memo(InternalLinkDialog);
